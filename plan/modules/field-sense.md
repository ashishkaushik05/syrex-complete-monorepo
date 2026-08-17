# Module: Field Sense
#status/in-progress

## What it does
Tracks field sales agents in real-time. Agents clock in via shifts, their GPS location streams to the backend (with RDP trail simplification), visits to outlets are logged, and attendance is auto-recorded. Live map in web dashboard shows active agents.

## Components
- **Backend:** `field-shifts.ts`, `field-location.ts`, `field-visits.ts`, `field-attendance.ts`, `field-stops.ts`, `field-analytics.ts`, `field-schedule.ts`, `field-sync-status.ts`
- **Cron:** `field-auto-start.ts` (every minute, ±2 min window), `field-auto-close.ts` (13:30 UTC / 19:00 IST)
- **Web:** FieldSenseLiveMapPage, FieldSenseShiftsPage, FieldSenseAttendancePage, FieldSenseVisitsPage, FieldSenseAnalyticsPage, FieldSenseStopsPage, FieldSenseSchedulePage
- **Mobile:** Flutter offline-first with SQLite queue + V2 sync worker (`LocationCaptureService`, `FieldSyncWorker`)
- **SSE:** `GET /field/live-stream` — raw Hono route, in-process `Map<orgId, Set<controller>>`

## Status
- ✅ Shift start/end (manual + auto-start cron)
- ✅ Location ingest with RDP simplification + SSE broadcast
- ✅ Visits, stops, attendance recording
- ✅ Live map (React-Leaflet + SSE consumer)
- ✅ Flutter offline sync V2 (SQLite queue + sync worker)
- ✅ Schedule management
- ✅ CronLock (process-safe, fixes C-16)
- ⚠️ Tests: only `field-batch06.test.ts` + `field-ingestion.test.ts` exist (partial)
- ⚠️ `field-analytics` routes exist but no web UI wired
- ❌ C-15: SSE connection Map unbounded (memory leak on abnormal disconnect)
- ❌ M-19: `ShiftSchedule @@unique([userId])` too restrictive

## Open Issues
- C-15 → [[audit/ISSUES#C-15]]
- M-19 → [[audit/ISSUES#M-19]]
- M-20 → [[audit/ISSUES#M-20]]
- L-15: No audit trail for field operations

## Key Decisions
- [[decisions/field-sense]] — all Field Sense decisions

## Related Docs
- [[field-module/HARDENING_IMPLEMENTATION_PLAN]]
- [[audit/agent-batches/05-field-sense-security]]
- [[audit/agent-batches/06-field-sense-reliability-cron]]
