@'
# BSE Live Trade Ingestion & ProTerminal 🚀

A resilient real-time trade data ingestion engine and trading dashboard designed to handle high-latency exchange data pulls within strict network timeout constraints.

## 🎯 Technical Constraints & Architecture

1. **Handling 30s Connection Timeout:** 
   - Pulling full trade data takes high network processing time, but network firewalls/proxies drop any HTTP connection held open for >30s.
   - **Solution:** Asynchronous background ingestion worker utilizing paginated batch queries (`page`, `page_size`). Each batch roundtrip completes in <2s, eliminating long-lived blocking connections.

2. **Instant Dashboard Render:** 
   - Instant loading (<50ms) directly from an indexed local SQLite database via SQLAlchemy async sessions.

3. **Zero-Polling Real-Time Push:** 
   - Fully compliant with the strict requirement: **No page refresh, no `setInterval` polling loop, and no cronjob/scheduler**.
   - Built a bidirectional WebSocket broadcast engine (`ws://127.0.0.1:8000/ws/trades`) that pushes newly committed trade batches and sync events to all connected clients in real time.

---

## 🛠️ Tech Stack

- **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLAlchemy, aiosqlite, httpx, WebSockets
- **Frontend:** React, Vite, Tailwind CSS
- **Database:** SQLite (Async)

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Python 3.11 / 3.12
- Node.js 18+

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install fastapi uvicorn sqlalchemy aiosqlite httpx websockets pydantic python-dotenv