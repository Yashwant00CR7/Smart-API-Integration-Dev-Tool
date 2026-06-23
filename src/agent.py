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

def generate_code(state: AgentState) -> Dict[str, Any]:
    """
    Node that calls Gemini or Ollama to generate/regenerate API client wrapper code.
    """
    scraped_text = state.get("scraped_text", "")
    use_case = state.get("use_case", "")
    language = state.get("language", "python").lower().strip()
    model_provider = state.get("model_provider", "gemini")
    gemini_key = state.get("gemini_key") or settings.gemini_api_key
    retry_count = state.get("retry_count", 0)
    error_logs = state.get("error_logs", "")
    
    print(f"[Agent] Generating code iteration {retry_count + 1} for language: {language}")

    # Build prompt
    if retry_count == 0 or not error_logs:
        # Initial prompt
        prompt = f"""You are a senior staff software engineer. Your task is to generate a fully-functional, production-grade client API wrapper class and an accompanying unit test suite.

Target Language: {language}
Use Case Details: {use_case}
API Documentation Content:
{scraped_text}

Requirements:
1. 'overview': Outline the authentication mechanism(s) used by the API and provide a clear recommendation on the integration path (REST client vs using a native SDK if available). Keep it clean and concise.
2. 'endpoints': Summarize the endpoints, HTTP methods, parameters, request headers, and payloads required for the use case in a markdown or structured format.
3. 'code': Write the full client wrapper class code. The code must:
   - Handle connection timeouts, session reuse, and authorization headers.
   - Include robust error handling and throw custom descriptive exceptions.
   - Implement exponential backoff retry logic for HTTP rate limits (429) or transient server errors (5xx).
   - NOT contain any placeholders, mock code, or incomplete implementations.
4. 'tests': Write a complete, executable unit test suite script to validate the wrapper class. Crucially:
   - The tests must compile and run successfully via the native language environment.
   - Use mock servers or standard library mock utilities (e.g., standard Python 'unittest.mock' package) rather than calling the real API.
   - Python: Use pytest/unittest style. Must import the client wrapper from 'client' module (e.g., `from client import MyAPIClient`).
   - JavaScript: Use standard built-in assert module and node.js, importing from `./client`.
   - TypeScript: Use ts-node execution, importing client from `./client`.
   - Go: Use native 'testing' library, importing the sandbox package.
   - Java: Use a standard public Java class (match classname to test file, e.g., 'TestClient') with a `public static void main(String[] args)` method that executes test assertions. Assertions must be written with the standard `assert` keyword (e.g. `assert response != null;`). Do not use third-party libraries like JUnit.
5. 'readme': Write a markdown usage guide explaining installation, configuration, and a quick-start example.
"""
    else:
        # Self-healing prompt
        prompt = f"""You are a senior staff software engineer. Your previous code generation failed compilation or execution tests. 
Your task is to analyze the error logs and regenerate the complete files to fix the issue.

Target Language: {language}
Use Case Details: {use_case}
API Documentation Content:
{scraped_text}

Error Logs from sandbox run:
{error_logs}

Previously Generated Client Code:
{state.get("code", "")}

Previously Generated Test Code:
{state.get("tests", "")}

Instructions:
1. Correct the wrapper code ('code') or the test suite ('tests') or both to resolve the error.
2. Ensure that standard library mocks are correctly imported and used.
3. If the error shows missing package imports or runtime path issues, ensure imports are aligned with standard local directory layouts.
4. Output the complete updated fields: 'overview', 'endpoints', 'code', 'tests', and 'readme'.
"""

    if model_provider == "gemini":
        if not gemini_key:
            raise ValueError("Google Gemini API Key is required but not provided. Please supply one in your configuration or UI.")
            
        client = genai.Client(api_key=gemini_key)
        response = client.models.generate_content(
            model='gemini-1.5-flash',
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
