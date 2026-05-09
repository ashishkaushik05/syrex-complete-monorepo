# BatteryOS — Formalized Architecture & Implementation Guidelines
**Version:** 1.0 | **Date:** 2026-05-09 | **Status:** Locked

---

## 1. Scope Statement

BatteryOS is added as a set of new modules **within the existing syrex-new-api monorepo**. It is not a separate application. It shares the same auth system, role/permission system, Postgres database, and tRPC API surface as the distribution platform.

The system covers three concerns:
1. **Manufacturing Core** — define what you make, log what you made, track raw material stock
2. **Inter-Warehouse Transfers** — move finished stock from factory (Hisar) to other godowns
3. **Production Intelligence** — demand signal engine + LP optimizer producing SKU distribution recommendations

Full work order execution (stage-by-stage floor tracking) is **explicitly deferred**. The production side in this version is a logging system.

---

## 2. What Is In Scope vs. Deferred

### In Scope
| Module | Description |
|---|---|
| RM Master | Raw material definitions, reorder points, lead times |
| RM Stock Ledger | Double-entry ledger: GRN, issue, return, adjustment, wastage |
| SKU & BOM Builder | Generic manufacturing SKU definitions with stage → input chains |
| Production Log | Simple daily log: SKU + qty made + RM consumed |
| MfgSku ↔ Product Link | Manual 1:1 link between a manufacturing SKU and a catalog Product |
| Inter-Warehouse Transfer | Transfer orders from Hisar to other godowns, in-transit tracking, receipt confirmation |
| Optimizer Service | Separate worker: demand signal + LP solver → SKU % distribution broadcast |
| Optimizer History | Log of every optimizer run with inputs, weights, and output |
| Manufacturing Dashboard | RM stock levels, recent production logs, RM alerts |

### Explicitly Deferred
| Feature | Reason |
|---|---|
| Work Order execution (stage tracking) | Too complex for MVP; production logging is sufficient |
| Stage buffer tracking | Requires work orders; deferred with work orders |
| Automatic GoodsReceipt from production | Manual confirmation by store person; not auto |
| ML demand forecasting (Mode B) | Needs 6+ months of live data first; hook exists, not built |
| Multi-plant support | Single factory to Hisar flow only |
| Cost accounting / BOM costing | Post-MVP |

---

## 3. Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Same VPS                               │
│                                                                 │
│  ┌─────────────────────────────────┐   ┌───────────────────┐   │
│  │   Main API (existing)           │   │  Optimizer Worker  │   │
│  │   Bun + Hono + tRPC             │   │  Python (FastAPI)  │   │
│  │                                 │   │  or Fastify        │   │
│  │  + manufacturing.*  routes      │◄──┤                    │   │
│  │  + transfers.*      routes      │   │  LP solver         │   │
│  │  + optimizer.*      routes      │──►│  Demand signal     │   │
│  │    (proxy to worker)            │   │  engine            │   │
│  └──────────────┬──────────────────┘   └────────┬──────────┘   │
│                 │                               │               │
│         ┌───────▼───────┐              ┌────────▼──────┐       │
│         │   Postgres    │              │     Redis      │       │
│         │  (shared DB)  │              │  (job queue +  │       │
│         └───────────────┘              │   result cache)│       │
│                                        └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

**Communication pattern:**
- Main API enqueues an optimizer job onto Redis when planner triggers a run
- Optimizer worker picks it up, runs the LP, writes result to Postgres + Redis cache
- Main API reads result from DB/cache and returns it to the client
- No synchronous blocking — optimizer runs async, result is polled or notified via existing notification system

---

## 4. Database Schema — New Models

All manufacturing models use `Mfg` prefix. All IDs are human-readable strings where user-facing; internal join tables use `BIGSERIAL`.

### 4.1 RM Master & Ledger

```
MfgRmMaster         — raw material definitions (code, name, category, UOM, reorder_point, lead_time_days)
MfgRmStockLedger    — every RM movement (GRN, ISSUE, RETURN, WASTAGE, ADJUSTMENT_IN, ADJUSTMENT_OUT)
```

Balance is always computed from ledger sum. No stored balance field.

### 4.2 SKU & BOM Builder

```
MfgSku              — manufacturing SKU definition (generic, no mandatory Product link)
                      optional: productId (1:1 to existing Product, manually set)
MfgStageDefinition  — ordered stages per SKU (sequence, yield%, buffer%, duration)
MfgStageCapacity    — capacity constraints per stage (max_units/batch, duration_hrs, cooldown_hrs)
MfgStageInput       — inputs per stage: RAW_MATERIAL (qty per output unit) or STAGE_OUTPUT (upstream stage)
```

Key rule: `MfgSku` is fully self-contained. A manufacturing SKU does not need to be linked to any catalog `Product`. The link is optional and manual (permission-gated).

### 4.3 Production Logging

```
MfgProductionLog    — one log entry per production batch
                      fields: id (LOG-YYYYMMDD-SEQ), mfgSkuId, date, qty_produced,
                               notes, createdById
MfgProductionLogRm  — RM consumed in a production log entry
                      fields: logId, rmId, qty_consumed, lot_number
```

When a log entry is saved, RM stock ledger entries (type: ISSUE) are auto-created for each RM consumed.

### 4.4 Inter-Warehouse Transfers

```
WarehouseTransfer      — transfer header (fromWarehouseId, toWarehouseId, status, dispatchDate, receivedAt)
                         status: DRAFT | IN_TRANSIT | RECEIVED | CANCELLED
WarehouseTransferLine  — per product (productId, qty_sent, qty_received)
```

On RECEIVED confirmation: `WarehouseStock` decremented at source, incremented at destination.

### 4.5 Optimizer

```
OptimizerRun           — log of every run (id, triggeredById, horizon_days, weights JSON,
                          demand_signal_config JSON, status, createdAt, completedAt)
OptimizerRecommendation — output rows (runId, mfgSkuId/productId, recommended_qty,
                           pct_of_total, confidence_score, reasoning JSON)
```

### 4.6 New Sequences

```
MfgLogSequence         — year-based sequence for LOG-YYYYMMDD-SEQ IDs
MfgTransferSequence    — year-based sequence for TRF-YYYYMMDD-SEQ IDs
```

---

## 5. tRPC Router Additions

```
manufacturing.rm.*           — RM master CRUD, GRN, adjustments, balance queries
manufacturing.skus.*         — MfgSku CRUD, stage/capacity/input builder, BOM preview
manufacturing.productionLog.*— create log entry, list logs, RM consumption summary
manufacturing.dashboard.*    — RM stock snapshot, RM alerts, recent production summary

transfers.*                  — create transfer, update status, receive confirmation, list

optimizer.trigger            — enqueue a new optimizer run
optimizer.runs               — list past runs with status
optimizer.result             — get recommendation output for a run
```

All under the existing `appRouter`. No separate API — main API proxies optimizer jobs to the worker via Redis.

---

## 6. ID Conventions

| Entity | Format | Example |
|---|---|---|
| MfgSku | `MSKU-{CODE}` | `MSKU-NEG-PLATE-135AH` |
| MfgRmMaster | `RM-{CODE}` | `RM-GREY-OXIDE` |
| MfgProductionLog | `LOG-YYYYMMDD-SEQ` | `LOG-20260509-001` |
| WarehouseTransfer | `TRF-YYYYMMDD-SEQ` | `TRF-20260509-001` |
| OptimizerRun | `OPT-YYYYMMDD-SEQ` | `OPT-20260509-001` |
| MfgStageDefinition | `BIGSERIAL` (internal) | — |
| All other manufacturing | `BIGSERIAL` (internal) | — |

---

## 7. Permissions Added to Existing System

New permission strings added to the existing `Role.permissions[]` array:

```
mfg:rm:read            mfg:rm:write
mfg:sku:read           mfg:sku:write
mfg:sku:link_product   (link MfgSku to Product — sensitive, admin-level)
mfg:log:read           mfg:log:write
mfg:dashboard:read
transfer:read          transfer:write          transfer:receive
optimizer:trigger      optimizer:read
```

No new role model changes. Company configures custom roles on the existing roles page by assigning these permission strings.

---

## 8. Optimizer Design

### Demand Signal (configurable per run)

The planner selects one or a weighted combination:

| Signal | How it works |
|---|---|
| `ROLLING_VELOCITY` | Last N days order lines → avg daily demand per SKU × horizon days |
| `PENDING_ORDERS` | Sum of qty from open `SaleOrder` lines not yet dispatched, per SKU |
| `MANUAL_TARGETS` | Planner enters expected demand per SKU directly |

Config stored in `OptimizerRun.demand_signal_config` as JSON:
```json
{
  "mode": "weighted",
  "signals": [
    { "type": "ROLLING_VELOCITY", "lookback_days": 30, "weight": 0.6 },
    { "type": "PENDING_ORDERS", "weight": 0.4 }
  ]
}
```

### Objective Weights (configurable per run)

```json
{
  "fill_orders": 0.5,
  "maximize_throughput": 0.3,
  "clear_rm_stock": 0.2
}
```

Default priority order: fill orders → throughput → clear RM. Stored in `OptimizerRun.weights`.

### Output

Not a production plan. Output is:

```
Total recommended production: ~820 batteries over 30 days

SKU Distribution:
  TT17536    32%   ~262 units
  TT18036    24%   ~197 units
  TT22036    18%   ~148 units
  TT22060    14%   ~115 units
  JT16024     7%    ~57 units
  JT18024     5%    ~41 units

Confidence: Medium (based on 5-month order history)
Demand signal: 60% rolling velocity (30d) + 40% pending orders
```

Stored in `OptimizerRecommendation` rows. No production runs auto-created. Human reads it and creates production plans manually if they choose to.

### Horizon & Trigger
- 30-day rolling horizon
- On-demand only — planner triggers via `optimizer.trigger`
- Result available async (poll `optimizer.result` or notification)

---

## 9. ML Forecasting Hook (deferred, stub only)

The optimizer worker is built with a `forecastAdapter` interface:

```python
class DemandSignalProvider:
    def get_demand(self, sku_ids, horizon_days, config) -> dict[str, float]:
        raise NotImplementedError

class RollingVelocitySignal(DemandSignalProvider): ...  # built now
class PendingOrdersSignal(DemandSignalProvider): ...    # built now
class MLForecastSignal(DemandSignalProvider): ...       # stub, implemented later
```

When ML forecasting is added, only `MLForecastSignal` is implemented. The optimizer LP and output format don't change. This is the only coupling point.

---

## 10. GoodsReceipt Flow (Production → Warehouse Stock)

```
Factory makes batteries
    │
    ▼
Store person opens "New GoodsReceipt" in existing inventory module
    │  sourceType = production_line_movement
    │  warehouseId = Hisar warehouse ID
    │  links to MfgProductionLog entry (optional reference)
    ▼
GoodsReceipt confirmed → WarehouseStock updated (existing flow, unchanged)
    │
    ▼
Stock now available for sale orders and dispatch
```

No new code path for this. The existing `GoodsReceipt` flow handles it.
`sourceBatchId` on `GoodsReceipt` stores the `MfgProductionLog.id` as the reference.

---

## 11. Inter-Warehouse Transfer Flow

```
Hisar has stock → planner creates WarehouseTransfer (DRAFT)
    │  fromWarehouseId = Hisar
    │  toWarehouseId = target godown
    │  lines: productId + qty_sent per product
    ▼
Status → IN_TRANSIT (stock reserved at source, not yet decremented)
    ▼
Destination godown confirms receipt → qty_received per line entered
    ▼
Status → RECEIVED
    → WarehouseStock at Hisar: currentQty -= qty_received
    → WarehouseStock at destination: currentQty += qty_received
```

Note: `reservedQty` at source is used during IN_TRANSIT so it doesn't double-allocate to sale orders.

---

## 12. Phase Plan

### Phase 4 — Manufacturing Catalogue (BatteryOS Ph1)
**Goal:** Define any SKU with any number of stages and inputs. Seed from BOM.xlsx.

Deliverables:
- `MfgRmMaster` CRUD
- `MfgSku` CRUD (generic, no mandatory product link)
- `MfgStageDefinition` + `MfgStageCapacity` + `MfgStageInput` builder
- BOM preview: enter qty → get full RM breakdown (backward traversal)
- Seed script from `BOM.xlsx`

Done when: Can define a full negative plate process and get correct BOM for any target qty.

---

### Phase 5 — Production Logging & RM Stock
**Goal:** Record what was made. Track raw material stock in real time.

Deliverables:
- `MfgProductionLog` CRUD (date, SKU, qty made, RM consumed)
- RM stock ledger (GRN, ISSUE auto-created on log save, manual ADJUSTMENT)
- RM balance view (current stock, running ledger)
- RM alert thresholds (below reorder point)
- `MfgSku ↔ Product` manual link (permission: `mfg:sku:link_product`)

Done when: Store person can record a day's production, RM stock updates automatically, and low-stock alerts appear.

---

### Phase 6 — Inter-Warehouse Transfers
**Goal:** Move finished batteries from Hisar to other godowns with full traceability.

Deliverables:
- `WarehouseTransfer` lifecycle (DRAFT → IN_TRANSIT → RECEIVED)
- Stock reservation at source during transit
- Receipt confirmation at destination
- Stock updates on both ends
- Transfer history per warehouse

Done when: A Hisar transfer to Lucknow is created, dispatched, confirmed at LKN, and both warehouse stock balances reflect correctly.

---

### Phase 7 — Manufacturing Dashboard
**Goal:** One screen showing RM health, recent production, and stock readiness.

Deliverables:
- RM stock snapshot (all materials, current balance, days of cover)
- RM alert list (below reorder, zero stock)
- Recent production log summary (last 30 days, per SKU)
- Pending transfer status
- `manufacturing.dashboard.*` tRPC routes

Done when: A plant manager opens the app and sees RM health + production output without asking anyone.

---

### Phase 8 — Optimizer (Mode A)
**Goal:** LP-based SKU distribution recommendation, on-demand.

Deliverables:
- Optimizer worker service (Python FastAPI or Fastify, same VPS)
- Redis job queue between main API and worker
- Demand signal engine (ROLLING_VELOCITY + PENDING_ORDERS + MANUAL_TARGETS)
- LP solver with configurable objective weights
- `OptimizerRun` + `OptimizerRecommendation` schema
- `optimizer.*` tRPC routes (trigger, result, history)

Done when: Planner triggers a run, selects demand signal mix and weights, gets a SKU % distribution recommendation within 30 seconds.

---

### Phase 9 — Historical Data Import (when data is ready)
**Goal:** Import 1-2 years of order history to power the demand signal.

Deliverables:
- Legacy column → canonical `productId` mapping table
- ETL pipeline: CSV → staging → `sale_orders` + `sale_order_lines`
- Dealer normalization: 270 spellings → proper `Outlet` records
- Import audit log

Done when: Full order history is queryable in `sale_orders`, optimizer's ROLLING_VELOCITY signal has 12+ months of data.

---

### Phase 10 — ML Forecasting (Mode B, after 6+ months live data)
**Goal:** Replace or supplement ROLLING_VELOCITY with an ML-based demand forecast.

Deliverables:
- `MLForecastSignal` implementation in optimizer worker
- Time-series model (Prophet or gradient-boosted, per SKU per warehouse)
- Confidence interval output fed into optimizer
- Model retraining schedule

Done when: Optimizer can optionally use ML forecast as demand signal and shows higher accuracy vs. rolling average on held-out validation window.

---

## 13. What Is Explicitly Not In This Plan

| Out of scope | Note |
|---|---|
| Work order execution / floor tracking | Deferred; production is logged not orchestrated |
| Stage buffer tracking | Requires work orders |
| Automated production run creation from optimizer | Output is advisory only |
| Supplier / PO management | RM entered fresh, no supplier portal |
| Multi-plant | Single factory flow |
| Mobile app | API-first; frontend after API |
| BOM costing | Post-MVP |

---

*Locked: 2026-05-09. All implementation must follow this document. Changes require a new DEC entry in DECISION_LOG.md.*
