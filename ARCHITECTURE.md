@'
# Architecture Design Note: BSE Trade Sync Engine & Real-Time Terminal

## 1. Problem Statement & Operational Constraints
- **Exchange High Latency:** Extracting full trade data sets can take up to 15 minutes.
- **Network Timeout Limit:** Any open HTTP connection exceeding 30 seconds is killed by intermediate proxies.
- **Real-Time Client Experience:** The dashboard must load instantaneously on mount (<50ms) and dynamically receive new trades as pulls complete with **zero page refreshes, zero polling loops (`setInterval`), and no cron schedules**.

---

## 2. High-Level Architecture & Data Flow Diagram