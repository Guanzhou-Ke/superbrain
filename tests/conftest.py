from collections.abc import AsyncIterator
from backend.providers.base import LLMProvider, Message


class FakeProvider(LLMProvider):
    def __init__(self, scripted: list[str]):
        self._scripted = list(scripted)
        self.calls: list[list[Message]] = []

    async def stream(self, messages, model=None, temperature=0.7) -> AsyncIterator[str]:
        self.calls.append(messages)
        text = self._scripted.pop(0) if self._scripted else ""
        words = text.split(" ")
        for i, word in enumerate(words):
            yield word if i == 0 else " " + word

    async def complete(self, messages, model=None, temperature=0.7) -> str:
        self.calls.append(messages)
        return self._scripted.pop(0) if self._scripted else ""
