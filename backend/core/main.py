from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Depends, BackgroundTasks, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
import os

from backend.core.database import init_db, get_db
from backend.core.models import TradeRecord, SyncState
from backend.core.ingestion import IngestionWorker
from backend.core.websocket_manager import ws_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield

app = FastAPI(title="BSE Trades Ingestion & Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ingestion event callback to broadcast over WebSocket
async def ingestion_event_listener(event_payload: dict):
    await ws_manager.broadcast(event_payload)

@app.websocket("/ws/trades")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep-alive heartbeat listener
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

@app.get("/trades")
async def get_stored_trades(
    limit: int = Query(default=100, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
    symbol: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Instant query from local database."""
    stmt = select(TradeRecord).order_by(desc(TradeRecord.trade_timestamp))
    if symbol:
        stmt = stmt.where(TradeRecord.symbol == symbol.upper())
    
    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    trades = result.scalars().all()
    
    sync_entry = (await db.execute(select(SyncState).where(SyncState.id == 1))).scalar_one_or_none()
    
    return {
        "status": "SUCCESS",
        "sync_status": sync_entry.status if sync_entry else "IDLE",
        "last_synced_at": sync_entry.last_synced_at.isoformat() if (sync_entry and sync_entry.last_synced_at) else None,
        "total_synced": sync_entry.total_trades_synced if sync_entry else 0,
        "count": len(trades),
        "data": trades
    }

@app.post("/trigger-pull")
async def trigger_pull(background_tasks: BackgroundTasks):
    """Triggers non-blocking background pull that broadcasts updates over WS."""
    if IngestionWorker.is_running():
        return {"status": "ALREADY_RUNNING", "message": "A pull operation is currently in progress."}
    
    background_tasks.add_task(IngestionWorker.run_sync_job, notify_callback=ingestion_event_listener)
    return {"status": "STARTED", "message": "Background trade ingestion initiated."}

# Mount static folder for Frontend Dashboard
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

@app.get("/dashboard")
async def serve_dashboard():
    index_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "index.html")
    return FileResponse(index_path)