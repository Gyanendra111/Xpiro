from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import EmailStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "sqlite:///./xpiro.db"

    # JWT
    secret_key: str = "change-me-to-a-long-random-secret"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours

    # SMTP
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    email_from: str = ""
    # Address that receives contact-form submissions (falls back to smtp_user)
    contact_email: str = ""

    # CORS
    allowed_origins: str = "http://localhost:5000,http://127.0.0.1:5000"

    @property
    def origins_list(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
