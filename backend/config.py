from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "gemini-3.5-flash"
    tavily_api_key: str | None = None
    db_path: str = "superbrain.db"
    max_chat_speakers: int = 4
    review_rounds: int = 3

    def require_llm(self) -> None:
        if not self.llm_base_url or not self.llm_api_key:
            raise RuntimeError(
                "缺少 LLM_BASE_URL / LLM_API_KEY，请在 .env 配置（见 .env.example）"
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
