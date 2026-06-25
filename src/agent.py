import os
import re
import json
import time
import logging
import requests
from typing import Dict, Any, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

from google import genai
from google.genai import types
from langgraph.graph import StateGraph, END

from src.config import settings
from src.services.executor import run_tests

logger = logging.getLogger(__name__)

def retry_api_call(func, *args, max_attempts=5, initial_wait=2, backoff_factor=2, **kwargs):
    """
    Retries an API call with exponential backoff for transient errors (429, 5xx, or specific API errors).
    """
    attempt = 0
    wait = initial_wait
    while True:
        try:
            return func(*args, **kwargs)
        except Exception as e:
            attempt += 1
            if attempt >= max_attempts:
                raise e
            
            # Check if the error is retryable
            err_msg = str(e).lower()
            is_retryable = False
            
            # 1. Check Gemini API errors
            if "genai" in type(e).__module__ or "APIError" in type(e).__name__:
                status_code = getattr(e, "code", None) or getattr(e, "status", None)
                if status_code in (429, 500, 502, 503, 504) or any(msg in err_msg for msg in ["503", "429", "temporary", "quota", "rate limit", "overloaded", "unavailable"]):
                    is_retryable = True
            
            # 2. Check requests errors (Groq, OpenRouter, Ollama)
            elif isinstance(e, requests.RequestException):
                status_code = None
                if e.response is not None:
                    status_code = e.response.status_code
                if status_code in (429, 500, 502, 503, 504) or any(msg in err_msg for msg in ["503", "429", "rate limit", "overloaded"]):
                    is_retryable = True
                elif isinstance(e, (requests.exceptions.ConnectionError, requests.exceptions.Timeout)):
                    is_retryable = True
            
            # 3. General check
            elif any(msg in err_msg for msg in ["rate limit", "429", "503", "502", "500", "overloaded", "unavailable", "timeout"]):
                is_retryable = True
                
            if not is_retryable:
                raise e
                
            print(f"[Agent] API call failed with {type(e).__name__}: {e}. Retrying in {wait}s (attempt {attempt}/{max_attempts})...")
            time.sleep(wait)
            wait *= backoff_factor

# State definition
class AgentState(TypedDict):
    scraped_text: str
    use_case: str
    language: str
    model_provider: str
    gemini_key: Optional[str]
    gemini_model: Optional[str]
    groq_key: Optional[str]
    groq_model: Optional[str]
    openrouter_key: Optional[str]
    openrouter_model: Optional[str]
    firecrawl_key: Optional[str]
    retry_count: int
    error_logs: str
    overview: str
    endpoints: str
    code: str
    tests: str
    readme: str
    test_passed: bool

# Output model for Gemini structured JSON
class APIIntegrationOutput(BaseModel):
    overview: str = Field(..., description="Details on authentication methods and recommendation on REST vs SDK integration path.")
    endpoints: str = Field(..., description="Interactive structured list of endpoints, including URLs, parameters, headers, and payload structures.")
    code: str = Field(..., description="The complete, production-ready, type-safe API client wrapper class.")
    tests: str = Field(..., description="The unit tests code suite designed to test the client wrapper class.")
    readme: str = Field(..., description="Markdown usage instructions and setup guide for the wrapper.")

# Output model for pre-generation validation
class APIValidationOutput(BaseModel):
    has_rest_apis: bool = Field(..., description="True if the text contains actual REST API endpoints, HTTP routes, paths, or API specifications. False if it is just a landing page, marketing text, generic tutorials, or contains no endpoints.")
    explanation: str = Field(..., description="A brief explanation of why the document does or does not contain REST APIs or specifications.")

def parse_json_response(response_text: str, provider: str = "model") -> Dict[str, Any]:
    """
    Defensively extracts and parses a JSON object from a model's response.
    """
    cleaned_text = response_text.strip()
    
    # 1. Try parsing directly
    try:
        return json.loads(cleaned_text)
    except json.JSONDecodeError:
        pass
    
    # 2. Try extracting markdown json block
    match = re.search(r"```json\s*(.*?)\s*```", cleaned_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
            
    # 3. Try finding the first '{' and last '}'
    start = cleaned_text.find('{')
    end = cleaned_text.rfind('}')
    if start != -1 and end != -1:
        try:
            return json.loads(cleaned_text[start:end+1].strip())
        except json.JSONDecodeError:
            pass
            
    # Check if the JSON appears to be truncated (e.g. no closing '}' at the end of the text)
    is_truncated = False
    if cleaned_text and not cleaned_text.endswith('}'):
        is_truncated = True
        
    error_msg = f"Failed to parse JSON response from {provider}."
    if is_truncated:
        error_msg += " The response appears to be truncated (it does not end with a closing brace '}')."
    
    error_msg += f" Raw response:\n{response_text}"
    raise ValueError(error_msg)

def validate_documentation(
    scraped_text: str,
    model_provider: str,
    gemini_key: Optional[str] = None,
    gemini_model: Optional[str] = None,
    groq_key: Optional[str] = None,
    groq_model: Optional[str] = None,
    openrouter_key: Optional[str] = None,
    openrouter_model: Optional[str] = None
):
    """
    Validates that the scraped text contains actual REST API specifications or endpoints.
    If not, raises a ValueError with an explanation.
    """
    sample_text = scraped_text[:15000].strip()
    if not sample_text:
        raise ValueError("Documentation content is empty. Please provide valid API reference content.")

    validation_prompt = f"""You are a senior API architect. Analyze the following scraped text from a documentation source and determine if it contains actual REST API endpoint specifications (such as HTTP methods: GET, POST, PUT, DELETE, etc., endpoint paths/routes, request headers, parameters, or JSON payload structures).

If the text contains actual REST API endpoint specifications or routes, set "has_rest_apis" to true.
If the text is just a high-level landing page, generic documentation, tutorials without endpoint paths, marketing text, or contains no actual REST API endpoints/routes, set "has_rest_apis" to false.

DOCUMENTATION CONTENT:
{sample_text}
"""

    has_rest_apis = True
    explanation = ""

    if model_provider == "gemini":
        g_key = gemini_key or settings.gemini_api_key
        g_model = gemini_model or "gemini-2.5-flash"
        if not g_key:
            raise ValueError("Google Gemini API Key is required but not provided. Please supply one in your configuration or UI.")
        
        client = genai.Client(api_key=g_key)
        response = retry_api_call(
            client.models.generate_content,
            model=g_model,
            contents=validation_prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=APIValidationOutput,
                temperature=0.0,
            ),
        )
        parsed = response.parsed
        has_rest_apis = parsed.has_rest_apis
        explanation = parsed.explanation

    elif model_provider == "groq":
        g_key = groq_key or settings.groq_api_key
        g_model = groq_model or "llama-3.3-70b-versatile"
        if not g_key:
            raise ValueError("Groq API Key is required but not provided. Please supply one in your configuration or UI.")
            
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {g_key}",
            "Content-Type": "application/json"
        }
        
        prompt_with_format = validation_prompt + "\n\nCRITICAL: Return ONLY a valid JSON object matching this schema:\n" + json.dumps({
            "has_rest_apis": "boolean (True if the text contains actual REST API endpoints, HTTP routes, paths, or API specifications)",
            "explanation": "string (Brief explanation of why)"
        }, indent=2)
        
        payload = {
            "model": g_model,
            "messages": [
                {"role": "user", "content": prompt_with_format}
            ],
            "temperature": 0.0,
            "max_tokens": 1000,
            "response_format": {"type": "json_object"}
        }
        
        response = retry_api_call(requests.post, url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        result = response.json()
        response_text = result["choices"][0]["message"]["content"]
        
        parsed = parse_json_response(response_text, f"Groq validation ({g_model})")
        has_rest_apis = parsed.get("has_rest_apis", True)
        explanation = parsed.get("explanation", "")

    elif model_provider == "ollama":
        prompt_with_format = validation_prompt + "\n\nCRITICAL: Return ONLY a valid JSON object matching this schema:\n" + json.dumps({
            "has_rest_apis": "boolean (True if the text contains actual REST API endpoints, HTTP routes, paths, or API specifications)",
            "explanation": "string (Brief explanation of why)"
        }, indent=2)
        
        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        payload = {
            "model": "qwen2.5-coder",
            "prompt": prompt_with_format,
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0.0,
                "num_predict": 1000
            }
        }
        
        response = retry_api_call(requests.post, url, json=payload, timeout=60)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "")
        
        parsed = parse_json_response(response_text, "Ollama validation")
        has_rest_apis = parsed.get("has_rest_apis", True)
        explanation = parsed.get("explanation", "")

    elif model_provider == "openrouter":
        or_key = openrouter_key or settings.openrouter_api_key
        or_model = openrouter_model or "openrouter/free"
        if not or_key:
            raise ValueError("OpenRouter API Key is required but not provided. Please supply one in your configuration or UI.")
            
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {or_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Yashwant00CR7/Smart-API-Integration-Dev-Tool",
            "X-Title": "Smart API DevTool"
        }
        
        prompt_with_format = validation_prompt + "\n\nCRITICAL: Return ONLY a valid JSON object matching this schema:\n" + json.dumps({
            "has_rest_apis": "boolean (True if the text contains actual REST API endpoints, HTTP routes, paths, or API specifications)",
            "explanation": "string (Brief explanation of why)"
        }, indent=2)
        
        payload = {
            "model": or_model,
            "messages": [
                {"role": "user", "content": prompt_with_format}
            ],
            "temperature": 0.0,
            "max_tokens": 1000
        }
        
        response = retry_api_call(requests.post, url, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        result = response.json()
        response_text = result["choices"][0]["message"]["content"]
        
        parsed = parse_json_response(response_text, f"OpenRouter validation ({or_model})")
        has_rest_apis = parsed.get("has_rest_apis", True)
        explanation = parsed.get("explanation", "")

    if not has_rest_apis:
        raise ValueError(
            f"REST APIs or specifications were not found in the scraped content. "
            f"Explanation: {explanation} "
            f"Please provide a different URL or paste the raw REST API specifications directly."
        )

LANGUAGE_SPECS = {
    "python": {
        "framework": "pytest/unittest",
        "import_instruction": "Import the client wrapper from the 'client' module (e.g., `from client import MyAPIClient`).",
        "rules": [
            "DO NOT use class-level static decorators (e.g., @retry) on instance methods when retry/timeout configuration is dynamic. Instead, instantiate the retrier dynamically inside the instance method (e.g., using tenacity.Retrying) to respect self.max_retries and self.timeout.",
            "Ensure mock side_effect lists have enough elements to match maximum attempts (e.g., max_retries + 1) to prevent mock iterator exhaustion (StopIteration).",
            "DO NOT import or use third-party mocking libraries (e.g., requests_mock, responses). ONLY use the Python standard library's `unittest.mock` module (such as `patch` and `MagicMock`) for all request mocking.",
            "Ensure transient network errors (such as connection timeouts and connection errors) are included in the retrier's retry-conditions alongside rate limits (429) and server errors (5xx).",
            "Use tenacity.Retrying as a dynamic context wrapper directly (e.g., `retrier = Retrying(...)` and `return retrier(lambda: ...)` or similar) rather than defining dynamic inner decorator functions.",
            "Ensure exception regex string patterns in tests (e.g., `assertRaisesRegex`) exactly match the formatting of messages raised by the client wrapper class (do not assume extra prefixes or text unless present in both).",
            "When mocking `requests.exceptions.HTTPError` in unit tests, always initialize it with a descriptive message string matching the HTTP status (e.g., `requests.exceptions.HTTPError('500 Server Error...', response=mock_response)`) so that `str(e)` does not return empty.",
            "Wrap any JSON parsing (e.g., `response.json()`) in a try-except block to catch `ValueError` / `json.JSONDecodeError` and raise your custom API exception (e.g., ChargesAPIError), ensuring JSON parsing errors do not bubble up as raw ValueErrors."
        ]
    },
    "javascript": {
        "framework": "standard built-in assert module and node.js",
        "import_instruction": "Import the client class from `./client` using a named import (e.g., `const { MyClientClass } = require('./client');`).",
        "rules": [
            "DO NOT use ES6 module import/export syntax. Use CommonJS require() and module.exports instead.",
            "DO NOT use the 'import' keyword or the 'import()' function anywhere in either the client or the test code.",
            "In the client code, always export the client class as a named property of module.exports matching the class name (e.g. `module.exports = { MyClientClass };`). In the test code, always import using named destructuring: `const { MyClientClass } = require('./client');`.",
            "DO NOT require or import any third-party npm packages (such as node-fetch, loglevel, axios, lodash, etc.) in either the client or test script. Use only standard Node.js built-in modules (e.g. assert, fs, path).",
            "DO NOT use Node's built-in http or https modules to perform network requests. You MUST use the global fetch API (fetch() or globalThis.fetch()) directly. DO NOT require or import fetch; it is globally available in Node.js v18+.",
            "DO NOT use global test functions or runners like describe(), it(), test(), before(), or after(). Write the tests inside a single top-level async function execution harness `async function runTests() { ... } runTests();`. Wrap all assertions inside a single try/catch block. If any error or assertion fails, log the error and call `process.exit(1)`. If all tests pass, call `process.exit(0)`. Ensure every asynchronous client call is awaited inside this block.",
            "To mock HTTP responses, assign a mock function directly to globalThis.fetch inside the test script instead of using external mock packages.",
            "Wrap any JSON parsing (e.g., `await response.json()`) in a try-catch block to handle syntax errors, throwing a custom descriptive error."
        ]
    },
    "typescript": {
        "framework": "ts-node execution with standard assert",
        "import_instruction": "Import the client class from `./client` using named imports (e.g. `import { MyClientClass } from './client';`).",
        "rules": [
            "DO NOT use third-party test libraries (e.g. Jest, Mocha, Expect). Write tests as a self-contained TypeScript file using the built-in assert module.",
            "In the client code, export the class using named export (e.g. `export class MyClientClass { ... }`). In the test code, import it accordingly (e.g. `import { MyClientClass } from './client';`).",
            "DO NOT import or require any third-party npm packages (such as node-fetch, loglevel, axios, etc.) in the client or test script.",
            "DO NOT use Node's built-in http or https modules to perform network requests. You MUST use the global fetch API (fetch() or globalThis.fetch()) directly. DO NOT import fetch; it is globally available in Node.js v18+.",
            "DO NOT use global test runner functions like describe(), it(), test(), before(), or after(). Write tests inside a single top-level `async function runTests() { ... } runTests();` harness using the built-in assert module, catching errors and exiting with `process.exit(1)` on failure, and exiting with `process.exit(0)` on success. Ensure all asynchronous calls are awaited.",
            "To mock HTTP responses, assign a mock function directly to globalThis.fetch inside the test script.",
            "Wrap any JSON parsing (e.g., `await response.json()`) in a try-catch block to handle syntax errors, throwing a custom descriptive error."
        ]
    },
    "go": {
        "framework": "native 'testing' package",
        "import_instruction": "Import the sandbox package.",
        "rules": [
            "DO NOT use third-party HTTP mocking libraries (e.g. jarcoal/httpmock). Mock HTTP requests using standard library httptest.NewServer or by injecting a custom http.RoundTripper.",
            "Reuse TCP connections by reusing the http.Client instance.",
            "Write standard Go unit tests matching the signature func TestXxx(t *testing.T) from the 'testing' package.",
            "Implement exponential backoff retry logic for rate limits (429) and server errors (5xx) dynamically using time.Sleep."
        ]
    },
    "java": {
        "framework": "Standard public Java class with public static void main(String[] args)",
        "import_instruction": "Import the client class directly.",
        "rules": [
            "DO NOT use JUnit, TestNG, or third-party assertion libraries (e.g. AssertJ, Hamcrest). All assertions MUST use Java's native `assert` keyword.",
            "The test file MUST be a single, standalone Java class with a `public static void main(String[] args)` method that executes all assertions sequentially. If any assertion fails, the program should crash, translating to a non-zero exit code in the sandbox.",
            "DO NOT use third-party HTTP clients (e.g. OkHttp, Apache HttpClient). Use Java 11's built-in java.net.http.HttpClient or HttpURLConnection.",
            "DO NOT use external mocking libraries (e.g. Mockito). Mock API responses by implementing a mock HTTP handler or a custom HttpClient request runner inside the test code.",
            "Ensure that tests run successfully with assertions enabled via the -ea flag (configured in the executor environment)."
        ]
    }
}

def generate_code(state: AgentState) -> Dict[str, Any]:
    """
    Node that calls Gemini or Ollama to generate/regenerate API client wrapper code.
    """
    scraped_text = state.get("scraped_text", "").strip()
    if not scraped_text or (("forbidden" in scraped_text.lower() or "failed" in scraped_text.lower() or "error" in scraped_text.lower()) and len(scraped_text) < 500):
        raise ValueError("Scraped documentation is empty or represents a scraping error. Please provide valid API reference content.")
    use_case = state.get("use_case", "")
    language = state.get("language", "python").lower().strip()
    model_provider = state.get("model_provider", "gemini")
    gemini_key = state.get("gemini_key") or settings.gemini_api_key
    groq_key = state.get("groq_key") or settings.groq_api_key
    groq_model = state.get("groq_model") or "llama-3.3-70b-versatile"
    openrouter_key = state.get("openrouter_key") or settings.openrouter_api_key
    openrouter_model = state.get("openrouter_model") or "openrouter/free"
    retry_count = state.get("retry_count", 0)
    error_logs = state.get("error_logs", "")
    
    print(f"[Agent] Generating code iteration {retry_count + 1} for language: {language}")

    # Build dynamic language rules
    spec = LANGUAGE_SPECS.get(language, {
        "framework": "standard test framework",
        "import_instruction": "Import client from `./client`.",
        "rules": []
    })
    rules_list = [
        f"Test Framework: Use {spec['framework']}.",
        f"For the unit test suite script ('tests'): {spec['import_instruction']}"
    ] + spec['rules']
    language_rules_str = "\n".join(f"- {rule}" for rule in rules_list)

    # Build prompt
    if retry_count == 0 or not error_logs:
        # Initial prompt
        prompt = f"""You are a Staff Software Engineer. Your task is to generate a fully-functional, production-ready client API wrapper class and an accompanying unit test suite.

TARGET LANGUAGE:
{language}

USE CASE DETAILS:
{use_case}

API REFERENCE DOCUMENTATION:
{scraped_text}

CORE REQUIREMENTS:
1. 'overview': Outline the authentication mechanism(s) used by the API and recommend the integration path (REST client vs native SDK). Keep it clean and concise.
2. 'endpoints': Summarize the endpoints, HTTP methods, parameters, request headers, and payloads required for the use case.
3. 'code': Write the full client wrapper class code. The code must:
   - Handle connection timeouts, session reuse, and authorization headers.
   - Include robust error handling and throw custom descriptive exceptions.
   - Implement exponential backoff retry logic for transient errors (e.g., HTTP 429, 5xx) that honors user-configured retry/timeout parameters.
   - NOT contain any placeholders, mock code, or incomplete implementations.
   - Strictly utilize only the paths, HTTP methods, parameters, and payload schemas defined in the provided API Reference Documentation. DO NOT invent, guess, or hallucinate fictional endpoints.
   - Never hardcode API keys or credentials. Retrieve keys dynamically (e.g., using environment variables or configuration files).
   - Integrate production-grade logging using the target language's standard library logging utilities to record requests, retries, and errors, rather than bare print statements (For JavaScript/TypeScript, use standard console.warn/console.error instead of importing loglevel or other third-party npm packages).
   - For JavaScript/TypeScript: DO NOT import, require, or reference any external npm packages (like node-fetch, axios, loglevel, etc.). You MUST use the global fetch API directly (available as fetch() or globalThis.fetch(), do not import it).
4. 'tests': Write a complete, executable unit test suite script to validate the wrapper class. The tests must:
   - Compile and run successfully in the target language environment.
   - Use mock servers or standard library mock utilities rather than calling the real API.
   - For JavaScript/TypeScript: DO NOT use global testing hooks like describe(), it(), test(), before(), or after() which are undefined in raw node executions. Write the tests as a sequentially executed script using Node's built-in assert module, catching errors and calling process.exit(1) on failure. Mock requests by patching globalThis.fetch directly.
5. 'readme': Write a markdown usage guide explaining setup, configuration, and a quick-start example.

LANGUAGE-SPECIFIC RULES:
{language_rules_str}
"""
    else:
        # Self-healing prompt
        prompt = f"""You are a Staff Software Engineer. The previously generated API client wrapper or test suite failed verification.
Analyze the error logs and regenerate the complete files to fix the issue.

TARGET LANGUAGE:
{language}

USE CASE DETAILS:
{use_case}

API REFERENCE DOCUMENTATION:
{scraped_text}

ERROR LOGS FROM SANDBOX RUN:
{error_logs}

PREVIOUSLY GENERATED CLIENT CODE:
{state.get("code", "")}

PREVIOUSLY GENERATED TEST CODE:
{state.get("tests", "")}

INSTRUCTIONS:
1. Correct the wrapper code ('code') or the test suite ('tests') or both to resolve the error.
2. Ensure that standard library mocks are correctly imported and used.
3. If the error shows missing package imports or runtime path issues, ensure imports are aligned with standard local directory layouts.
4. Ensure the wrapper strictly adheres to the provided API Reference Documentation, handles credentials securely without hardcoding, and uses standard logging libraries.
5. For JavaScript/TypeScript: NEVER require or import third-party packages (axios, node-fetch, loglevel, etc.), use the global fetch API directly, and do not use describe/it/test hooks.
6. Output the complete updated fields: 'overview', 'endpoints', 'code', 'tests', and 'readme'.
"""

    if model_provider == "gemini":
        if not gemini_key:
            raise ValueError("Google Gemini API Key is required but not provided. Please supply one in your configuration or UI.")
            
        gemini_model = state.get("gemini_model") or "gemini-2.5-flash"
        client = genai.Client(api_key=gemini_key)
        response = retry_api_call(
            client.models.generate_content,
            model=gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=APIIntegrationOutput,
                temperature=0.1,
            ),
        )
        
        parsed = response.parsed
        return {
            "overview": parsed.overview,
            "endpoints": parsed.endpoints,
            "code": parsed.code,
            "tests": parsed.tests,
            "readme": parsed.readme,
        }
        
    elif model_provider == "ollama":
        prompt_with_format = prompt + "\n\nCRITICAL: Return ONLY a valid JSON object matching this schema:\n" + json.dumps({
            "overview": "string (Overview of auth methods, integration path recommendation)",
            "endpoints": "string (List of endpoints, request payloads, headers, query parameters)",
            "code": "string (The complete client wrapper code)",
            "tests": "string (The complete unit test suite)",
            "readme": "string (README markdown guide)"
        }, indent=2)
        
        url = f"{settings.ollama_base_url.rstrip('/')}/api/generate"
        payload = {
            "model": "qwen2.5-coder",
            "prompt": prompt_with_format,
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 4096
            }
        }
        
        response = retry_api_call(requests.post, url, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "")
        
        if not result.get("done", True):
            raise ValueError(
                "Ollama generation was truncated (done is false). "
                "The model ran out of token prediction space before completing the JSON wrapper. "
                "Try reducing the size of your input documentation or choosing a larger context/predict limit."
            )
            
        parsed = parse_json_response(response_text, "Ollama model")
        return {
            "overview": parsed.get("overview", ""),
            "endpoints": parsed.get("endpoints", ""),
            "code": parsed.get("code", ""),
            "tests": parsed.get("tests", ""),
            "readme": parsed.get("readme", ""),
        }
    elif model_provider == "groq":
        if not groq_key:
            raise ValueError("Groq API Key is required but not provided. Please supply one in your configuration or UI.")
            
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {groq_key}",
            "Content-Type": "application/json"
        }
        
        is_reasoning_model = "qwen" in groq_model.lower() or "deepseek" in groq_model.lower()
        
        # Instruct reasoning models to be concise in their thinking/reasoning process to avoid output token limits
        thinking_instruction = ""
        if is_reasoning_model:
            thinking_instruction = (
                "\nNOTE: Since you are a reasoning model, keep your thinking process concise. "
                "Ensure that the final JSON object is completely generated and not truncated due to output token limits."
            )
            
        prompt_with_format = prompt + thinking_instruction + "\n\nCRITICAL: Return ONLY a valid JSON object matching this schema:\n" + json.dumps({
            "overview": "string (Overview of auth methods, integration path recommendation)",
            "endpoints": "string (List of endpoints, request payloads, headers, query parameters)",
            "code": "string (The complete client wrapper code)",
            "tests": "string (The complete unit test suite)",
            "readme": "string (README markdown guide)"
        }, indent=2)
        
        payload = {
            "model": groq_model,
            "messages": [
                {"role": "user", "content": prompt_with_format}
            ],
            "temperature": 0.1,
            "max_tokens": 4096
        }
        
        # Qwen and reasoning models do not support JSON Object mode on Groq when thinking/reasoning is enabled
        if not is_reasoning_model:
            payload["response_format"] = {"type": "json_object"}
        
        response = retry_api_call(requests.post, url, json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        result = response.json()
        
        choice = result["choices"][0]
        response_text = choice["message"]["content"]
        finish_reason = choice.get("finish_reason")
        
        if finish_reason == "length":
            raise ValueError(
                f"Groq ({groq_model}) generation was truncated (finish_reason: length). "
                f"The model ran out of output tokens before completing the JSON wrapper. "
                f"Try reducing the size of your input documentation or using a model with a larger output limit."
            )
            
        parsed = parse_json_response(response_text, f"Groq model ({groq_model})")
        return {
            "overview": parsed.get("overview", ""),
            "endpoints": parsed.get("endpoints", ""),
            "code": parsed.get("code", ""),
            "tests": parsed.get("tests", ""),
            "readme": parsed.get("readme", ""),
        }
    elif model_provider == "openrouter":
        if not openrouter_key:
            raise ValueError("OpenRouter API Key is required but not provided. Please supply one in your configuration or .env file.")
            
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {openrouter_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/Yashwant00CR7/Smart-API-Integration-Dev-Tool",
            "X-Title": "Smart API DevTool"
        }
        
        prompt_with_format = prompt + "\n\nCRITICAL: Return ONLY a valid JSON object matching this schema:\n" + json.dumps({
            "overview": "string (Overview of auth methods, integration path recommendation)",
            "endpoints": "string (List of endpoints, request payloads, headers, query parameters)",
            "code": "string (The complete client wrapper code)",
            "tests": "string (The complete unit test suite)",
            "readme": "string (README markdown guide)"
        }, indent=2)
        
        payload = {
            "model": openrouter_model,
            "messages": [
                {"role": "user", "content": prompt_with_format}
            ],
            "temperature": 0.1,
            "max_tokens": 4096
        }
        
        response = retry_api_call(requests.post, url, json=payload, headers=headers, timeout=120)
        response.raise_for_status()
        result = response.json()
        
        choice = result["choices"][0]
        response_text = choice["message"]["content"]
        finish_reason = choice.get("finish_reason")
        
        if finish_reason == "length":
            raise ValueError(
                f"OpenRouter ({openrouter_model}) generation was truncated (finish_reason: length). "
                f"The model ran out of output tokens before completing the JSON wrapper. "
                f"Try reducing the size of your input documentation or using a model with a larger output limit."
            )
            
        parsed = parse_json_response(response_text, f"OpenRouter model ({openrouter_model})")
        return {
            "overview": parsed.get("overview", ""),
            "endpoints": parsed.get("endpoints", ""),
            "code": parsed.get("code", ""),
            "tests": parsed.get("tests", ""),
            "readme": parsed.get("readme", ""),
        }
    else:
        raise ValueError(f"Unsupported model provider: {model_provider}")

def execute_sandbox(state: AgentState) -> Dict[str, Any]:
    """
    Node that runs the generated client wrapper and unit tests in the isolated sandbox.
    """
    language = state.get("language", "python")
    code = state.get("code", "")
    tests = state.get("tests", "")
    retry_count = state.get("retry_count", 0)
    
    print(f"[Agent] Executing tests inside isolated sandbox (Iteration {retry_count + 1})...")
    
    try:
        test_passed, console_logs = run_tests(language, code, tests)
    except Exception as e:
        test_passed = False
        console_logs = f"Subprocess executor failed with exception: {str(e)}"
        
    print(f"[Agent] Test execution finished. Passed: {test_passed}")
    
    return {
        "test_passed": test_passed,
        "error_logs": "" if test_passed else console_logs,
        "retry_count": retry_count + 1
    }

def should_continue(state: AgentState) -> str:
    """
    Conditional edge deciding whether to self-heal or exit.
    """
    if state.get("test_passed") or state.get("retry_count", 0) >= 3:
        return "end"
    return "generate"

# Build LangGraph workflow
workflow = StateGraph(AgentState)
workflow.add_node("generate", generate_code)
workflow.add_node("execute", execute_sandbox)

workflow.set_entry_point("generate")
workflow.add_edge("generate", "execute")
workflow.add_conditional_edges(
    "execute",
    should_continue,
    {
        "end": END,
        "generate": "generate"
    }
)

compiled_graph = workflow.compile()

def run_agent_workflow(
    scraped_text: str,
    use_case: str,
    language: str,
    model_provider: str,
    gemini_key: Optional[str] = None,
    gemini_model: Optional[str] = None,
    groq_key: Optional[str] = None,
    groq_model: Optional[str] = None,
    openrouter_key: Optional[str] = None,
    openrouter_model: Optional[str] = None,
    firecrawl_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entrypoint to trigger the self-healing agent loop.
    """
    # Pre-generation validation
    validate_documentation(
        scraped_text=scraped_text,
        model_provider=model_provider,
        gemini_key=gemini_key,
        gemini_model=gemini_model,
        groq_key=groq_key,
        groq_model=groq_model,
        openrouter_key=openrouter_key,
        openrouter_model=openrouter_model
    )

    initial_state = {
        "scraped_text": scraped_text,
        "use_case": use_case,
        "language": language,
        "model_provider": model_provider,
        "gemini_key": gemini_key,
        "gemini_model": gemini_model,
        "groq_key": groq_key,
        "groq_model": groq_model,
        "openrouter_key": openrouter_key,
        "openrouter_model": openrouter_model,
        "firecrawl_key": firecrawl_key,
        "retry_count": 0,
        "error_logs": "",
        "overview": "",
        "endpoints": "",
        "code": "",
        "tests": "",
        "readme": "",
        "test_passed": False
    }
    
    return compiled_graph.invoke(initial_state)
