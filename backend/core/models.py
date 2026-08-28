from sqlalchemy import Column, String, Integer, Float, DateTime, func
from backend.core.database import Base

class TradeRecord(Base):
    __tablename__ = "trades"

    trade_id = Column(String, primary_key=True, index=True)
    client = Column(String, index=True, nullable=False)
    symbol = Column(String, index=True, nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    trade_timestamp = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class SyncState(Base):
    __tablename__ = "sync_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    status = Column(String, default="IDLE")  # IDLE, IN_PROGRESS, COMPLETED, FAILED
    last_synced_at = Column(DateTime, nullable=True)
    total_trades_synced = Column(Integer, default=0)
    current_page = Column(Integer, default=0)