import time
import requests
from typing import Optional
from urllib.parse import urlparse
from src.config import settings

def scrape_url(url: str, api_key: Optional[str] = None) -> str:
    """
    Scrapes the target URL using Firecrawl API and returns the markdown content.
    If no api_key is provided, it falls back to settings.firecrawl_api_key.
    If both are absent, it operates in Firecrawl Keyless mode (no Authorization header).
    
    Includes security scheme validation and exponential backoff retry for HTTP 429 (Rate Limits).
    """
    # Security Validation: Enforce http/https to prevent internal file or protocol attacks
    parsed = urlparse(url)
    if parsed.scheme not in ["http", "https"]:
        raise ValueError("Invalid URL protocol. Only HTTP and HTTPS schemes are supported.")
        
    endpoint = "https://api.firecrawl.dev/v2/scrape"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    # Use the passed key, or fallback to the environment configuration
    key_to_use = api_key or settings.firecrawl_api_key
    if key_to_use:
        headers["Authorization"] = f"Bearer {key_to_use}"
        
    payload = {
        "url": url,
        "formats": ["markdown"]
    }
    
    max_retries = 3
    backoff = 1.0
    
    for attempt in range(max_retries):
        try:
            response = requests.post(endpoint, json=payload, headers=headers, timeout=30)
            
            # Handle rate limiting with backoff
            if response.status_code == 429:
                if attempt == max_retries - 1:
                    raise RuntimeError("Firecrawl rate limit exceeded. Max retries reached.")
                time.sleep(backoff)
                backoff *= 2
                continue
                
            if response.status_code == 401:
                raise ValueError("Firecrawl authentication failed. Please check your API key.")
                
            response.raise_for_status()
            
            data = response.json()
            if not data.get("success"):
                error_msg = data.get("error", "Unknown error occurred during Firecrawl scraping.")
                raise ValueError(f"Firecrawl scraping failed: {error_msg}")
                
            markdown_content = data.get("data", {}).get("markdown", "")
            if not markdown_content:
                raise ValueError("Firecrawl succeeded but returned empty markdown content.")
                
            return markdown_content
            
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise RuntimeError(f"Network request to Firecrawl failed after {max_retries} attempts: {str(e)}")
            time.sleep(backoff)
            backoff *= 2
            
    raise RuntimeError("Firecrawl scraping failed due to retry exhaustion.")
