import asyncio
from fastapi import FastAPI, Query
from backend.mock_bse.generator import generate_mock_trades

# 1. Top-level FastAPI instance that Uvicorn looks for
app = FastAPI(
    title="Mock BSE Exchange Gateway",
    description="Simulates BSE Exchange API with configurable latency",
    version="1.0.0"
)

# 2. Seed 5,000 trades in memory
DATASET = generate_mock_trades(total_count=5000, seed=42)

@app.get("/")
async def root():
    return {"message": "Mock BSE Server is online. Visit /docs for Swagger."}

@app.get("/health")
async def health():
    return {"status": "healthy", "seeded_trades": len(DATASET)}

@app.get("/getTrades")
async def get_trades(
    delay_seconds: float = Query(default=2.0, description="Simulated fetch delay in seconds"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=500, ge=1, le=2000)
):
    """
    Simulates high exchange latency without blocking the server loop.
    Returns chunked trade data.
    """
    if delay_seconds > 0:
        await asyncio.sleep(delay_seconds)
    
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    
    if start_idx >= len(DATASET):
        return {
            "status": "SUCCESS",
            "total_records": len(DATASET),
            "page": page,
            "page_size": page_size,
            "has_more": False,
            "trades": []
        }
        
    records = DATASET[start_idx:end_idx]
    return {
        "status": "SUCCESS",
        "total_records": len(DATASET),
        "page": page,
        "page_size": page_size,
        "returned_count": len(records),
        "has_more": end_idx < len(DATASET),
        "trades": records
    }