from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class BacklineError(Exception):
    code: str = "INTERNAL_ERROR"
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, message: str, details: dict[str, object] | None = None) -> None:
        self.message = message
        self.details = details or {}
        super().__init__(message)


class NotFoundError(BacklineError):
    code = "NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


class AuthenticationError(BacklineError):
    """Missing, malformed, expired, or revoked credentials - distinct from
    PermissionDeniedError (a valid session that simply isn't authorized for the
    action/resource). The frontend's api-client treats 401 as "worth a silent
    refresh retry" and 403 as "show a permission error," so this distinction is
    load-bearing, not cosmetic."""

    code = "UNAUTHENTICATED"
    status_code = status.HTTP_401_UNAUTHORIZED


class PermissionDeniedError(BacklineError):
    code = "PERMISSION_DENIED"
    status_code = status.HTTP_403_FORBIDDEN


class ValidationError(BacklineError):
    code = "VALIDATION_ERROR"
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY


class ConflictError(BacklineError):
    code = "CONFLICT"
    status_code = status.HTTP_409_CONFLICT


class PlanLimitExceededError(BacklineError):
    code = "PLAN_LIMIT_EXCEEDED"
    status_code = status.HTTP_402_PAYMENT_REQUIRED


class ExternalServiceError(BacklineError):
    code = "EXTERNAL_SERVICE_ERROR"
    status_code = status.HTTP_502_BAD_GATEWAY


async def backline_error_handler(request: Request, exc: BacklineError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(BacklineError, backline_error_handler)  # type: ignore[arg-type]
