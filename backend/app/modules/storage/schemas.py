from pydantic import BaseModel, Field

# Images (screenshots + attachments), PDF, Word/Excel docs, and Markdown - "images, pdf,
# docs, excel sheets, markdown file supported for now" (comment attachments scope).
# Widened from the original image-only screenshot upload (docs/tdr's screenshot flow
# reuses this same endpoint for both purposes; a generic content type allowlist here,
# not two separate endpoints).
_SUPPORTED_CONTENT_TYPES = (
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/markdown",
)
_CONTENT_TYPE_PATTERN = (
    "^(" + "|".join(t.replace(".", r"\.") + "$" for t in _SUPPORTED_CONTENT_TYPES) + ")"
)


# Matches assets/service.py's MAX_ASSET_SIZE - this endpoint's presigned PUT is the
# other upload path (comment screenshots/attachments, going straight from the client
# to R2, never through this API's own body), which previously had no size limit at
# all despite being reachable by an unauthenticated guest session.
MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024


class UploadRequest(BaseModel):
    project_id: str
    content_type: str = Field(pattern=_CONTENT_TYPE_PATTERN)
    content_length: int = Field(gt=0, le=MAX_UPLOAD_SIZE_BYTES)


class UploadOut(BaseModel):
    upload_url: str
    key: str
