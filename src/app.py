import os
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from src.config import settings
from src.services.scraper import scrape_url
from src.services.executor import run_tests

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
    model_provider: str = Field("gemini", description="Either 'gemini' or 'ollama'.")
    gemini_key: Optional[str] = Field(None, description="Optional Google Gemini API Key.")
    firecrawl_key: Optional[str] = Field(None, description="Optional Firecrawl API Key.")

@app.get("/api/health")
def health_check():
    """Simple endpoint to verify server status."""
    return {
        "status": "healthy",
        "configuration": {
            "has_gemini_key": bool(settings.gemini_api_key),
            "has_firecrawl_key": bool(settings.firecrawl_api_key),
            "ollama_base_url": settings.ollama_base_url
        }
    }

@app.post("/api/analyze")
async def analyze_api(request: AnalyzeRequest):
    """
    Skeleton endpoint for API analysis.
    This will be fully wired up with the LangGraph self-healing agent in Phase 2.
    For Phase 1, it allows basic validation of Scraper and Executor components.
    """
    try:
        scraped_text = ""
        if request.url:
            # Scrape document using scraper service
            scraped_text = scrape_url(request.url, api_key=request.firecrawl_key)
        elif request.raw_docs:
            scraped_text = request.raw_docs
        else:
            raise HTTPException(status_code=420, detail="Must provide either a URL or raw_docs.")
            
        return {
            "success": True,
            "message": "Phase 1 backend services are operational.",
            "scraped_length": len(scraped_text),
            "scraped_preview": scraped_text[:500] if scraped_text else ""
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
