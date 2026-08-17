import { describe, expect, it } from "bun:test";
import { invitationsRouter } from "./invitations";
import { ACTOR_ID, makeCtx } from "./__testkit__";

// ASVF for the invitations router — the invite → accept → role-grant surface. All four
// endpoints sit behind users:invite. Token reuse, expiry, and non-pending state are the
// failure paths that matter here.
//
// NOTE (finding, not fixed here): create accepts any `role` string with no check that the
// inviter may grant it — a users:invite holder can seed a higher-privileged role. Tracked
// alongside the users role-hierarchy gap (DEC-20260612-003 follow-up).

const INV_ID = "1a1a1a1a-1a1a-41a1-81a1-1a1a1a1a1a1a";

function invitationRow(over: Record<string, unknown> = {}) {
  return {
    id: INV_ID,
    email: "invitee@x.com",
    name: "Invitee",
    role: "Sales",
    token: "tok123",
    status: "pending",
    invitedById: ACTOR_ID,
    acceptedUserId: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt: null,
    revokedAt: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...over,
  };
}

function invitePrisma(opts: {
  byToken?: Record<string, unknown> | null;
  byId?: Record<string, unknown> | null;
  role?: { permissions: string[] } | null;
} = {}) {
  const captured: { create?: Record<string, unknown>; update?: Record<string, unknown> } = {};
  const prisma = {
    role: {
      // default: the target role carries no permissions → grantable by anyone with users:invite
      findUnique: async () => ("role" in opts ? opts.role : { name: "Sales", permissions: [] }),
    },
    userInvitation: {
      create: async (args: { data: Record<string, unknown> }) => {
        captured.create = args.data;
        return invitationRow({ ...args.data });
      },
      findMany: async () => [],
      findUnique: async (args: { where: { token?: string; id?: string } }) => {
        if (args.where.token !== undefined) return opts.byToken ?? null;
        return "byId" in opts ? opts.byId ?? null : invitationRow();
      },
      update: async (args: { data: Record<string, unknown> }) => {
        captured.update = args.data;
        return invitationRow({ ...args.data });
      },
    },
  };
  return { prisma, captured };
}

const INVITE = ["users:invite"];

describe("invitations.create", () => {
  const input = {
    email: "invitee@x.com",
    name: "Invitee",
    role: "Sales",
    expiresAt: "2026-12-01T00:00:00.000Z",
  };

  it("rejects without users:invite (Auth)", async () => {
    const { prisma } = invitePrisma();
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: ["users:read"], prisma }));
    await expect(caller.create(input)).rejects.toThrow(/Requires|FORBIDDEN/i);
  });

  it("rejects a non-datetime expiresAt (Validation)", async () => {
    const { prisma } = invitePrisma();
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.create({ ...input, expiresAt: "soon" })).rejects.toThrow();
  });

  it("UNAUTHORIZED when the actor id is missing (Failure)", async () => {
    const { prisma } = invitePrisma();
    // perm() runs first and would 403, so grant the wildcard but null the actor id.
    const caller = invitationsRouter.createCaller(makeCtx({ actorId: null, permissions: ["*"], prisma }));
    await expect(caller.create(input)).rejects.toThrow();
  });

  it("rejects an unknown role (Validation)", async () => {
    const { prisma } = invitePrisma({ role: null });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.create(input)).rejects.toThrow(/Invalid role/i);
  });

  it("mints a token and stamps the inviter", async () => {
    const { prisma, captured } = invitePrisma();
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    const out = await caller.create(input);
    expect(captured.create!.invitedById).toBe(ACTOR_ID);
    expect(String(captured.create!.token)).toHaveLength(32);
    expect(out.status).toBe("pending");
  });

  // --- privilege escalation guard (DEC-20260612-004) ---

  it("blocks a non-super-admin from inviting into a wildcard role (Escalation)", async () => {
    const { prisma } = invitePrisma({ role: { permissions: ["*"] } });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.create(input)).rejects.toThrow(/super-admins can grant the wildcard/i);
  });

  it("blocks inviting into a role that grants a permission the inviter lacks (Escalation)", async () => {
    const { prisma } = invitePrisma({ role: { permissions: ["users:invite", "roles:write"] } });
    // inviter holds users:invite but NOT roles:write → cannot seed it
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.create(input)).rejects.toThrow(/permissions you do not hold.*roles:write/i);
  });

  it("allows inviting into a role whose permissions the inviter fully holds", async () => {
    const { prisma } = invitePrisma({ role: { permissions: ["orders:read", "users:invite"] } });
    const caller = invitationsRouter.createCaller(
      makeCtx({ permissions: ["users:invite", "orders:read"], prisma }),
    );
    await expect(caller.create(input)).resolves.toMatchObject({ status: "pending" });
  });

  it("lets a super-admin invite into any role, including wildcard", async () => {
    const { prisma } = invitePrisma({ role: { permissions: ["*"] } });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: ["*"], prisma }));
    await expect(caller.create(input)).resolves.toMatchObject({ status: "pending" });
  });
});

describe("invitations.list / revoke", () => {
  it("lists for an inviter", async () => {
    const { prisma } = invitePrisma();
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    const out = await caller.list({ limit: 20 });
    expect(out.items).toEqual([]);
  });

  it("revoke returns NOT_FOUND for a missing invitation (Failure)", async () => {
    const { prisma } = invitePrisma({ byId: null });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.revoke({ id: INV_ID })).rejects.toThrow(/not found/i);
  });

  it("revoke marks the invitation revoked", async () => {
    const { prisma, captured } = invitePrisma({ byId: invitationRow() });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await caller.revoke({ id: INV_ID });
    expect(captured.update!.status).toBe("revoked");
    expect(captured.update!.revokedAt).toBeInstanceOf(Date);
  });
});

describe("invitations.accept", () => {
  it("rejects an unknown token (Failure)", async () => {
    const { prisma } = invitePrisma({ byToken: null });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.accept({ token: "nope" })).rejects.toThrow(/not found/i);
  });

  it("rejects re-accepting a non-pending invitation (token reuse)", async () => {
    const { prisma } = invitePrisma({ byToken: invitationRow({ status: "accepted" }) });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.accept({ token: "tok123" })).rejects.toThrow(/not pending/i);
  });

  it("rejects an expired invitation (Failure)", async () => {
    const expired = invitationRow({ expiresAt: new Date(Date.now() - 1000) });
    const { prisma } = invitePrisma({ byToken: expired });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    await expect(caller.accept({ token: "tok123" })).rejects.toThrow(/expired/i);
  });

  it("accepts a valid pending invitation and binds the acceptor", async () => {
    const { prisma, captured } = invitePrisma({ byToken: invitationRow() });
    const caller = invitationsRouter.createCaller(makeCtx({ permissions: INVITE, prisma }));
    const out = await caller.accept({ token: "tok123" });
    expect(captured.update!.status).toBe("accepted");
    expect(captured.update!.acceptedUserId).toBe(ACTOR_ID);
    expect(out.status).toBe("accepted");
  });
});
