import { describe, expect, it } from "bun:test";
import { Prisma } from "@prisma/client";
import { usersRouter } from "./users";
import { ACTOR_ID, makeCtx } from "./__testkit__";

// ASVF for the users router — RBAC integrity surface. Each endpoint sits behind a
// distinct permission (read / write / deactivate / field-enable); the tests assert the
// gate, the happy path, input validation, and the failure branches.
//
// Privilege-escalation guard (DEC-20260612-007, the users.ts half of DEC-20260612-004):
// create/update now call assertCanGrantPermissions — a users:write holder cannot assign a
// role carrying `*` or any permission they do not personally hold. Super-admins (`*`) grant
// anything. The Escalation cases below assert that boundary on both endpoints.

const ROLE_ID = "12121212-1212-4121-8121-121212121212";
const TARGET_ID = "13131313-1313-4131-8131-131313131313";

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    email: "u@x.com",
    phone: null,
    name: "User",
    userType: "internal",
    roleId: ROLE_ID,
    isActive: true,
    isFieldEnabled: false,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

type UserMockOpts = {
  role?: Record<string, unknown> | null;
  byId?: Record<string, unknown> | null;
  byEmail?: Record<string, unknown> | null;
  deleteError?: unknown;
};

const defined = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));

function usersPrisma(opts: UserMockOpts = {}) {
  const captured: { create?: Record<string, unknown>; update?: Record<string, unknown>; revokedSessions?: boolean } = {};
  const prisma = {
    role: { findUnique: async () => opts.role ?? null },
    user: {
      findUnique: async (args: { where: { id?: string; email?: string } }) => {
        if (args.where.email !== undefined) return opts.byEmail ?? null;
        return "byId" in opts ? opts.byId ?? null : userRow();
      },
      findMany: async () => [],
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return userRow({ ...defined(args.data), createdAt: new Date("2026-05-01T00:00:00.000Z"), updatedAt: new Date("2026-05-01T00:00:00.000Z") });
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return userRow(defined(args.data));
      },
      delete: async () => {
        if (opts.deleteError) throw opts.deleteError;
        return userRow();
      },
    },
    authSession: {
      updateMany: async () => {
        captured.revokedSessions = true;
        return { count: 1 };
      },
    },
  };
  return { prisma, captured };
}

const WRITE = ["users:write"];

// ---------------------------------------------------------------------------
// list / getById
// ---------------------------------------------------------------------------

describe("users.list / getById", () => {
  it("rejects without users:read (Auth)", async () => {
    const { prisma } = usersPrisma();
    const caller = usersRouter.createCaller(makeCtx({ permissions: [], prisma }));
    await expect(caller.list({ limit: 20 })).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("lists for a reader", async () => {
    const { prisma } = usersPrisma();
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:read"], prisma }));
    const out = await caller.list({ limit: 20 });
    expect(out.items).toEqual([]);
    expect(out.nextCursor).toBeNull();
  });

  it("getById returns NOT_FOUND for a missing user (Failure)", async () => {
    const { prisma } = usersPrisma({ byId: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:read"], prisma }));
    await expect(caller.getById({ id: TARGET_ID })).rejects.toThrow(/not found/i);
  });

  it("getById rejects a non-uuid id (Validation)", async () => {
    const { prisma } = usersPrisma();
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:read"], prisma }));
    await expect(caller.getById({ id: "nope" })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const createInput = {
  email: "new@x.com",
  name: "New",
  password: "secret123",
  userType: "internal" as const,
  roleId: ROLE_ID,
};

describe("users.create", () => {
  it("rejects without users:write (Auth)", async () => {
    const { prisma } = usersPrisma({ role: { id: ROLE_ID, permissions: [] } });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:read"], prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects an invalid roleId reference (Failure)", async () => {
    const { prisma } = usersPrisma({ role: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/Invalid roleId/i);
  });

  it("rejects a duplicate email (Failure)", async () => {
    const { prisma } = usersPrisma({ role: { id: ROLE_ID, permissions: [] }, byEmail: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/already exists/i);
  });

  it("rejects a malformed email (Validation)", async () => {
    const { prisma } = usersPrisma({ role: { id: ROLE_ID, permissions: [] } });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create({ ...createInput, email: "bad" })).rejects.toThrow();
  });

  it("creates a user with a hashed password and field-sense off", async () => {
    const { prisma, captured } = usersPrisma({ role: { id: ROLE_ID, permissions: [] }, byEmail: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    const out = await caller.create(createInput);
    expect(captured.create!.passwordHash).not.toBe("secret123");
    expect(String(captured.create!.passwordHash)).toMatch(/^\$argon/);
    expect(captured.create!.isFieldEnabled).toBe(false);
    expect(out.email).toBe("new@x.com");
  });
});

describe("users.create role-grant escalation (DEC-20260612-007)", () => {
  it("blocks a non-super-admin from assigning a wildcard role (Escalation)", async () => {
    const { prisma } = usersPrisma({ role: { id: ROLE_ID, permissions: ["*"] }, byEmail: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/super-admins can grant the wildcard/i);
  });

  it("blocks assigning a role that grants a permission the actor lacks (Escalation)", async () => {
    const { prisma } = usersPrisma({
      role: { id: ROLE_ID, permissions: ["users:write", "roles:write"] },
      byEmail: null,
    });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.create(createInput)).rejects.toThrow(/permissions you do not hold.*roles:write/i);
  });

  it("allows assigning a role whose permissions the actor fully holds", async () => {
    const { prisma } = usersPrisma({
      role: { id: ROLE_ID, permissions: ["orders:read", "users:write"] },
      byEmail: null,
    });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:write", "orders:read"], prisma }));
    await expect(caller.create(createInput)).resolves.toMatchObject({ email: "new@x.com" });
  });

  it("lets a super-admin assign any role, including wildcard", async () => {
    const { prisma } = usersPrisma({ role: { id: ROLE_ID, permissions: ["*"] }, byEmail: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["*"], prisma }));
    await expect(caller.create(createInput)).resolves.toMatchObject({ email: "new@x.com" });
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe("users.update", () => {
  it("rejects without users:write (Auth)", async () => {
    const { prisma } = usersPrisma();
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:read"], prisma }));
    await expect(caller.update({ id: TARGET_ID, name: "X" })).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("returns NOT_FOUND for a missing user (Failure)", async () => {
    const { prisma } = usersPrisma({ byId: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: TARGET_ID, name: "X" })).rejects.toThrow(/not found/i);
  });

  it("rejects an unknown roleId on update (Failure)", async () => {
    const { prisma } = usersPrisma({ byId: userRow(), role: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: TARGET_ID, roleId: ROLE_ID })).rejects.toThrow(/Invalid roleId/i);
  });

  it("revokes active sessions when deactivating (Flow)", async () => {
    const { prisma, captured } = usersPrisma({ byId: userRow(), role: { id: ROLE_ID, permissions: [] } });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await caller.update({ id: TARGET_ID, isActive: false });
    expect(captured.revokedSessions).toBe(true);
  });

  it("does not revoke sessions on an ordinary update", async () => {
    const { prisma, captured } = usersPrisma({ byId: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await caller.update({ id: TARGET_ID, name: "Renamed" });
    expect(captured.revokedSessions).toBeUndefined();
  });

  it("blocks reassigning to a wildcard role (Escalation)", async () => {
    const { prisma } = usersPrisma({ byId: userRow(), role: { id: ROLE_ID, permissions: ["*"] } });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: TARGET_ID, roleId: ROLE_ID })).rejects.toThrow(
      /super-admins can grant the wildcard/i,
    );
  });

  it("blocks reassigning to a role granting a permission the actor lacks (Escalation)", async () => {
    const { prisma } = usersPrisma({
      byId: userRow(),
      role: { id: ROLE_ID, permissions: ["users:write", "roles:write"] },
    });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.update({ id: TARGET_ID, roleId: ROLE_ID })).rejects.toThrow(
      /permissions you do not hold.*roles:write/i,
    );
  });

  it("allows reassigning to a role the actor fully holds", async () => {
    const { prisma } = usersPrisma({
      byId: userRow(),
      role: { id: ROLE_ID, permissions: ["orders:read"] },
    });
    const caller = usersRouter.createCaller(
      makeCtx({ permissions: ["users:write", "orders:read"], prisma }),
    );
    await expect(caller.update({ id: TARGET_ID, roleId: ROLE_ID })).resolves.toMatchObject({ id: TARGET_ID });
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe("users.changePassword", () => {
  it("rejects a password under 8 chars (Validation)", async () => {
    const { prisma } = usersPrisma({ byId: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.changePassword({ id: TARGET_ID, password: "short" })).rejects.toThrow();
  });

  it("hashes the new password", async () => {
    const { prisma, captured } = usersPrisma({ byId: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    const out = await caller.changePassword({ id: TARGET_ID, password: "newsecret1" });
    expect(out.ok).toBe(true);
    expect(String(captured.update!.passwordHash)).toMatch(/^\$argon/);
  });

  it("returns NOT_FOUND for a missing user (Failure)", async () => {
    const { prisma } = usersPrisma({ byId: null });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.changePassword({ id: TARGET_ID, password: "newsecret1" })).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe("users.remove", () => {
  it("requires users:deactivate (Auth)", async () => {
    const { prisma } = usersPrisma({ byId: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.remove({ id: TARGET_ID })).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("deletes a user", async () => {
    const { prisma } = usersPrisma({ byId: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:deactivate"], prisma }));
    await expect(caller.remove({ id: TARGET_ID })).resolves.toEqual({ ok: true });
  });

  it("maps a foreign-key violation to a friendly BAD_REQUEST (Failure)", async () => {
    const fkError = new Prisma.PrismaClientKnownRequestError("FK", { code: "P2003", clientVersion: "x" });
    const { prisma } = usersPrisma({ byId: userRow(), deleteError: fkError });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:deactivate"], prisma }));
    await expect(caller.remove({ id: TARGET_ID })).rejects.toThrow(/referenced by other records/i);
  });
});

// ---------------------------------------------------------------------------
// toggleFieldSense
// ---------------------------------------------------------------------------

describe("users.toggleFieldSense", () => {
  it("requires users:field-enable (Auth)", async () => {
    const { prisma } = usersPrisma({ byId: userRow() });
    const caller = usersRouter.createCaller(makeCtx({ permissions: WRITE, prisma }));
    await expect(caller.toggleFieldSense({ id: TARGET_ID, enabled: true })).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects enabling field sense for an outlet user (Validation)", async () => {
    const { prisma } = usersPrisma({ byId: userRow({ userType: "outlet" }) });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:field-enable"], prisma }));
    await expect(caller.toggleFieldSense({ id: TARGET_ID, enabled: true })).rejects.toThrow(/internal users/i);
  });

  it("enables field sense for an internal user", async () => {
    const { prisma, captured } = usersPrisma({ byId: userRow({ userType: "internal" }) });
    const caller = usersRouter.createCaller(makeCtx({ permissions: ["users:field-enable"], prisma }));
    const out = await caller.toggleFieldSense({ id: TARGET_ID, enabled: true });
    expect(out).toEqual({ ok: true, isFieldEnabled: true });
    expect(captured.update!.isFieldEnabled).toBe(true);
  });
});
