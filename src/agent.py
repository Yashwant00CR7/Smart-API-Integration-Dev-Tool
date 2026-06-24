import os
import re
import json
import requests
from typing import Dict, Any, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field

from google import genai
from google.genai import types
from langgraph.graph import StateGraph, END

from src.config import settings
from src.services.executor import run_tests

# State definition
class AgentState(TypedDict):
    scraped_text: str
    use_case: str
    language: str
    model_provider: str
    gemini_key: Optional[str]
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

def parse_ollama_json(response_text: str) -> Dict[str, str]:
    """
    Defensively extracts and parses a JSON object from Ollama's response.
    """
    # 1. Try parsing directly
    try:
        return json.loads(response_text.strip())
    except json.JSONDecodeError:
        pass
    
    # 2. Try extracting markdown json block
    match = re.search(r"```json\s*(.*?)\s*```", response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass
            
    # 3. Try finding the first '{' and last '}'
    start = response_text.find('{')
    end = response_text.rfind('}')
    if start != -1 and end != -1:
        try:
            return json.loads(response_text[start:end+1].strip())
        except json.JSONDecodeError:
            pass
            
    raise ValueError(f"Failed to parse JSON response from Ollama model. Raw response:\n{response_text}")

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
            "When mocking `requests.exceptions.HTTPError` in unit tests, always initialize it with a descriptive message string matching the HTTP status (e.g., `requests.exceptions.HTTPError('500 Server Error...', response=mock_response)`) so that `str(e)` does not return empty."
        ]
    },
    "javascript": {
        "framework": "standard built-in assert module and node.js",
        "import_instruction": "Import the client wrapper from `./client`.",
        "rules": []
    },
    "typescript": {
        "framework": "ts-node execution with standard assert",
        "import_instruction": "Import the client wrapper from `./client`.",
        "rules": []
    },
    "go": {
        "framework": "native 'testing' package",
        "import_instruction": "Import the sandbox package.",
        "rules": []
    },
    "java": {
        "framework": "Standard public Java class (matching the filename, e.g. TestClient) with a public static void main(String[] args) method that executes assertions using the standard `assert` keyword. Do not use JUnit or third-party libraries.",
        "import_instruction": "Import the client class directly.",
        "rules": []
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
        spec['import_instruction']
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
   - Integrate production-grade logging using the target language's standard library logging utilities to record requests, retries, and errors, rather than bare print statements.
4. 'tests': Write a complete, executable unit test suite script to validate the wrapper class. The tests must:
   - Compile and run successfully in the target language environment.
   - Use mock servers or standard library mock utilities rather than calling the real API.
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
5. Output the complete updated fields: 'overview', 'endpoints', 'code', 'tests', and 'readme'.
"""

    if model_provider == "gemini":
        if not gemini_key:
            raise ValueError("Google Gemini API Key is required but not provided. Please supply one in your configuration or UI.")
            
        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model='gemini-2.5-flash',
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
                "temperature": 0.1
            }
        }
        
        response = requests.post(url, json=payload, timeout=120)
        response.raise_for_status()
        result = response.json()
        response_text = result.get("response", "")
        
        parsed = parse_ollama_json(response_text)
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
    firecrawl_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entrypoint to trigger the self-healing agent loop.
    """
    initial_state = {
        "scraped_text": scraped_text,
        "use_case": use_case,
        "language": language,
        "model_provider": model_provider,
        "gemini_key": gemini_key,
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
