from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

Message = dict  # {"role": str, "content": str}


class LLMProvider(ABC):
    @abstractmethod
    async def stream(
        self, messages: list[Message], model: str | None = None, temperature: float = 0.7
    ) -> AsyncIterator[str]:
        ...

    async def complete(
        self, messages: list[Message], model: str | None = None, temperature: float = 0.7
    ) -> str:
        parts = [chunk async for chunk in self.stream(messages, model, temperature)]
        return "".join(parts)
