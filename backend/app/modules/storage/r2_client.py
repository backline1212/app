from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError

if TYPE_CHECKING:
    from mypy_boto3_s3.client import S3Client

from app.core.config import get_settings


def _make_client() -> S3Client:
    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint_url,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        region_name=settings.r2_region,
        config=BotoConfig(signature_version="s3v4"),
    )


async def ensure_bucket_exists() -> None:
    """Called once at startup (18-Storage-Deployment.md §18.6) - idempotent, so it's
    safe to call against a bucket that already exists (Atlas/R2 in staging/production)."""
    settings = get_settings()

    def _ensure() -> None:
        client = _make_client()
        try:
            client.head_bucket(Bucket=settings.r2_bucket_name)
        except ClientError:
            client.create_bucket(Bucket=settings.r2_bucket_name)

    await asyncio.to_thread(_ensure)


async def generate_presigned_put(
    key: str, content_type: str, content_length: int, expires_in: int = 300
) -> str:
    """18-Storage-Deployment.md §18.2: short-lived (5 min), scoped to a single key -
    the caller (SDK) never sees R2 credentials.

    `ContentLength` is signed as part of the request, same as `ContentType` - S3/R2
    reject a PUT whose actual Content-Length header doesn't match exactly what was
    signed here. A plain presigned PUT (unlike a presigned POST policy) has no native
    "maximum size" condition, but pinning it to the exact size the client declared
    up front (and that storage/schemas.py's UploadRequest already caps at
    MAX_UPLOAD_SIZE_BYTES) achieves the same effect: the client cannot upload more
    bytes than it told the server about."""
    settings = get_settings()

    def _generate() -> str:
        client = _make_client()
        url: str = client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": key,
                "ContentType": content_type,
                "ContentLength": content_length,
            },
            ExpiresIn=expires_in,
        )
        return url

    return await asyncio.to_thread(_generate)


async def generate_presigned_get(key: str, expires_in: int = 3600) -> str:
    """18-Storage-Deployment.md §18.2: screenshots are never served from a public
    bucket - a signed GET (1 hour TTL) is generated on-demand whenever a comment is
    read, since a screenshot's page context may not be intended as publicly enumerable
    even for a client-visible comment. §18.3 additionally asks for a short (5 min)
    Cache-Control on the response, since the URL itself is signed and rotates - found
    missing during the Milestone 11 hardening audit (docs/tdr/0010)."""
    settings = get_settings()

    def _generate() -> str:
        client = _make_client()
        url: str = client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.r2_bucket_name,
                "Key": key,
                "ResponseCacheControl": "private, max-age=300",
            },
            ExpiresIn=expires_in,
        )
        return url

    return await asyncio.to_thread(_generate)


async def upload_bytes(key: str, data: bytes, content_type: str) -> None:
    """Server-side upload, used for snapshot JSON (the backend compresses and writes it
    itself, unlike screenshots which the client PUTs directly via a presigned URL)."""
    settings = get_settings()

    def _upload() -> None:
        client = _make_client()
        client.put_object(
            Bucket=settings.r2_bucket_name, Key=key, Body=data, ContentType=content_type
        )

    await asyncio.to_thread(_upload)


async def download_bytes(key: str) -> bytes:
    """Server-side read-back, used by the recovery pipeline (10-Revision-Recovery.md) to
    load a previous revision's snapshot payload for diffing/matching - the only other
    reader of snapshot JSON is the SDK itself, which never reads its own uploads back."""
    settings = get_settings()

    def _download() -> bytes:
        client = _make_client()
        response = client.get_object(Bucket=settings.r2_bucket_name, Key=key)
        body: bytes = response["Body"].read()
        return body

    return await asyncio.to_thread(_download)


async def list_object_keys(prefixes: list[str]) -> list[str]:
    """Enumerate private objects under already-authorized project prefixes."""
    settings = get_settings()

    def _list() -> list[str]:
        client = _make_client()
        keys: set[str] = set()
        paginator = client.get_paginator("list_objects_v2")
        for prefix in prefixes:
            for page in paginator.paginate(Bucket=settings.r2_bucket_name, Prefix=prefix):
                keys.update(str(item["Key"]) for item in page.get("Contents", []))
        return sorted(keys)

    return await asyncio.to_thread(_list)


async def delete_object(key: str) -> None:
    """Idempotently remove one object; S3 DELETE succeeds when the key is absent."""
    settings = get_settings()

    def _delete() -> None:
        _make_client().delete_object(Bucket=settings.r2_bucket_name, Key=key)

    await asyncio.to_thread(_delete)
