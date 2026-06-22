from abc import ABC, abstractmethod

import httpx


class SearchTool(ABC):
    @abstractmethod
    async def search(self, query: str) -> list[dict]:
        ...


class NullSearch(SearchTool):
    """No-op search — used when no API key is configured."""

    async def search(self, query: str) -> list[dict]:
        return []


class TavilySearch(SearchTool):
    """Searches the web via the Tavily API."""

    def __init__(self, api_key: str):
        self._key = api_key

    async def search(self, query: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=20) as c:
            r = await c.post(
                "https://api.tavily.com/search",
                json={"api_key": self._key, "query": query, "max_results": 5},
            )
            r.raise_for_status()
            data = r.json()
        return [
            {
                "title": x.get("title", ""),
                "url": x.get("url", ""),
                "snippet": x.get("content", ""),
            }
            for x in data.get("results", [])
        ]
