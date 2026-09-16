from pydantic import BaseModel


class SummarizeResult(BaseModel):
    summary: str

class SuggestReplyResult(BaseModel):
    suggestions: list[str]
