import os
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

try:
    from google import genai
except ImportError:
    genai = None

from app.core.errors import NotFoundError
from app.modules.ai.schemas import SuggestReplyResult, SummarizeResult
from app.modules.comments.repository import CommentRepository


def get_gemini_client() -> Any | None:
    if genai is None:
        return None
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    return genai.Client(api_key=api_key)

async def _get_thread_context(
    db: AsyncIOMotorDatabase[dict[str, Any]], workspace_id: str, comment_id: str
) -> str:
    repo = CommentRepository(db)
    comment = await repo.find_by_id(comment_id)
    if not comment or comment["workspace_id"] != workspace_id:
        raise NotFoundError("Comment not found")
    
    # If this is a reply, we want the whole thread.
    parent_id = comment.get("parent_id") or comment_id
    parent = await repo.find_by_id(parent_id)
    if not parent:
        raise NotFoundError("Thread parent not found")

    replies = await repo.list_replies(parent_id)
    
    thread_parts = [f"Original Request: {parent['body']}"]
    for r in replies:
        thread_parts.append(f"Reply: {r['body']}")
        
    return "\n".join(thread_parts)

async def summarize_thread(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    comment_id: str
) -> SummarizeResult:
    context = await _get_thread_context(db, workspace_id, comment_id)
    
    client = get_gemini_client()
    if not client:
        return SummarizeResult(
            summary="[AI Disabled] Configure GEMINI_API_KEY to see real summaries. "
            "The thread context is ready."
        )

    prompt = f"Summarize the following feedback thread in one concise paragraph:\n\n{context}"
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )
    return SummarizeResult(summary=response.text or "Could not generate summary.")

async def suggest_reply(
    db: AsyncIOMotorDatabase[dict[str, Any]],
    workspace_id: str,
    comment_id: str
) -> SuggestReplyResult:
    context = await _get_thread_context(db, workspace_id, comment_id)
    
    client = get_gemini_client()
    if not client:
        return SuggestReplyResult(
            suggestions=["[AI] I agree.", "[AI] Can you clarify?", "[AI] Will fix."]
        )

    prompt = (
        "Given the following feedback thread, suggest 3 short, helpful replies the "
        f"team could send. Format each reply on a new line starting with '- ':\n\n{context}"
    )
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    text = response.text or ""
    suggestions = [
        line.strip("- *").strip() for line in text.split("\n") if line.strip().startswith("-")
    ]
    if not suggestions:
        suggestions = ["I agree.", "Looking into it.", "Fixed!"]
    
    return SuggestReplyResult(suggestions=suggestions[:3])
