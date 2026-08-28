import random
import time
from datetime import datetime, timezone
from typing import List
from pydantic import BaseModel

SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", 
    "TATAMOTORS", "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK"
]
CLIENT_IDS = [f"CL-{i:05d}" for i in range(1001, 1080)]

class Trade(BaseModel):
    trade_id: str
    client: str
    symbol: str
    quantity: int
    price: float
    timestamp: str

def generate_mock_trades(total_count: int = 5000, seed: int = 42) -> List[Trade]:
    rng = random.Random(seed)
    trades: List[Trade] = []
    base_epoch = int(time.time()) - 43200
    
    for i in range(total_count):
        trade_id = f"BSE-TRD-{1000000 + i}"
        client = rng.choice(CLIENT_IDS)
        symbol = rng.choice(SYMBOLS)
        quantity = rng.choice([10, 25, 50, 100, 500, 1000])
        base_price = 1000.0 if "BANK" in symbol else 2500.0
        price = round(rng.uniform(base_price * 0.7, base_price * 1.3), 2)
        trade_time = datetime.fromtimestamp(base_epoch + (i * 8), tz=timezone.utc).isoformat()
        
        trades.append(
            Trade(
                trade_id=trade_id,
                client=client,
                symbol=symbol,
                quantity=quantity,
                price=price,
                timestamp=trade_time
            )
        )
    return trades