import sys
import argparse
import uvicorn
from src.config import settings

def main():
    parser = argparse.ArgumentParser(description="Smart API DevTool - FastAPI Server or MCP Server Mode")
    parser.add_argument(
        "--mcp",
        action="store_true",
        help="Run the tool in Model Context Protocol (MCP) server mode using stdin/stdout streams."
    )
    
    args = parser.parse_args()
    
    if args.mcp:
        print("Model Context Protocol (MCP) mode selected.", file=sys.stderr)
        try:
            from src.mcp_server import run_mcp_server
            run_mcp_server()
        except ImportError:
            print("Error: MCP server module 'src/mcp_server.py' is not implemented yet (Phase 3). Please run without --mcp to start the FastAPI server.", file=sys.stderr)
            sys.exit(1)
    else:
        # Launch FastAPI server
        print(f"Starting FastAPI Web Server on http://{settings.host}:{settings.port}", file=sys.stderr)
        uvicorn.run("src.app:app", host=settings.host, port=settings.port, reload=True)

if __name__ == "__main__":
    main()
