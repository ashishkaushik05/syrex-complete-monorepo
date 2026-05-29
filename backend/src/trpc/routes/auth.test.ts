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

  it("resolveActorFromBearer ignores inbound x-actor-id without valid bearer", async () => {
    const spoofOnlyContext = {
      req: {
        header: (key: string) => (key.toLowerCase() === "x-actor-id" ? "spoof-user" : null)
      }
    } as any;

    const withoutBearer = await resolveActorFromBearer(spoofOnlyContext, {
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
          const lowered = key.toLowerCase();
          if (lowered === "authorization") return `Bearer ${token}`;
          if (lowered === "x-actor-id") return "spoof-user";
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
      }
    } as any);

    expect(resolved).toEqual({
      userId: "real-user",
      sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    });
  });
});
