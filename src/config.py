import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # API Keys & Third-party integrations
    gemini_api_key: Optional[str] = None
    firecrawl_api_key: Optional[str] = None
    ollama_base_url: str = "http://localhost:11434"
    
    # Server configuration
    host: str = "0.0.0.0"
    port: int = 7860
    reload: bool = False
    
    # Environment config
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

