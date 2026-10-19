"""One error shape for every endpoint, as defined in the API contract:

    { "error": { "code": "SOME_CODE", "message": "...", ...extra } }
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Raise this from an endpoint to return a contract-shaped error."""

    def __init__(self, status_code: int, code: str, message: str, **extra):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.extra = extra


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        body = {"code": exc.code, "message": exc.message, **exc.extra}
        return JSONResponse(status_code=exc.status_code, content={"error": body})

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [".".join(str(p) for p in e["loc"] if p != "body") for e in exc.errors()]
        body = {
            "code": "VALIDATION_ERROR",
            "message": "Some fields are missing or invalid.",
            "fields": fields,
        }
        return JSONResponse(status_code=422, content={"error": body})
