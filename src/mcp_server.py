import sys
import json
import traceback
import logging
from typing import Dict, Any, Optional

from src.services.scraper import scrape_url
from src.agent import run_agent_workflow

def run_mcp_server():
    """
    Runs the Model Context Protocol (MCP) server over standard I/O (stdin/stdout).
    To prevent any print statements, logs, or external library debug outputs from
    corrupting the JSON-RPC stream, sys.stdout is redirected to sys.stderr, while
    original stdout is preserved specifically for sending JSON-RPC response frames.
    """
    # Preserve original stdout for JSON-RPC communication
    original_stdout = sys.stdout
    
    # Redirect global stdout to stderr so all general print() calls go to stderr
    sys.stdout = sys.stderr

    # Reconfigure stdin/stdout text streams to use UTF-8 and handle encoding errors gracefully (especially on Windows)
    if hasattr(sys.stdin, "reconfigure"):
        try:
            sys.stdin.reconfigure(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"[MCP Server] Warning reconfiguring stdin encoding: {str(e)}", file=sys.stderr)
            
    if hasattr(original_stdout, "reconfigure"):
        try:
            original_stdout.reconfigure(encoding="utf-8", errors="replace")
        except Exception as e:
            print(f"[MCP Server] Warning reconfiguring stdout encoding: {str(e)}", file=sys.stderr)
    
    # Redirect any existing standard logging stream handlers pointing to stdout to prevent JSON-RPC contamination
    try:
        for handler in logging.root.handlers:
            if isinstance(handler, logging.StreamHandler) and handler.stream in (sys.__stdout__, original_stdout):
                handler.setStream(sys.stderr)
    except Exception as e:
        print(f"[MCP Server] Warning redirecting logging handlers: {str(e)}", file=sys.stderr)
    
    print("[MCP Server] Starting hardened MCP server stream loop...", file=sys.stderr)
    print("[MCP Server] Redirected sys.stdout and standard logging handlers to sys.stderr to protect stream channel.", file=sys.stderr)

    # Process standard input line by line
    for line in sys.stdin:
        if not line.strip():
            continue
            
        req_id = None
        is_notification = True
        
        def send_response(response: Dict[str, Any], force: bool = False):
            # Notifications MUST NOT receive responses per JSON-RPC 2.0 spec,
            # except for severe Parse/Invalid Request errors where we force a response.
            if is_notification and not force:
                return
            try:
                out_line = json.dumps(response) + "\n"
                original_stdout.write(out_line)
                original_stdout.flush()
            except Exception as e:
                print(f"[MCP Server] Error writing response to stdout: {str(e)}", file=sys.stderr)

        def send_error(code: int, message: str, r_id: Optional[Any] = None, data: Optional[Any] = None):
            err_resp = {
                "jsonrpc": "2.0",
                "error": {
                    "code": code,
                    "message": message
                }
            }
            if data is not None:
                err_resp["error"]["data"] = data
            if r_id is not None:
                err_resp["id"] = r_id
            else:
                err_resp["id"] = None
                
            # Severe protocol validation errors (parse error, invalid request) are sent back
            force_reply = code in [-32700, -32600]
            send_response(err_resp, force=force_reply)

        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                send_error(-32600, "Invalid Request: expected JSON object")
                continue
                
            # Determine if this message is a request or notification
            is_notification = "id" not in request
            req_id = request.get("id")
            method = request.get("method")
            jsonrpc = request.get("jsonrpc")
            
            # Verify JSON-RPC version
            if jsonrpc and jsonrpc != "2.0":
                print(f"[MCP Server] Warning: received JSON-RPC version {jsonrpc}, expecting 2.0", file=sys.stderr)
                
            if not method or not isinstance(method, str):
                send_error(-32600, "Invalid Request: missing or invalid method field", req_id)
                continue

            # Parse parameters safely
            params = request.get("params")
            if params is None:
                params = {}
            elif not isinstance(params, dict):
                send_error(-32602, "Invalid params: expected JSON object", req_id)
                continue

            print(f"[MCP Server] Received method: '{method}' (id: {req_id}, notification: {is_notification})", file=sys.stderr)

            # 1. Protocol Lifecycle Handshake
            if method == "initialize":
                protocol_version = params.get("protocolVersion", "2024-11-05")
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "protocolVersion": protocol_version,
                        "capabilities": {
                            "tools": {}
                        },
                        "serverInfo": {
                            "name": "Smart-API-DevTool-Server",
                            "version": "1.0.0"
                        }
                    }
                }
                send_response(response)
                
            elif method == "notifications/initialized":
                print("[MCP Server] Initialized notification received.", file=sys.stderr)
                
            elif method == "ping":
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {}
                }
                send_response(response)

            # 2. Tool Discovery
            elif method == "tools/list":
                tools = [
                    {
                        "name": "scrape_url",
                        "description": "Scrapes the target API documentation URL using Firecrawl and returns the clean markdown content.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "url": {
                                    "type": "string",
                                    "description": "The HTTP or HTTPS URL of the API documentation page to scrape."
                                },
                                "api_key": {
                                    "type": "string",
                                    "description": "Optional Firecrawl API Key. If not provided, it falls back to the server configuration."
                                }
                            },
                            "required": ["url"]
                        }
                    },
                    {
                        "name": "generate_wrapper",
                        "description": "Generates a complete, verified API client wrapper class, usage README guide, and unit tests using a self-healing LangGraph agentic loop.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "scraped_text": {
                                    "type": "string",
                                    "description": "The raw text or scraped markdown documentation of the API."
                                },
                                "use_case": {
                                    "type": "string",
                                    "description": "Details of the target use case and functions to implement in the wrapper."
                                },
                                "language": {
                                    "type": "string",
                                    "description": "Target programming language (e.g. 'python', 'typescript', 'go', 'java'). Default is 'python'."
                                },
                                "model_provider": {
                                    "type": "string",
                                    "description": "The model provider to use ('gemini', 'ollama', 'groq', or 'openrouter'). Default is 'gemini'."
                                },
                                "gemini_key": {
                                    "type": "string",
                                    "description": "Optional Google Gemini API Key. Required if model_provider is 'gemini' and the server has no key configured."
                                },
                                "gemini_model": {
                                    "type": "string",
                                    "description": "Optional Google Gemini Model ID (e.g. 'gemini-2.5-flash')."
                                },
                                "groq_key": {
                                    "type": "string",
                                    "description": "Optional Groq API Key. Required if model_provider is 'groq' and the server has no key configured."
                                },
                                "groq_model": {
                                    "type": "string",
                                    "description": "Optional Groq Model ID (e.g., 'llama-3.3-70b-versatile')."
                                },
                                "openrouter_key": {
                                    "type": "string",
                                    "description": "Optional OpenRouter API Key. Required if model_provider is 'openrouter' and the server has no key configured."
                                },
                                "openrouter_model": {
                                    "type": "string",
                                    "description": "Optional OpenRouter Model ID (e.g., 'openrouter/free')."
                                },
                                "firecrawl_key": {
                                    "type": "string",
                                    "description": "Optional Firecrawl API Key."
                                }
                            },
                            "required": ["scraped_text", "use_case"]
                        }
                    }
                ]
                response = {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "result": {
                        "tools": tools
                    }
                }
                send_response(response)

            # 3. Tool Execution
            elif method == "tools/call":
                tool_name = params.get("name")
                arguments = params.get("arguments")
                
                if not tool_name or not isinstance(tool_name, str):
                    send_error(-32602, "Invalid params: missing or invalid tool name", req_id)
                    continue
                    
                if arguments is None:
                    arguments = {}
                elif not isinstance(arguments, dict):
                    send_response({
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "result": {
                            "content": [{"type": "text", "text": "Error: 'arguments' must be a JSON object matching tool schema."}],
                            "isError": True
                        }
                    })
                    continue
                    
                print(f"[MCP Server] Calling tool '{tool_name}' (arguments present: {list(arguments.keys())})", file=sys.stderr)
                
                if tool_name == "scrape_url":
                    url = arguments.get("url")
                    if not url or not isinstance(url, str):
                        send_response({
                            "jsonrpc": "2.0",
                            "id": req_id,
                            "result": {
                                "content": [{"type": "text", "text": "Error: 'url' parameter is required and must be a string."}],
                                "isError": True
                            }
                        })
                        continue
                        
                    try:
                        scraped_markdown = scrape_url(url, api_key=arguments.get("api_key"))
                        send_response({
                            "jsonrpc": "2.0",
                            "id": req_id,
                            "result": {
                                "content": [{"type": "text", "text": scraped_markdown}]
                            }
                        })
                    except Exception as e:
                        print(f"[MCP Server] Error in scrape_url: {traceback.format_exc()}", file=sys.stderr)
                        send_response({
                            "jsonrpc": "2.0",
                            "id": req_id,
                            "result": {
                                "content": [{"type": "text", "text": f"Scrape failed: {str(e)}"}],
                                "isError": True
                            }
                        })
                        
                elif tool_name == "generate_wrapper":
                    scraped_text = arguments.get("scraped_text")
                    use_case = arguments.get("use_case")
                    language = arguments.get("language", "python")
                    model_provider = arguments.get("model_provider", "gemini")
                    gemini_key = arguments.get("gemini_key")
                    gemini_model = arguments.get("gemini_model")
                    groq_key = arguments.get("groq_key")
                    groq_model = arguments.get("groq_model")
                    openrouter_key = arguments.get("openrouter_key")
                    openrouter_model = arguments.get("openrouter_model")
                    firecrawl_key = arguments.get("firecrawl_key")
                    
                    if not scraped_text or not isinstance(scraped_text, str) or not use_case or not isinstance(use_case, str):
                        send_response({
                            "jsonrpc": "2.0",
                            "id": req_id,
                            "result": {
                                "content": [{"type": "text", "text": "Error: 'scraped_text' and 'use_case' parameters must be non-empty strings."}],
                                "isError": True
                            }
                        })
                        continue
                        
                    try:
                        agent_result = run_agent_workflow(
                            scraped_text=scraped_text,
                            use_case=use_case,
                            language=str(language),
                            model_provider=str(model_provider),
                            gemini_key=gemini_key,
                            gemini_model=gemini_model,
                            groq_key=groq_key,
                            groq_model=groq_model,
                            openrouter_key=openrouter_key,
                            openrouter_model=openrouter_model,
                            firecrawl_key=firecrawl_key
                        )
                        
                        cleaned_result = {
                            "success": agent_result.get("test_passed", False),
                            "overview": agent_result.get("overview", ""),
                            "endpoints": agent_result.get("endpoints", ""),
                            "code": agent_result.get("code", ""),
                            "tests": agent_result.get("tests", ""),
                            "readme": agent_result.get("readme", ""),
                            "retry_count": agent_result.get("retry_count", 0),
                            "error_logs": agent_result.get("error_logs", "")
                        }
                        
                        send_response({
                            "jsonrpc": "2.0",
                            "id": req_id,
                            "result": {
                                "content": [{"type": "text", "text": json.dumps(cleaned_result, indent=2)}]
                            }
                        })
                    except Exception as e:
                        print(f"[MCP Server] Error in generate_wrapper: {traceback.format_exc()}", file=sys.stderr)
                        send_response({
                            "jsonrpc": "2.0",
                            "id": req_id,
                            "result": {
                                "content": [{"type": "text", "text": f"Wrapper generation failed: {str(e)}"}],
                                "isError": True
                            }
                        })
                else:
                    send_error(-32601, f"Method '{method}' tool '{tool_name}' not found", req_id)
            else:
                send_error(-32601, f"Method '{method}' not found", req_id)
                
        except json.JSONDecodeError:
            send_error(-32700, "Parse error: invalid JSON received")
        except Exception as e:
            print(f"[MCP Server] Unexpected exception: {traceback.format_exc()}", file=sys.stderr)
            send_error(-32603, f"Internal error: {str(e)}", req_id)
            
    print("[MCP Server] Stdin EOF reached. Exiting server.", file=sys.stderr)

if __name__ == "__main__":
    run_mcp_server()
