import { beforeEach, describe, expect, it } from "bun:test";

process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-jwt-secret-12345678901234567890";

const authModule = await import("./auth");
const appModule = await import("../../app");

const {
  __authTestUtils,
  authRouter,
  parseRefreshToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword
} = authModule;
const { resolveActorFromBearer } = appModule;

const baseUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "user@syrex.local",
  name: "User",
  userType: "internal",
  roleId: "22222222-2222-4222-8222-222222222222",
  isFieldEnabled: true,
  isActive: true,
  role: { id: "22222222-2222-4222-8222-222222222222", name: "Role", permissions: ["field:read"] },
  managedWarehouse: null,
  outlet: null
};

function createCaller(prisma: any, sourceIp = "203.0.113.10") {
  return authRouter.createCaller({
    requestId: "test-request",
    actor: { id: null, orgId: null, sessionId: null },
    prisma,
    permissions: [],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp
  } as any);
}

function authedCaller(prisma: any, actor: { id: string | null; sessionId: string | null }) {
  return authRouter.createCaller({
    requestId: "test-request",
    actor: { id: actor.id, orgId: null, sessionId: actor.sessionId },
    prisma,
    permissions: [],
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "203.0.113.10"
  } as any);
}

async function bcrypt(secret: string) {
  return Bun.password.hash(secret, { algorithm: "bcrypt", cost: 12 });
}

beforeEach(() => {
  __authTestUtils.resetRateLimits();
});

describe("auth hardening regression", () => {
  it("removes plaintext password fallback", async () => {
    const ok = await verifyPassword("admin123", "admin123");
    expect(ok).toBe(false);
  });

  it("refresh denies revoked session and does not revive it", async () => {
    const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const secret = "revoked-refresh-secret";
    const refreshTokenHash = await Bun.password.hash(secret, { algorithm: "bcrypt", cost: 12 });

    let updated = false;
    const caller = createCaller({
      authSession: {
        findUnique: async () => ({
          id: sessionId,
          userId: baseUser.id,
          refreshTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: new Date()
        }),
        update: async () => {
          updated = true;
          return {};
        }
      },
      user: {
        findUnique: async () => baseUser
      }
    });

    await expect(caller.refresh({ refreshToken: `${sessionId}.${secret}` })).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    });
    expect(updated).toBe(false);
  });

  it("enforces login rate limit at 11th attempt per email in 15m", async () => {
    const caller = createCaller({
      user: {
        findUnique: async () => ({ ...baseUser, passwordHash: "not-a-password-hash" })
      },
      authSession: {
        create: async () => ({ id: "unused" }),
        update: async () => ({})
      }
    });

    for (let i = 0; i < 10; i += 1) {
      await expect(
        caller.login({ email: "rate-limit@syrex.local", password: "wrong" })
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }

    await expect(
      caller.login({ email: "rate-limit@syrex.local", password: "wrong" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("enforces refresh rate limit at 21st attempt per source IP", async () => {
    const caller = createCaller(
      {
        authSession: {
          findUnique: async () => null,
          update: async () => ({})
        },
        user: {
          findUnique: async () => baseUser
        }
      },
      "198.51.100.77"
    );

    for (let i = 0; i < 20; i += 1) {
      await expect(caller.refresh({ refreshToken: "bad-token" })).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      });
    }

    await expect(caller.refresh({ refreshToken: "bad-token" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS"
    });
  });

  it("refresh parses token, rotates secret, and issues JWT with sid+sub", async () => {
    const sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const oldSecret = "old-refresh-secret";
    let currentHash = await Bun.password.hash(oldSecret, { algorithm: "bcrypt", cost: 12 });
    let updatedHash: string | null = null;

    const caller = createCaller({
      authSession: {
        findUnique: async ({ where }: any) => {
          if (where.id !== sessionId) return null;
          return {
            id: sessionId,
            userId: baseUser.id,
            refreshTokenHash: currentHash,
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null
          };
        },
        update: async ({ data }: any) => {
          updatedHash = data.refreshTokenHash;
          currentHash = data.refreshTokenHash;
          return {};
        }
      },
      user: {
        findUnique: async () => baseUser
      }
    });

    const out = await caller.refresh({ refreshToken: `${sessionId}.${oldSecret}` });

    expect(out.accessToken.split(".")).toHaveLength(3);
    const claims = await verifyAccessToken(out.accessToken);
    expect(claims).toMatchObject({ userId: baseUser.id, sessionId });

    const rotated = parseRefreshToken(out.refreshToken);
    expect(rotated).toBeTruthy();
    expect(rotated?.sessionId).toBe(sessionId);
    expect(rotated?.secret).not.toBe(oldSecret);

    expect(typeof updatedHash).toBe("string");
    expect(await Bun.password.verify(rotated!.secret, updatedHash!)).toBe(true);
  });

  it("resolveActorFromBearer returns null without valid bearer", async () => {
    const noAuthContext = {
      req: {
        header: (_key: string) => null
      }
    } as any;

    const withoutBearer = await resolveActorFromBearer(noAuthContext, {
      authSession: {
        findUnique: async () => {
          throw new Error("should not query session without bearer");
        }
      }
    } as any);
    expect(withoutBearer).toBeNull();

    const token = await signAccessToken({
      userId: "real-user",
      sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    });

    const bearerContext = {
      req: {
        header: (key: string) => {
          if (key.toLowerCase() === "authorization") return `Bearer ${token}`;
          return null;
        }
      }
    } as any;

    const resolved = await resolveActorFromBearer(bearerContext, {
      authSession: {
        findUnique: async () => ({
          userId: "real-user",
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null
        })
      },
      user: {
        findUnique: async () => ({
          userType: "internal",
          isActive: true,
          role: { permissions: ["*"] },
          managedWarehouse: null,
        })
      },
      outlet: {
        findUnique: async () => null
      }
    } as any);

    expect(resolved).toEqual({
      userId: "real-user",
      sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      permissions: ["*"],
      managedWarehouseId: null,
      userType: "internal",
      linkedOutletId: null,
    });
  });
});

// ── Phase 3 ASVF hardening (DEC-20260613-010) ────────────────────────────────

describe("auth.login (DEC-20260613-010)", () => {
  it("issues access + rotating refresh tokens for valid credentials (Happy)", async () => {
    const passwordHash = await bcrypt("correct horse");
    let createdSession: any = null;
    const caller = createCaller({
      user: { findUnique: async () => ({ ...baseUser, passwordHash }) },
      authSession: {
        create: async ({ data }: any) => {
          createdSession = data;
          return { id: data.id };
        }
      }
    });

    const out = await caller.login({ email: baseUser.email, password: "correct horse" });

    expect(out.accessToken.split(".")).toHaveLength(3);
    const claims = await verifyAccessToken(out.accessToken);
    expect(claims).toMatchObject({ userId: baseUser.id });
    // The refresh token's session id matches the persisted session row.
    const parsed = parseRefreshToken(out.refreshToken);
    expect(parsed?.sessionId).toBe(createdSession.id);
    expect(claims?.sessionId).toBe(createdSession.id);
    expect(out.expiresIn).toBe(__authTestUtils.ACCESS_TOKEN_TTL_SECONDS);
    expect(out.user).toMatchObject({ id: baseUser.id, email: baseUser.email });
    // Secret is hashed at rest, never the raw refresh secret.
    expect(createdSession.refreshTokenHash).not.toContain(parsed?.secret);
    expect(await Bun.password.verify(parsed!.secret, createdSession.refreshTokenHash)).toBe(true);
  });

  it("rejects an unknown email with UNAUTHORIZED, not a leaky 404 (Failure)", async () => {
    const caller = createCaller({ user: { findUnique: async () => null } });
    await expect(
      caller.login({ email: "ghost@syrex.local", password: "whatever" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });
  });

  it("rejects a deactivated user even with the right password (Failure)", async () => {
    const passwordHash = await bcrypt("right-pw");
    const caller = createCaller({
      user: { findUnique: async () => ({ ...baseUser, isActive: false, passwordHash }) }
    });
    await expect(
      caller.login({ email: baseUser.email, password: "right-pw" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });
  });

  it("rejects a wrong password with the same generic message (Failure)", async () => {
    const passwordHash = await bcrypt("the-real-pw");
    let sessionCreated = false;
    const caller = createCaller({
      user: { findUnique: async () => ({ ...baseUser, passwordHash }) },
      authSession: {
        create: async () => {
          sessionCreated = true;
          return { id: "x" };
        }
      }
    });
    await expect(
      caller.login({ email: baseUser.email, password: "wrong-pw" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid credentials" });
    expect(sessionCreated).toBe(false);
  });

  it("rejects a malformed email before touching the database (Validation)", async () => {
    const caller = createCaller({
      user: {
        findUnique: async () => {
          throw new Error("must not query on invalid input");
        }
      }
    });
    await expect(
      caller.login({ email: "not-an-email", password: "x" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects an empty password (Validation)", async () => {
    const caller = createCaller({
      user: {
        findUnique: async () => {
          throw new Error("must not query on invalid input");
        }
      }
    });
    await expect(
      caller.login({ email: baseUser.email, password: "" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("auth.refresh failure paths (DEC-20260613-010)", () => {
  it("rejects a malformed token without a session lookup (Validation)", async () => {
    const caller = createCaller({
      authSession: {
        findUnique: async () => {
          throw new Error("must not look up a session for an unparseable token");
        }
      }
    });
    await expect(caller.refresh({ refreshToken: "no-dot-here" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Invalid refresh token"
    });
  });

  it("rejects an expired session and does not rotate it (Failure)", async () => {
    const sessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const secret = "expired-secret";
    const refreshTokenHash = await bcrypt(secret);
    let updated = false;
    const caller = createCaller({
      authSession: {
        findUnique: async () => ({
          id: sessionId,
          userId: baseUser.id,
          refreshTokenHash,
          expiresAt: new Date(Date.now() - 1000),
          revokedAt: null
        }),
        update: async () => {
          updated = true;
          return {};
        }
      },
      user: { findUnique: async () => baseUser }
    });
    await expect(
      caller.refresh({ refreshToken: `${sessionId}.${secret}` })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(updated).toBe(false);
  });

  it("rejects a valid session id presented with the wrong secret (Failure)", async () => {
    const sessionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const refreshTokenHash = await bcrypt("the-true-secret");
    let updated = false;
    const caller = createCaller({
      authSession: {
        findUnique: async () => ({
          id: sessionId,
          userId: baseUser.id,
          refreshTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null
        }),
        update: async () => {
          updated = true;
          return {};
        }
      },
      user: { findUnique: async () => baseUser }
    });
    await expect(
      caller.refresh({ refreshToken: `${sessionId}.forged-secret` })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(updated).toBe(false);
  });

  it("rejects refresh when the underlying user was deactivated (Failure)", async () => {
    const sessionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const secret = "live-secret";
    const refreshTokenHash = await bcrypt(secret);
    const caller = createCaller({
      authSession: {
        findUnique: async () => ({
          id: sessionId,
          userId: baseUser.id,
          refreshTokenHash,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null
        }),
        update: async () => ({})
      },
      user: { findUnique: async () => ({ ...baseUser, isActive: false }) }
    });
    await expect(
      caller.refresh({ refreshToken: `${sessionId}.${secret}` })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Invalid refresh context" });
  });
});

describe("auth.logout (DEC-20260613-010)", () => {
  it("rejects an unauthenticated caller (Auth)", async () => {
    const caller = authedCaller({}, { id: null, sessionId: null });
    await expect(caller.logout()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an authenticated caller with no session id (Failure)", async () => {
    const caller = authedCaller(
      { authSession: { updateMany: async () => ({ count: 0 }) } },
      { id: baseUser.id, sessionId: null }
    );
    await expect(caller.logout()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Missing session context"
    });
  });

  it("revokes only the caller's own active session (Happy + Scope)", async () => {
    let revokeWhere: any = null;
    let revokeData: any = null;
    const caller = authedCaller(
      {
        authSession: {
          updateMany: async ({ where, data }: any) => {
            revokeWhere = where;
            revokeData = data;
            return { count: 1 };
          }
        }
      },
      { id: baseUser.id, sessionId: "session-9" }
    );
    const out = await caller.logout();
    expect(out).toEqual({ ok: true });
    // Predicate pins the session to this user and only an unrevoked row.
    expect(revokeWhere).toMatchObject({ id: "session-9", userId: baseUser.id, revokedAt: null });
    expect(revokeData.revokedAt).toBeInstanceOf(Date);
  });
});

describe("auth.me (DEC-20260613-010)", () => {
  it("rejects an unauthenticated caller (Auth)", async () => {
    const caller = authedCaller({}, { id: null, sessionId: null });
    await expect(caller.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns the actor's profile with linked outlet id (Happy)", async () => {
    const caller = authedCaller(
      {
        user: {
          findUnique: async () => ({
            id: baseUser.id,
            email: baseUser.email,
            name: baseUser.name,
            userType: baseUser.userType,
            roleId: baseUser.roleId,
            role: baseUser.role,
            isActive: true,
            isFieldEnabled: true,
            managedWarehouse: null
          })
        },
        outlet: { findUnique: async () => ({ id: "outlet-7" }) }
      },
      { id: baseUser.id, sessionId: "s" }
    );
    const out = await caller.me();
    expect(out).toMatchObject({
      id: baseUser.id,
      email: baseUser.email,
      outletId: "outlet-7",
      managedWarehouseId: null,
      role: { permissions: ["field:read"] }
    });
  });

  it("returns NOT_FOUND when the actor row no longer exists (Failure)", async () => {
    const caller = authedCaller(
      {
        user: { findUnique: async () => null },
        outlet: { findUnique: async () => null }
      },
      { id: baseUser.id, sessionId: "s" }
    );
    await expect(caller.me()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("token primitives (DEC-20260613-010)", () => {
  it("verifyAccessToken rejects an expired token", async () => {
    const issuedAt = Math.floor(Date.now() / 1000) - (__authTestUtils.ACCESS_TOKEN_TTL_SECONDS + 60);
    const token = await signAccessToken({ userId: "u", sessionId: "s" }, issuedAt);
    expect(await verifyAccessToken(token)).toBeNull();
  });

  it("verifyAccessToken rejects a tampered signature", async () => {
    const token = await signAccessToken({ userId: "u", sessionId: "s" });
    const parts = token.split(".");
    const flipped = parts[2][0] === "A" ? "B" : "A";
    const tampered = `${parts[0]}.${parts[1]}.${flipped}${parts[2].slice(1)}`;
    expect(await verifyAccessToken(tampered)).toBeNull();
  });

  it("verifyAccessToken rejects a token with the wrong segment count", async () => {
    expect(await verifyAccessToken("only.two")).toBeNull();
  });

  it.each([
    ["no separator", "nodothere"],
    ["empty session id", ".secret"],
    ["empty secret", "session."],
    ["secret contains a dot", "session.part.part"]
  ])("parseRefreshToken rejects %s", (_label, token) => {
    expect(parseRefreshToken(token)).toBeNull();
  });

  it("parseRefreshToken splits a well-formed token", () => {
    expect(parseRefreshToken("sid-1.secret-1")).toEqual({ sessionId: "sid-1", secret: "secret-1" });
  });
});
