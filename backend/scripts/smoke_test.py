#!/usr/bin/env python3
"""Read-only post-deploy API check; exits non-zero on a failed release gate.

Run from backend with ``uv run python scripts/smoke_test.py [base_url]``.
Use ``--expected-sha`` to prove which API revision answered and ``--contract``
to compare its live OpenAPI document with a saved checkout contract. A separate
``--expected-worker-sha`` proves a recently reporting Arq worker revision.
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import httpx

DEFAULT_BASE_URL = "http://localhost:8000"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "base_url",
        nargs="?",
        default=os.environ.get("SMOKE_TEST_BASE_URL", DEFAULT_BASE_URL),
    )
    parser.add_argument("--expected-sha", help="Expected full 40-character API commit SHA")
    parser.add_argument("--expected-worker-sha", help="Expected full 40-character Arq worker SHA")
    parser.add_argument("--contract", type=Path, help="Saved OpenAPI JSON to compare exactly")
    args = parser.parse_args()

    for flag, sha in (
        ("--expected-sha", args.expected_sha),
        ("--expected-worker-sha", args.expected_worker_sha),
    ):
        if sha and not re.fullmatch(r"[0-9a-fA-F]{40}", sha):
            parser.error(f"{flag} must be a full 40-character hexadecimal commit SHA")

    expected_contract: dict[str, Any] | None = None
    if args.contract:
        try:
            expected_contract = json.loads(args.contract.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            parser.error(f"cannot read --contract: {exc}")
        if not isinstance(expected_contract, dict) or "paths" not in expected_contract:
            parser.error("--contract must be an OpenAPI JSON object with paths")

    print(f"Smoke testing {args.base_url}")
    try:
        with httpx.Client(base_url=args.base_url, timeout=10.0, follow_redirects=False) as client:
            health = client.get("/health", headers={"Cache-Control": "no-cache"})
            if health.status_code != 200:
                print(f"FAIL: /health returned {health.status_code}")
                return 1
            try:
                body = health.json()
            except ValueError:
                print("FAIL: /health did not return JSON")
                return 1
            if not isinstance(body, dict) or any(
                body.get(key) != "ok" for key in ("status", "mongo", "redis")
            ):
                print("FAIL: /health did not report healthy API, MongoDB and Redis")
                return 1
            release_sha = body.get("release_sha")
            if args.expected_sha and release_sha != args.expected_sha.lower():
                print(f"FAIL: API release {release_sha!r} differs from {args.expected_sha.lower()}")
                return 1
            print(f"OK: /health (mongo ok, redis ok; release {release_sha or 'unreported'})")
            worker = body.get("worker")
            if worker is not None:
                if not isinstance(worker, dict) or worker.get("status") not in (
                    "recent",
                    "unknown",
                ):
                    print("FAIL: /health worker observation has an unexpected response")
                    return 1
                print(
                    "OK: worker observation "
                    f"({worker['status']}; release {worker.get('release_sha') or 'unreported'})"
                )
            if args.expected_worker_sha and (
                not isinstance(worker, dict)
                or worker.get("status") != "recent"
                or worker.get("release_sha") != args.expected_worker_sha.lower()
            ):
                print("FAIL: recent worker release differs from the expected SHA")
                return 1

            capabilities = client.get("/api/v1/auth/capabilities")
            if capabilities.status_code != 200:
                print(f"FAIL: /api/v1/auth/capabilities returned {capabilities.status_code}")
                return 1
            try:
                capability_body = capabilities.json()
            except ValueError:
                print("FAIL: /api/v1/auth/capabilities did not return JSON")
                return 1
            if not isinstance(capability_body, dict) or not isinstance(
                capability_body.get("google_sign_in"), bool
            ):
                print("FAIL: /api/v1/auth/capabilities has an unexpected response")
                return 1
            print("OK: /api/v1/auth/capabilities")

            openapi = client.get("/openapi.json")
            if openapi.status_code != 200:
                print(f"FAIL: /openapi.json returned {openapi.status_code}")
                return 1
            try:
                live_contract = openapi.json()
            except ValueError:
                print("FAIL: /openapi.json did not return JSON")
                return 1
            if not isinstance(live_contract, dict) or not isinstance(
                live_contract.get("paths"), dict
            ):
                print("FAIL: /openapi.json has no paths object")
                return 1
            if expected_contract is not None and live_contract != expected_contract:
                print("FAIL: live OpenAPI differs from the saved contract")
                return 1
            print(f"OK: /openapi.json ({len(live_contract['paths'])} paths)")
    except httpx.HTTPError as exc:
        print(f"FAIL: API request failed - {exc}")
        return 1

    print("Smoke test passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
