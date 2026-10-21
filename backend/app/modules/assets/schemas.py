from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.modules.comments.schemas import Layer, Tag


class AssetOut(BaseModel):
    id: str
    project_id: str
    page_id: str
    filename: str
    content_type: str
    size: int
    page_count: int
    width: int | None
    height: int | None
    url: str
    created_at: datetime
    archived_at: datetime | None = None
    revision: int = 0


class AssetUpdate(BaseModel):
    expected_revision: int | None = Field(default=None, ge=0)
    filename: str | None = Field(default=None, min_length=1, max_length=255)
    archived: bool | None = None

    @model_validator(mode="after")
    def valid_name(self) -> "AssetUpdate":
        if self.filename is not None:
            self.filename = self.filename.strip()
            if not self.filename or "/" in self.filename or "\\" in self.filename:
                raise ValueError("Use a file display name without folder separators.")
        return self


class Region(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(default=0, ge=0, le=1)
    height: float = Field(default=0, ge=0, le=1)
    page_number: int = Field(default=1, ge=1, le=200)

    @model_validator(mode="after")
    def fits_page(self) -> "Region":
        if self.x + self.width > 1.00001 or self.y + self.height > 1.00001:
            raise ValueError("Region must fit inside the page.")
        return self


class AssetCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    region: Region
    layer: Layer = "client"
    tags: list[Tag] = Field(default_factory=list, max_length=6)
    client_request_id: str | None = Field(default=None, min_length=1, max_length=64)
