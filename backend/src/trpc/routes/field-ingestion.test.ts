import { describe, expect, it } from "bun:test";
import { appRouter } from "../router";
import { P } from "../../rbac/catalog";

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
            isFieldEnabled: true,
            userType: "internal",
            role: { permissions: [P.field.write, P.field.read, P.field.admin] },
            managedWarehouse: null
          };
        }
        return { isFieldEnabled: true, userType: "internal" };
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
    }
  };

  const caller = appRouter.createCaller({
    requestId: "test",
    actor: { id: agentId, orgId },
    prisma,
    permissions: [],
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
