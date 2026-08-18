"""
main.py — DUK Bus Tracker FastAPI application entry point.
"""
import asyncio
import logging
import html as html_lib
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import engine, Base, get_db
from config import get_settings
from services.notification_scheduler import notification_scheduler_loop
from services.ml_scheduler import ml_training_loop
from models.notification import Suggestion

# Import all models so Alembic / create_all sees them
import models  # noqa: F401

# Routers
from routers import auth, gps, tracking, admin
from services.live_gps_poller import live_gps_polling_loop

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger   = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup and start background tasks."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    logger.info("[STARTUP] Database tables ensured.")

    # Start the background notification scheduler (fires deferred push notifications)
    scheduler_task = asyncio.create_task(notification_scheduler_loop())
    logger.info("[STARTUP] Background notification scheduler started.")

    # Start the automated ML training scheduler
    ml_task = asyncio.create_task(ml_training_loop())
    logger.info("[STARTUP] Background ML training scheduler started.")

    # Start the Live GPS poller (for direct-to-supabase architecture)
    poller_task = asyncio.create_task(live_gps_polling_loop(gps.manager))
    logger.info("[STARTUP] Background Live GPS poller started.")

    yield

    # Gracefully cancel the scheduler on shutdown
    scheduler_task.cancel()
    ml_task.cancel()
    poller_task.cancel()
    try:
        await asyncio.gather(scheduler_task, ml_task, poller_task, return_exceptions=True)
    except asyncio.CancelledError:
        pass
    await engine.dispose()
    logger.info("[SHUTDOWN] Engine disposed.")


import os

app = FastAPI(
    title="DUK Bus Tracker API",
    version="1.0.0",
    description="Real-time bus tracking for Digital University Kerala",
    lifespan=lifespan,
    docs_url="/api/docs" if os.environ.get("ENV") != "prod" else None,
    redoc_url="/api/redoc" if os.environ.get("ENV") != "prod" else None,
)

from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler
from limiter import limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://legendary-gaufre-1dc00c.netlify.app",
    ],
    allow_origin_regex=r"https://legendary-gaufre-1dc00c\.netlify\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.middleware.base import BaseHTTPMiddleware

async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

app.add_middleware(BaseHTTPMiddleware, dispatch=security_headers_middleware)

from starlette.middleware.base import BaseHTTPMiddleware

async def log_cors_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    method = request.method
    path = request.url.path
    if method == "OPTIONS":
        logger.info(f"[CORS-DEBUG] OPTIONS {path} | Origin: {origin}")
    return await call_next(request)

app.add_middleware(BaseHTTPMiddleware, dispatch=log_cors_requests)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(gps.router)
app.include_router(tracking.router)
app.include_router(admin.router)

from routers import notifications
app.include_router(notifications.router)

# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "DUK Bus Tracker", "version": "2.0.0"}



class SuggestionCreate(BaseModel):
    suggestion: str
    trip:       str = ""
    location:   str = ""


@app.post("/api/v1/suggestion")
@limiter.limit("3/minute")
async def save_suggestion(req: SuggestionCreate, request: Request, db: AsyncSession = Depends(get_db)):
    from services.auth import decode_token
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return JSONResponse({"error": "Authentication required"}, status_code=401)
        
    token = auth_header.split(" ")[1]
    user_id = decode_token(token)
    if not user_id:
        return JSONResponse({"error": "Invalid token"}, status_code=401)
        
    suggestion_text = html_lib.escape(req.suggestion.strip())
    if not suggestion_text:
        return JSONResponse({"error": "Suggestion cannot be empty"}, status_code=400)
    if len(suggestion_text) > 500:
        return JSONResponse({"error": "Suggestion too long"}, status_code=400)

    s = Suggestion(
        suggestion=suggestion_text,
        trip=html_lib.escape(req.trip[:50]),
        location=html_lib.escape(req.location[:100]),
        user_id=user_id,
        status="pending"
    )
    db.add(s)
    await db.commit()
    return {"success": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5004, reload=True)
