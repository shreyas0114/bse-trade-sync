import asyncio
import logging
import httpx
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from backend.core.database import AsyncSessionLocal
from backend.core.models import TradeRecord, SyncState

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("IngestionEngine")

BSE_API_URL = "http://127.0.0.1:8001/getTrades"

class IngestionWorker:
    _is_running = False

    @classmethod
    def is_running(cls) -> bool:
        return cls._is_running

    @classmethod
    async def run_sync_job(cls, notify_callback=None):
        """
        Pulls all trades chunk-by-chunk from BSE mock API.
        Each chunk is fetched in seconds, completely avoiding the 30s connection timeout.
        """
        if cls._is_running:
            logger.warning("Sync job already in progress. Skipping trigger.")
            return
        
        cls._is_running = True
        logger.info("Starting BSE Trade Sync ingestion job...")

        async with AsyncSessionLocal() as db:
            sync_entry = (await db.execute(select(SyncState).where(SyncState.id == 1))).scalar_one_or_none()
            if not sync_entry:
                sync_entry = SyncState(id=1, status="IN_PROGRESS")
                db.add(sync_entry)
            else:
                sync_entry.status = "IN_PROGRESS"
            await db.commit()

        if notify_callback:
            await notify_callback({"event": "SYNC_STARTED"})

        page = 1
        page_size = 500
        has_more = True
        total_new_trades = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                while has_more:
                    logger.info(f"Fetching chunk: Page {page}...")
                    
                    response = await client.get(
                        BSE_API_URL, 
                        params={"delay_seconds": 1.5, "page": page, "page_size": page_size}
                    )
                    
                    if response.status_code != 200:
                        raise Exception(f"BSE API returned status {response.status_code}")

                    payload = response.json()
                    trades = payload.get("trades", [])
                    has_more = payload.get("has_more", False)

                    if trades:
                        async with AsyncSessionLocal() as db:
                            for t in trades:
                                stmt = sqlite_insert(TradeRecord).values(
                                    trade_id=t["trade_id"],
                                    client=t["client"],
                                    symbol=t["symbol"],
                                    quantity=t["quantity"],
                                    price=t["price"],
                                    trade_timestamp=t["timestamp"]
                                ).on_conflict_do_nothing(index_elements=["trade_id"])
                                await db.execute(stmt)

                            await db.commit()
                            total_new_trades += len(trades)

                        if notify_callback:
                            await notify_callback({
                                "event": "CHUNK_PROCESSED",
                                "page": page,
                                "trades_in_chunk": len(trades),
                                "total_so_far": total_new_trades
                            })

                    page += 1

                async with AsyncSessionLocal() as db:
                    sync_entry = (await db.execute(select(SyncState).where(SyncState.id == 1))).scalar_one()
                    sync_entry.status = "COMPLETED"
                    sync_entry.last_synced_at = datetime.now(timezone.utc)
                    sync_entry.total_trades_synced = total_new_trades
                    sync_entry.current_page = page - 1
                    await db.commit()

                logger.info(f"Sync complete! Ingested {total_new_trades} total trades.")
                if notify_callback:
                    await notify_callback({
                        "event": "SYNC_COMPLETED",
                        "total_trades": total_new_trades
                    })

            except Exception as e:
                logger.error(f"Sync failed: {e}")
                async with AsyncSessionLocal() as db:
                    sync_entry = (await db.execute(select(SyncState).where(SyncState.id == 1))).scalar_one_or_none()
                    if sync_entry:
                        sync_entry.status = "FAILED"
                        await db.commit()
                if notify_callback:
                    await notify_callback({"event": "SYNC_FAILED", "error": str(e)})

            finally:
                cls._is_running = False