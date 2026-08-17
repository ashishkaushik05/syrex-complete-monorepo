import { describe, expect, it } from "bun:test";
import { appRouter } from "../router";
import { P } from "../../rbac/catalog";
import { broadcasts, resetBroadcasts } from "../../infra/sse";
import { resetIngestBucket } from "./field-location";

function createFieldMock() {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const agentId = "22222222-2222-4222-8222-222222222222";
  const shifts: any[] = [];
  const locations: any[] = [];

  const prisma = {
    user: {
      findUnique: async (args: any) => {
        if (args.include?.role) {
          return {
            id: agentId,
            isActive: true,
            isFieldEnabled: true,
            userType: "internal",
            role: { permissions: [P.field.write, P.field.read, P.field.admin] },
            managedWarehouse: null
          };
        }
        return { isActive: true, isFieldEnabled: true, userType: "internal" };
      }
    },
    shift: {
      findUnique: async (args: any) => {
        const compound = args.where?.orgId_agentId_clientShiftId;
        if (compound) {
          return shifts.find(
            (shift) =>
              shift.orgId === compound.orgId &&
              shift.agentId === compound.agentId &&
              shift.clientShiftId === compound.clientShiftId
          ) ?? null;
        }
        return shifts.find((shift) => shift.id === args.where?.id) ?? null;
      },
      findFirst: async (args: any) => {
        const where = args.where ?? {};
        return (
          shifts.find(
            (shift) =>
              (where.id === undefined || shift.id === where.id) &&
              (where.orgId === undefined || shift.orgId === where.orgId) &&
              (where.agentId === undefined || shift.agentId === where.agentId) &&
              (where.status === undefined || shift.status === where.status)
          ) ?? null
        );
      },
      create: async (args: any) => {
        const shift = {
          id: crypto.randomUUID(),
          endedAt: null,
          endType: null,
          ...args.data
        };
        shifts.push(shift);
        return shift;
      },
      update: async (args: any) => {
        const shift = shifts.find((row) => row.id === args.where.id);
        Object.assign(shift, args.data);
        return shift;
      }
    },
    dailyAttendance: {
      upsert: async () => ({})
    },
    fieldLocation: {
      findMany: async (args: any) => {
        const ids = args.where?.clientPointId?.in;
        return locations.filter(
          (point) =>
            point.orgId === args.where.orgId &&
            point.agentId === args.where.agentId &&
            (!ids || ids.includes(point.clientPointId))
        );
      },
      createMany: async (args: any) => {
        let count = 0;
        for (const point of args.data) {
          const exists = locations.some(
            (row) =>
              row.orgId === point.orgId &&
              row.agentId === point.agentId &&
              row.clientPointId === point.clientPointId
          );
          if (!exists) {
            locations.push({ id: crypto.randomUUID(), ...point });
            count++;
          }
        }
        return { count };
      }
    },
    fieldSyncStatus: {
      upsert: async () => ({})
    },
    $queryRawUnsafe: async () => [],
    $transaction: async (fn: (tx: any) => Promise<any>) => fn(prisma)
  };

  const caller = appRouter.createCaller({
    requestId: "test",
    actor: { id: agentId, orgId },
    prisma,
    permissions: [P.field.write, P.field.read, P.field.admin],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: []
  } as any);

  return { caller, orgId, agentId, shifts, locations };
}

describe("Field Sense offline ingestion contract", () => {
  it("syncStart is idempotent for a clientShiftId", async () => {
    const { caller, shifts } = createFieldMock();

    const first = await caller.fieldShifts.syncStart({
      clientShiftId: "shift-client-1",
      startedAt: "2026-05-20T10:00:00.000Z"
    });
    const second = await caller.fieldShifts.syncStart({
      clientShiftId: "shift-client-1",
      startedAt: "2026-05-20T10:00:00.000Z"
    });

    expect(first.status).toBe("created");
    expect(second.status).toBe("existing");
    expect(second.serverShiftId).toBe(first.serverShiftId);
    expect(shifts).toHaveLength(1);
  });

  it("ingestV2 accepts valid points once and acknowledges duplicate retries", async () => {
    const { caller, locations } = createFieldMock();
    const shift = await caller.fieldShifts.syncStart({
      clientShiftId: "shift-client-2",
      startedAt: "2026-05-20T10:00:00.000Z"
    });

    const batch = {
      clientShiftId: "shift-client-2",
      shiftId: shift.serverShiftId,
      points: [
        {
          clientPointId: "point-1",
          lat: 12.9716,
          lng: 77.5946,
          accuracy: 12,
          recordedAt: "2026-05-20T10:01:00.000Z"
        },
        {
          clientPointId: "point-2",
          lat: 12.972,
          lng: 77.595,
          accuracy: 10,
          recordedAt: "2026-05-20T10:02:00.000Z"
        }
      ]
    };

    const first = await caller.fieldLocation.ingestV2(batch);
    const second = await caller.fieldLocation.ingestV2(batch);

    expect(first.accepted).toEqual(["point-1", "point-2"]);
    expect(first.duplicates).toEqual([]);
    expect(second.accepted).toEqual([]);
    expect(second.duplicates).toEqual(["point-1", "point-2"]);
    expect(locations).toHaveLength(2);
  });

  it("ingestV2 rejects invalid coordinates with explicit point reasons", async () => {
    const { caller } = createFieldMock();
    await caller.fieldShifts.syncStart({
      clientShiftId: "shift-client-3",
      startedAt: "2026-05-20T10:00:00.000Z"
    });

    const result = await caller.fieldLocation.ingestV2({
      clientShiftId: "shift-client-3",
      points: [
        {
          clientPointId: "bad-lat",
          lat: 99,
          lng: 77.5946,
          accuracy: 12,
          recordedAt: "2026-05-20T10:01:00.000Z"
        }
      ]
    });

    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      { clientPointId: "bad-lat", reason: "INVALID_LAT" }
    ]);
    expect(result.retryable).toBe(false);
  });

  it("ingestV2 returns retryable SHIFT_NOT_SYNCED state for unknown client shifts", async () => {
    const { caller } = createFieldMock();

    const result = await caller.fieldLocation.ingestV2({
      clientShiftId: "missing-shift",
      points: [
        {
          clientPointId: "point-1",
          lat: 12.9716,
          lng: 77.5946,
          accuracy: 12,
          recordedAt: "2026-05-20T10:01:00.000Z"
        }
      ]
    });

    expect(result).toMatchObject({
      serverShiftId: null,
      clientShiftId: "missing-shift",
      accepted: [],
      duplicates: [],
      rejected: [],
      retryable: true
    });
  });
});

// ---------------------------------------------------------------------------
// Batch 05 security regressions
// ---------------------------------------------------------------------------

type SecurityMockOptions = {
  permissions?: string[];
  // override the org reported by ctx.actor.orgId (default: shift's orgId)
  actorOrgOverride?: string | null;
  agentIsActive?: boolean;
  otherActiveShiftAgentIsActive?: boolean;
};

function createSecurityMock(opts: SecurityMockOptions = {}) {
  const orgId = "11111111-1111-4111-8111-111111111111";
  const otherOrgId = "22222222-2222-4222-8222-222222222222";
  const agentId = "33333333-3333-4333-8333-333333333333";
  const otherAgentId = "44444444-4444-4444-8444-444444444444";
  const outletId = "55555555-5555-4555-8555-555555555555";
  const outletOwnerId = "66666666-6666-4666-8666-666666666666";
  const shiftId = "77777777-7777-4777-8777-777777777777";
  const otherShiftId = "88888888-8888-4888-8888-888888888888";

  const permissions = opts.permissions ?? [P.field.write, P.field.read];

  const shifts: any[] = [
    {
      id: shiftId,
      agentId,
      orgId,
      status: "active",
      startedAt: new Date("2026-05-20T10:00:00.000Z"),
      clientShiftId: "client-shift-a"
    },
    {
      id: otherShiftId,
      agentId: otherAgentId,
      orgId,
      status: "active",
      startedAt: new Date("2026-05-20T10:00:00.000Z"),
      clientShiftId: "client-shift-b"
    }
  ];

  const users: Record<string, any> = {
    [agentId]: {
      id: agentId,
      isActive: opts.agentIsActive ?? true,
      name: "Agent One",
      isFieldEnabled: true,
      userType: "internal",
      role: { permissions },
      managedWarehouse: null
    },
    [otherAgentId]: {
      id: otherAgentId,
      isActive: opts.otherActiveShiftAgentIsActive ?? true,
      name: "Agent Two",
      isFieldEnabled: true,
      userType: "internal",
      role: { permissions },
      managedWarehouse: null
    },
    [outletOwnerId]: {
      id: outletOwnerId,
      isActive: true,
      name: "Outlet Customer",
      userType: "outlet"
    }
  };

  const outlets: Record<string, any> = {
    [outletId]: { id: outletId, userId: outletOwnerId, isActive: true }
  };

  const locations: any[] = [];

  const prisma: any = {
    user: {
      findUnique: async (args: any) => {
        const u = users[args.where?.id];
        if (!u) return null;
        if (args.include?.role) return u;
        return u;
      },
      findFirst: async (args: any) => {
        const where = args.where ?? {};
        for (const u of Object.values(users)) {
          if (where.id && (u as any).id !== where.id) continue;
          if (where.isActive !== undefined && (u as any).isActive !== where.isActive)
            continue;
          if (where.userType && (u as any).userType !== where.userType) continue;
          // C-18 regression assertion: orgId must NOT appear on User where clause
          if ("orgId" in where) {
            throw new Error("REGRESSION: User.findFirst was called with orgId filter");
          }
          return u;
        }
        return null;
      }
    },
    outlet: {
      findFirst: async (args: any) => {
        const where = args.where ?? {};
        // C-18 regression assertion: orgId must NOT appear on Outlet where clause
        if ("orgId" in where) {
          throw new Error("REGRESSION: Outlet.findFirst was called with orgId filter");
        }
        const o = outlets[where.id];
        if (!o) return null;
        if (where.isActive !== undefined && o.isActive !== where.isActive) return null;
        return o;
      }
    },
    shift: {
      findFirst: async (args: any) => {
        const where = args.where ?? {};
        const matchesAgent = (s: any) => {
          if (!where.agent) return true;
          const u = users[s.agentId];
          if (where.agent.isActive !== undefined && u?.isActive !== where.agent.isActive)
            return false;
          return true;
        };
        return (
          shifts.find(
            (s) =>
              (where.id === undefined || s.id === where.id) &&
              (where.orgId === undefined || s.orgId === where.orgId) &&
              (where.agentId === undefined || s.agentId === where.agentId) &&
              (where.status === undefined || s.status === where.status) &&
              matchesAgent(s)
          ) ?? null
        );
      },
      findMany: async (args: any) => {
        const where = args.where ?? {};
        const matchesAgent = (s: any) => {
          if (!where.agent) return true;
          const u = users[s.agentId];
          if (where.agent.isActive !== undefined && u?.isActive !== where.agent.isActive)
            return false;
          return true;
        };
        const result = shifts.filter(
          (s) =>
            (where.status === undefined || s.status === where.status) &&
            (where.orgId === undefined || s.orgId === where.orgId) &&
            matchesAgent(s)
        );
        const limited = args.take ? result.slice(0, args.take) : result;
        return limited.map((s) => ({
          id: s.id,
          agentId: s.agentId,
          orgId: s.orgId,
          startedAt: s.startedAt,
          agent: { name: users[s.agentId]?.name ?? "?" }
        }));
      }
    },
    fieldLocation: {
      createMany: async (args: any) => {
        for (const row of args.data) locations.push(row);
        return { count: args.data.length };
      },
      findMany: async (args: any) => {
        const ids = args.where?.clientPointId?.in;
        return locations.filter(
          (point) =>
            point.orgId === args.where.orgId &&
            point.agentId === args.where.agentId &&
            (!ids || ids.includes(point.clientPointId))
        );
      }
    },
    fieldVisit: {
      findUnique: async () => null,
      create: async (args: any) => ({
        id: "visit-1111",
        recordedAt: new Date(),
        createdAt: new Date(),
        ...args.data
      })
    },
    fieldStop: {
      findFirst: async () => null,
      findUnique: async () => null,
      create: async (args: any) => ({
        id: "stop-1111",
        startedAt: new Date(),
        endedAt: null,
        createdAt: new Date(),
        ...args.data
      })
    },
    fieldSyncStatus: {
      findMany: async () => [],
      upsert: async () => ({})
    },
    $queryRawUnsafe: async () => []
  };

  const caller = appRouter.createCaller({
    requestId: "test",
    actor: {
      id: agentId,
      orgId: opts.actorOrgOverride === undefined ? orgId : opts.actorOrgOverride
    },
    prisma,
    permissions,
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: []
  } as any);

  return {
    caller,
    orgId,
    otherOrgId,
    agentId,
    otherAgentId,
    outletId,
    outletOwnerId,
    shiftId,
    locations
  };
}

describe("Batch 05 — Field Sense security regressions", () => {
  it("C-11: ingest broadcasts ONLY to shift.orgId; the removed cross-org broadcast does not fire", async () => {
    // Before the fix, ingest broadcast to both shift.orgId AND ctx.actor.orgId
    // when those differed. Post-fix only shift.orgId is targeted. We simulate
    // the pre-Batch-01 condition where actor.orgId was unknown (null) by
    // setting actorOrgOverride: null so the shift lookup ignores org and the
    // secondary broadcast path (if it still existed) would have fired with a
    // separate value. We then assert exactly one broadcast, targeting shift.orgId.
    const { caller, otherOrgId, orgId, shiftId, agentId } = createSecurityMock({
      actorOrgOverride: null
    });
    resetBroadcasts();
    resetIngestBucket(agentId, shiftId);

    await caller.fieldLocation.ingest({
      locations: [
        {
          lat: 12.97,
          lng: 77.59,
          accuracy: 10,
          recordedAt: "2026-05-20T10:01:00.000Z"
        }
      ]
    });

    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0].orgId).toBe(orgId);
    // No second broadcast to any other org — the cross-org leak path is gone.
    expect(broadcasts.some((b) => b.orgId === otherOrgId)).toBe(false);
  });

  it("H-11: field-visits.log rejects spoofed agentId before shift lookup", async () => {
    const { caller, otherAgentId } = createSecurityMock();
    await expect(
      caller.fieldVisits.log({
        agentId: otherAgentId,
        lat: 1,
        lng: 1
      })
    ).rejects.toThrow(/another agent/i);
  });

  it("H-11: field-stops.start rejects spoofed agentId before shift lookup", async () => {
    const { caller, otherAgentId } = createSecurityMock();
    await expect(
      caller.fieldStops.start({
        agentId: otherAgentId,
        lat: 1,
        lng: 1
      })
    ).rejects.toThrow(/another agent/i);
  });

  it("C-18: outlet and customer lookups do NOT receive bogus orgId filter", async () => {
    const { caller, outletId, outletOwnerId } = createSecurityMock();
    // Mock throws if `orgId` ever appears in outlet/user where clauses.
    const visit = await caller.fieldVisits.log({
      lat: 1,
      lng: 1,
      outletId,
      customerId: outletOwnerId
    });
    expect(visit.outletId).toBe(outletId);
    expect(visit.customerId).toBe(outletOwnerId);
  });

  it("C-18: customer that does not own the outlet is rejected", async () => {
    const { caller, outletId } = createSecurityMock();
    await expect(
      caller.fieldVisits.log({
        lat: 1,
        lng: 1,
        outletId,
        customerId: "00000000-0000-4000-8000-000000000000"
      })
    ).rejects.toThrow(/Customer not found/i);
  });

  it("M-05: audioUrl is rejected for non-https schemes", async () => {
    const { caller } = createSecurityMock();
    await expect(
      caller.fieldVisits.log({
        lat: 1,
        lng: 1,
        audioUrl: "file:///etc/passwd"
      })
    ).rejects.toThrow();
    await expect(
      caller.fieldVisits.log({
        lat: 1,
        lng: 1,
        audioUrl: "http://example.com/a.mp3"
      })
    ).rejects.toThrow(/HTTPS/);
  });

  it("M-06: activeAgents excludes shifts whose agent is deactivated", async () => {
    const { caller } = createSecurityMock({
      permissions: [P.field.read, P.field.admin],
      otherActiveShiftAgentIsActive: false
    });
    const res = await caller.fieldLocation.activeAgents({});
    expect(res.agents.length).toBe(1);
    expect(res.agents[0].agentName).toBe("Agent One");
    expect(res.hasMore).toBe(false);
  });

  it("L-13: activeAgents respects limit and reports hasMore", async () => {
    const { caller } = createSecurityMock({
      permissions: [P.field.read, P.field.admin]
    });
    const res = await caller.fieldLocation.activeAgents({ limit: 1 });
    expect(res.agents.length).toBe(1);
    expect(res.hasMore).toBe(true);
  });

  it("P1-1: ingestV2 rejects future-dated points with RECORDED_AT_TOO_FAR_IN_FUTURE", async () => {
    const { caller } = createSecurityMock();
    const futureTs = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min in future
    const result = await caller.fieldLocation.ingestV2({
      clientShiftId: "client-shift-a",
      shiftId: "77777777-7777-4777-8777-777777777777",
      points: [
        {
          clientPointId: "future-point",
          lat: 12.97,
          lng: 77.59,
          accuracy: 10,
          recordedAt: futureTs
        }
      ]
    });
    expect(result.rejected).toEqual([
      { clientPointId: "future-point", reason: "RECORDED_AT_TOO_FAR_IN_FUTURE" }
    ]);
    expect(result.accepted).toEqual([]);
  });

  it("P1-1: ingestV2 accepts old (>48h) points without rejection", async () => {
    const { caller } = createSecurityMock();
    const oldTs = new Date(Date.now() - 50 * 60 * 60 * 1000).toISOString(); // 50 h ago
    const result = await caller.fieldLocation.ingestV2({
      clientShiftId: "client-shift-a",
      shiftId: "77777777-7777-4777-8777-777777777777",
      points: [
        {
          clientPointId: "old-point",
          lat: 12.97,
          lng: 77.59,
          accuracy: 10,
          recordedAt: oldTs
        }
      ]
    });
    expect(result.rejected).toEqual([]);
    expect(result.accepted).toContain("old-point");
  });

  it("M-04: ingest throws TOO_MANY_REQUESTS when exceeding the per-shift cap", async () => {
    const { caller, agentId, shiftId } = createSecurityMock();
    resetIngestBucket(agentId, shiftId);

    // Push 4 batches of 500 (=2000, exactly at cap) — all should succeed.
    for (let i = 0; i < 4; i++) {
      await caller.fieldLocation.ingest({
        locations: Array.from({ length: 500 }, (_, k) => ({
          lat: 12.97,
          lng: 77.59,
          accuracy: 10,
          recordedAt: new Date(Date.now() + i * 1000 + k).toISOString()
        }))
      });
    }

    // The next point crosses 2000 → should be rejected.
    await expect(
      caller.fieldLocation.ingest({
        locations: [
          {
            lat: 12.97,
            lng: 77.59,
            accuracy: 10,
            recordedAt: new Date().toISOString()
          }
        ]
      })
    ).rejects.toThrow(/rate limit/i);

    // After resetIngestBucket (Batch 06 will wire this on shift end) the bucket
    // should clear and ingest works again.
    resetIngestBucket(agentId, shiftId);
    const result = await caller.fieldLocation.ingest({
      locations: [
        {
          lat: 12.97,
          lng: 77.59,
          accuracy: 10,
          recordedAt: new Date().toISOString()
        }
      ]
    });
    expect(result.accepted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// P0-4 — Org-scoped clientEventId idempotency
// ---------------------------------------------------------------------------

describe("P0-4 — Org-scoped clientEventId idempotency", () => {
  it("same clientEventId in same org returns the existing visit (idempotent)", async () => {
    const orgId = "11111111-1111-4111-8111-111111111111";
    const agentId = "33333333-3333-4333-8333-333333333333";
    const shiftId = "77777777-7777-4777-8777-777777777777";
    const clientEventId = "evt-org-a-001";

    const existingVisit = {
      id: "visit-existing",
      agentId,
      shiftId,
      orgId,
      lat: 1,
      lng: 1,
      description: null,
      audioUrl: null,
      outletId: null,
      customerId: null,
      clientEventId,
      recordedAt: new Date(),
      createdAt: new Date()
    };

    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: agentId,
          isActive: true,
          isFieldEnabled: true,
          userType: "internal",
          role: { permissions: ["field:write", "field:read"] },
          managedWarehouse: null
        })
      },
      shift: {
        findFirst: async () => ({ id: shiftId, orgId }),
        findUnique: async () => null
      },
      fieldVisit: {
        findUnique: async (args: any) => {
          // P0-4: key is orgId_clientEventId, not just clientEventId
          if (args.where?.orgId_clientEventId?.orgId === orgId &&
              args.where?.orgId_clientEventId?.clientEventId === clientEventId) {
            return existingVisit;
          }
          return null;
        },
        create: async () => { throw new Error("Should not create a duplicate"); }
      },
      outlet: { findFirst: async () => null },
      $queryRawUnsafe: async () => []
    };

    const caller = appRouter.createCaller({
      requestId: "test",
      actor: { id: agentId, orgId },
      prisma,
      permissions: ["field:write", "field:read"],
      managedWarehouseId: null,
      serviceClientId: null,
      serviceClientSecret: null,
      serviceScopes: []
    } as any);

    const result = await caller.fieldVisits.log({ lat: 1, lng: 1, clientEventId });
    expect(result.id).toBe("visit-existing");
  });

  it("same clientEventId in a different org creates a new visit (cross-org allowed)", async () => {
    const orgA = "11111111-1111-4111-8111-111111111111";
    const orgB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const agentId = "33333333-3333-4333-8333-333333333333";
    const shiftId = "77777777-7777-4777-8777-777777777777";
    const clientEventId = "evt-same-id";
    let created = false;

    const prisma: any = {
      user: {
        findUnique: async () => ({
          id: agentId,
          isActive: true,
          isFieldEnabled: true,
          userType: "internal",
          role: { permissions: ["field:write", "field:read"] },
          managedWarehouse: null
        })
      },
      shift: {
        findFirst: async () => ({ id: shiftId, orgId: orgB }),
        findUnique: async () => null
      },
      fieldVisit: {
        // orgA has an existing visit with same clientEventId, but orgB does not.
        findUnique: async (args: any) => {
          if (args.where?.orgId_clientEventId?.orgId === orgA &&
              args.where?.orgId_clientEventId?.clientEventId === clientEventId) {
            return { id: "visit-org-a", clientEventId, orgId: orgA };
          }
          return null;
        },
        create: async (args: any) => {
          created = true;
          return { id: "visit-org-b", recordedAt: new Date(), createdAt: new Date(), ...args.data };
        }
      },
      outlet: { findFirst: async () => null },
      $queryRawUnsafe: async () => []
    };

    const caller = appRouter.createCaller({
      requestId: "test",
      actor: { id: agentId, orgId: orgB },
      prisma,
      permissions: ["field:write", "field:read"],
      managedWarehouseId: null,
      serviceClientId: null,
      serviceClientSecret: null,
      serviceScopes: []
    } as any);

    const result = await caller.fieldVisits.log({ lat: 1, lng: 1, clientEventId });
    expect(created).toBe(true);
    expect(result.id).toBe("visit-org-b");
  });
});
