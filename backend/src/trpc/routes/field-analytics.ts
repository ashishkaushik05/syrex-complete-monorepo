import { z } from 'zod'
import { createTRPCRouter, perm } from '../trpc'
import { apiError } from '../error'
import { resolveReadOrgId } from './field-helpers'

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'leave'

export function calculateAttendanceRate(rows: Array<{ status: AttendanceStatus }>) {
  if (rows.length === 0) return 0
  const attendanceScore = rows.reduce((sum, row) => {
    if (row.status === 'present') return sum + 1
    if (row.status === 'half_day') return sum + 0.5
    return sum
  }, 0)
  return Number(((attendanceScore / rows.length) * 100).toFixed(1))
}

export const fieldAnalyticsRouter = createTRPCRouter({
  summary: perm('field:read')
    .input(
      z.object({
        orgId: z.string().optional(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      }).optional(),
    )
    .query(async ({ ctx, input }) => {
      const orgId = resolveReadOrgId(ctx, input?.orgId)
      if (!orgId) throw apiError('BAD_REQUEST', 'orgId required for analytics')

      const date = input?.date ?? new Date().toISOString().slice(0, 10)
      const dayStart = new Date(`${date}T00:00:00.000Z`)
      const dayEnd = new Date(dayStart)
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1)

      const [
        activeShiftsToday,
        visitsToday,
        stopsToday,
        syncStatuses,
        attendanceRows,
      ] = await Promise.all([
        ctx.prisma.shift.count({
          where: { orgId, startedAt: { gte: dayStart, lt: dayEnd } },
        }),
        ctx.prisma.fieldVisit.count({
          where: { orgId, recordedAt: { gte: dayStart, lt: dayEnd } },
        }),
        ctx.prisma.fieldStop.count({
          where: { orgId, startedAt: { gte: dayStart, lt: dayEnd } },
        }),
        ctx.prisma.fieldSyncStatus.findMany({
          where: { orgId },
          select: {
            pendingQueueDepth: true,
            lastSyncErrorCode: true,
            updatedAt: true,
          },
        }),
        ctx.prisma.dailyAttendance.findMany({
          where: { orgId, date },
          select: { status: true },
        }),
      ])

      const now = Date.now()
      const healthBreakdown = { ACTIVE: 0, DELAYED: 0, STALE: 0, OFFLINE: 0, GPS_DISABLED: 0, SHIFT_DESYNC: 0 }
      let totalQueueDepth = 0
      const errorCounts: Record<string, number> = {}

      for (const s of syncStatuses) {
        const ageMs = now - s.updatedAt.getTime()
        const ageMin = ageMs / 60000

        if (s.lastSyncErrorCode === 'GPS_DISABLED') {
          healthBreakdown.GPS_DISABLED++
        } else if (s.lastSyncErrorCode === 'SHIFT_DESYNC') {
          healthBreakdown.SHIFT_DESYNC++
        } else if (ageMin <= 2) {
          healthBreakdown.ACTIVE++
        } else if (ageMin <= 10) {
          healthBreakdown.DELAYED++
        } else if (ageMin <= 30) {
          healthBreakdown.STALE++
        } else {
          healthBreakdown.OFFLINE++
        }

        if (s.pendingQueueDepth != null) totalQueueDepth += s.pendingQueueDepth
        if (s.lastSyncErrorCode) {
          errorCounts[s.lastSyncErrorCode] = (errorCounts[s.lastSyncErrorCode] ?? 0) + 1
        }
      }

      const avgPendingQueueDepth = syncStatuses.length > 0
        ? Math.round(totalQueueDepth / syncStatuses.length)
        : 0

      const topErrors = Object.entries(errorCounts)
        .map(([errorCode, count]) => ({ errorCode, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      const attendanceRate = calculateAttendanceRate(attendanceRows)

      return {
        orgId,
        date,
        activeShiftsToday,
        visitsToday,
        stopsToday,
        avgPendingQueueDepth,
        healthBreakdown,
        topErrors,
        attendanceRate,
        attendanceRecords: attendanceRows.length,
        approximateMetrics: [],
      }
    }),
})
