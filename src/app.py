import os
from fastapi import FastAPI, HTTPException, Body, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from src.config import settings
from src.services.scraper import scrape_url
from src.services.executor import run_tests
from src.agent import run_agent_workflow


app = FastAPI(
    title="Smart API DevTool",
    description="Backend API for crawling docs and auto-generating self-healing API wrappers.",
    version="1.0.0"
)

# Enable CORS for frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    url: Optional[str] = Field(None, description="The URL of the API documentation.")
    raw_docs: Optional[str] = Field(None, description="Raw pasted API documentation text.")
    use_case: str = Field(..., description="Details on what the wrapper will do.")
    language: str = Field("python", description="Target programming language.")
    model_provider: str = Field("gemini", description="Either 'gemini', 'ollama' or 'groq'.")
    gemini_key: Optional[str] = Field(None, description="Optional Google Gemini API Key.")
    gemini_model: Optional[str] = Field("gemini-2.5-flash", description="Optional Google Gemini Model ID.")
    groq_key: Optional[str] = Field(None, description="Optional Groq API Key.")
    groq_model: Optional[str] = Field(None, description="Optional Groq Model ID.")
    firecrawl_key: Optional[str] = Field(None, description="Optional Firecrawl API Key.")

@app.get("/api/health")
def health_check():
    """Simple endpoint to verify server status."""
    return {
        "status": "healthy",
        "configuration": {
            "has_gemini_key": bool(settings.gemini_api_key),
            "has_groq_key": bool(settings.groq_api_key),
            "has_firecrawl_key": bool(settings.firecrawl_api_key),
            "ollama_base_url": settings.ollama_base_url
        }
    }

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Handles browser favicon requests with 204 No Content to prevent console 404 log littering."""
    return Response(status_code=204)

@app.post("/api/analyze")
async def analyze_api(request: AnalyzeRequest):
    """
    Analyzes API documentation (via URL scraping or raw text) and triggers
    the LangGraph self-healing agent loop to output verified wrapper classes.
    """
    try:
        scraped_text = ""
        if request.url:
            scraped_text = scrape_url(request.url)
        elif request.raw_docs:
            scraped_text = request.raw_docs
        else:
            raise HTTPException(status_code=400, detail="Must provide either a URL or raw_docs.")
            
        result = run_agent_workflow(
            scraped_text=scraped_text,
            use_case=request.use_case,
            language=request.language,
            model_provider=request.model_provider,
            gemini_key=request.gemini_key,
            gemini_model=request.gemini_model,
            groq_key=request.groq_key,
            groq_model=request.groq_model,
            firecrawl_key=request.firecrawl_key
        )
        
        return {
            "success": result.get("test_passed", False),
            "overview": result.get("overview", ""),
            "endpoints": result.get("endpoints", ""),
            "code": result.get("code", ""),
            "tests": result.get("tests", ""),
            "readme": result.get("readme", ""),
            "retry_count": result.get("retry_count", 0),
            "error_logs": result.get("error_logs", ""),
            "test_passed": result.get("test_passed", False)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount static files programmatically if the public folder exists
public_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "public"))
if os.path.isdir(public_path):
    app.mount("/", StaticFiles(directory=public_path, html=True), name="public")
else:
    # Fallback message route for clean dev experience before frontend is built
    @app.get("/")
    def read_root():
        return {
            "message": "Welcome to Smart API DevTool Backend! The 'public' directory is not yet present. Exposing API routes at /api/health."
        }
