import { beforeEach, describe, expect, it } from "bun:test";

process.env.SERVICE_PORTAL_JWT_SECRET =
  process.env.SERVICE_PORTAL_JWT_SECRET ?? "service-portal-test-secret-1234567890";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "staff-test-secret-123456789012345678";
process.env.DEFAULT_ORG_ID = "org-test";

const { resolveServiceUserFromBearer } = await import("../../app");
const { signAccessToken, verifyAccessToken } = await import("./auth");
const {
  __servicePortalTestUtils,
  servicePortalRouter,
} = await import("./service-portal");
const {
  parseServiceUserRefreshToken,
  signServiceUserAccessToken,
  verifyServiceUserAccessToken,
} = await import("./service-portal-auth");

const SERVICE_USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const COMPLAINT_ID = "33333333-3333-4333-8333-333333333333";

const user = {
  id: SERVICE_USER_ID,
  name: "Portal User",
  phone: "9999999999",
  email: "portal@example.com",
  passwordHash: "",
  isActive: true,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
};

function makeContext(prisma: any, authenticated = true, sourceIp = "203.0.113.20") {
  return {
    requestId: "release-2-test",
    actor: { id: null, orgId: null, sessionId: null },
    serviceUser: authenticated ? { id: SERVICE_USER_ID, sessionId: SESSION_ID } : null,
    prisma,
    permissions: [],
    managedWarehouseId: null,
    userType: null,
    linkedOutletId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp,
  } as any;
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMPLAINT_ID,
    complaintNumber: "CMP-2026-000001",
    orgId: "org-test",
    status: "raised",
    raisedByUserId: null,
    raisedByServiceUserId: SERVICE_USER_ID,
    issueCategory: "Not charging",
    title: "Battery issue",
    description: "Customer-safe description",
    customerName: "Portal User",
    customerPhone: "9999999999",
    complainantType: "self",
    thirdPartyName: null,
    thirdPartyPhone: null,
    telephonicReason: "internal reason",
    resolutionNote: "internal note",
    closedAt: null,
    cancelledAt: null,
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    lines: [{
      id: "line-internal-id",
      sku: "SKU-1",
      serialNumber: "SERIAL-1",
      normalizedSerial: "SERIAL1",
      productId: "product-internal-id",
      notes: "internal line note",
      createdAt: new Date("2026-06-02T00:00:00.000Z"),
    }],
    assignments: [{
      id: "assignment-internal-id",
      asiUserId: "asi-internal-id",
      seUserId: "engineer-internal-id",
      assignedById: "actor-internal-id",
      createdAt: new Date("2026-06-02T01:00:00.000Z"),
      seUser: { name: "Engineer", role: { name: "Service Engineer" } },
      asiUser: null,
    }],
    testReports: [{
      id: "test-internal-id",
      verdict: "warranty_candidate",
      summary: "raw diagnostic result",
      structuredData: { voltage: 0 },
      submittedById: "tester-internal-id",
      createdAt: new Date("2026-06-02T02:00:00.000Z"),
    }],
    activities: [
      {
        id: "activity-internal-id",
        actorId: "actor-internal-id",
        action: "raised",
        fromStatus: null,
        toStatus: "raised",
        note: "internal activity note",
        meta: { storageKey: "secret" },
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
      },
      {
        id: "hidden-activity-id",
        actorId: "actor-internal-id",
        action: "internal_note_added",
        fromStatus: "raised",
        toStatus: "raised",
        note: "must remain hidden",
        meta: { raw: true },
        createdAt: new Date("2026-06-02T03:00:00.000Z"),
      },
    ],
    warrantyDecision: {
      status: "pending",
      rejectionReason: null,
      sourceWarehouseId: "warehouse-internal-id",
      decidedById: "approver-internal-id",
      decidedAt: null,
      replacementOrder: null,
      replacementInvoice: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  __servicePortalTestUtils.resetRateLimits();
});

describe("service portal authentication", () => {
  it("registers a user with a hashed password and a hashed 30-day refresh session", async () => {
    let storedPasswordHash = "";
    let storedSession: any;
    let transactionCalls = 0;
    const transactionClient = {
      serviceUser: {
        create: async ({ data }: any) => {
          storedPasswordHash = data.passwordHash;
          return { ...user, passwordHash: data.passwordHash };
        },
      },
      serviceUserSession: {
        create: async ({ data }: any) => {
          storedSession = data;
          return data;
        },
      },
    };
    const caller = servicePortalRouter.createCaller(makeContext({
      serviceUser: {
        create: async () => {
          throw new Error("registration must use the transaction client");
        },
      },
      serviceUserSession: {
        create: async () => {
          throw new Error("session issuance must use the transaction client");
        },
      },
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) => {
        transactionCalls += 1;
        return callback(transactionClient);
      },
    }, false));
    const output = await caller.register({
      name: user.name,
      phone: user.phone,
      email: user.email,
      password: "CustomerPass123!",
    });
    expect(transactionCalls).toBe(1);
    expect(storedPasswordHash).not.toBe("CustomerPass123!");
    expect(await Bun.password.verify("CustomerPass123!", storedPasswordHash)).toBe(true);
    const parsed = parseServiceUserRefreshToken(output.refreshToken);
    expect(parsed?.sessionId).toBe(storedSession.id);
    expect(await Bun.password.verify(parsed!.secret, storedSession.refreshTokenHash)).toBe(true);
    expect(storedSession.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
  });

  it("fails the registration transaction when session creation fails", async () => {
    let transactionCompleted = false;
    const transactionClient = {
      serviceUser: {
        create: async ({ data }: any) => ({ ...user, passwordHash: data.passwordHash }),
      },
      serviceUserSession: {
        create: async () => {
          throw new Error("session storage unavailable");
        },
      },
    };
    const caller = servicePortalRouter.createCaller(makeContext({
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) => {
        const result = await callback(transactionClient);
        transactionCompleted = true;
        return result;
      },
    }, false));

    await expect(caller.register({
      name: user.name,
      phone: user.phone,
      email: user.email,
      password: "CustomerPass123!",
    })).rejects.toThrow("session storage unavailable");
    expect(transactionCompleted).toBe(false);
  });

  it("maps duplicate email or phone registration to conflict", async () => {
    const caller = servicePortalRouter.createCaller(makeContext({
      $transaction: async () => {
        throw { code: "P2002" };
      },
    }, false));

    await expect(caller.register({
      name: user.name,
      phone: user.phone,
      email: user.email,
      password: "CustomerPass123!",
    })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "An account already exists with this email or phone",
    });
  });

  it("keeps staff and service-user token audiences separate", async () => {
    const serviceToken = await signServiceUserAccessToken({
      serviceUserId: SERVICE_USER_ID,
      sessionId: SESSION_ID,
    });
    const staffToken = await signAccessToken({
      userId: SERVICE_USER_ID,
      sessionId: SESSION_ID,
    });

    expect(await verifyAccessToken(serviceToken)).toBeNull();
    expect(await verifyServiceUserAccessToken(staffToken)).toBeNull();
  });

  it("requires both an active account and an active session", async () => {
    const token = await signServiceUserAccessToken({
      serviceUserId: SERVICE_USER_ID,
      sessionId: SESSION_ID,
    });
    const active = await resolveServiceUserFromBearer(token, {
      serviceUserSession: {
        findUnique: async () => ({
          serviceUserId: SERVICE_USER_ID,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        }),
      },
      serviceUser: { findUnique: async () => ({ isActive: true }) },
    } as any);
    expect(active).toEqual({ id: SERVICE_USER_ID, sessionId: SESSION_ID });

    const inactive = await resolveServiceUserFromBearer(token, {
      serviceUserSession: {
        findUnique: async () => ({
          serviceUserId: SERVICE_USER_ID,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
        }),
      },
      serviceUser: { findUnique: async () => ({ isActive: false }) },
    } as any);
    expect(inactive).toBeNull();
  });

  it("rotates refresh tokens and revokes the session on logout", async () => {
    const oldSecret = "old-refresh-secret";
    let currentHash = await Bun.password.hash(oldSecret, { algorithm: "bcrypt", cost: 4 });
    let revokedAt: Date | null = null;
    const prisma = {
      serviceUserSession: {
        findUnique: async () => ({
          id: SESSION_ID,
          serviceUserId: SERVICE_USER_ID,
          refreshTokenHash: currentHash,
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt,
          serviceUser: user,
        }),
        update: async ({ data }: any) => {
          currentHash = data.refreshTokenHash;
          return {};
        },
        updateMany: async ({ data }: any) => {
          revokedAt = data.revokedAt;
          return { count: 1 };
        },
      },
    };
    const publicCaller = servicePortalRouter.createCaller(makeContext(prisma, false));
    const refreshed = await publicCaller.refresh({
      refreshToken: `${SESSION_ID}.${oldSecret}`,
    });
    const rotated = parseServiceUserRefreshToken(refreshed.refreshToken);
    expect(rotated?.sessionId).toBe(SESSION_ID);
    expect(rotated?.secret).not.toBe(oldSecret);
    expect(await Bun.password.verify(rotated!.secret, currentHash)).toBe(true);

    const authedCaller = servicePortalRouter.createCaller(makeContext(prisma));
    expect(await authedCaller.logout()).toEqual({ ok: true });
    expect(revokedAt).toBeInstanceOf(Date);
  });

  it("rejects inactive users and rate limits repeated login attempts", async () => {
    const caller = servicePortalRouter.createCaller(makeContext({
      serviceUser: { findUnique: async () => ({ ...user, isActive: false }) },
    }, false));

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await expect(caller.login({
        email: user.email,
        password: "wrong-password",
      })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
    await expect(caller.login({
      email: user.email,
      password: "wrong-password",
    })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("rate limits authenticated me and logout procedures", async () => {
    const caller = servicePortalRouter.createCaller(makeContext({
      serviceUser: { findUnique: async () => user },
      serviceUserSession: { updateMany: async () => ({ count: 1 }) },
    }));
    for (let attempt = 0; attempt < 120; attempt += 1) await caller.me();
    await expect(caller.me()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });

    for (let attempt = 0; attempt < 30; attempt += 1) await caller.logout();
    await expect(caller.logout()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("service portal ownership and projection", () => {
  it("returns NOT_FOUND for a foreign complaint id", async () => {
    let ownershipWhere: any;
    const caller = servicePortalRouter.createCaller(makeContext({
      serviceComplaint: {
        findFirst: async ({ where }: any) => {
          ownershipWhere = where;
          return null;
        },
      },
    }));

    await expect(caller.getMyComplaint({ id: COMPLAINT_ID }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(ownershipWhere).toMatchObject({
      id: COMPLAINT_ID,
      raisedByServiceUserId: SERVICE_USER_ID,
      orgId: "org-test",
    });
  });

  it("removes internal ids, notes, diagnostics, metadata, storage keys, and warehouse data", async () => {
    const caller = servicePortalRouter.createCaller(makeContext({
      serviceComplaint: { findFirst: async () => detailRow() },
      attachment: {
        findMany: async () => [{
          id: "44444444-4444-4444-8444-444444444444",
          entityType: "service_complaint",
          entityId: COMPLAINT_ID,
          fileName: "photo.jpg",
          mimeType: "image/jpeg",
          fileSize: 100,
          storageKey: "private/storage/key",
          uploadedById: null,
          uploadedByServiceUserId: SERVICE_USER_ID,
          isConfirmed: true,
          createdAt: new Date("2026-06-02T04:00:00.000Z"),
        }],
      },
    }));

    const output = await caller.getMyComplaint({ id: COMPLAINT_ID });
    const serialized = JSON.stringify(output);
    for (const forbidden of [
      "internal-id",
      "internal note",
      "raw diagnostic",
      "structuredData",
      "storageKey",
      "private/storage/key",
      "warehouse-internal-id",
      "must remain hidden",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(output.latestTest?.summary).toContain("warranty claim is under review");
    expect(output.timeline).toEqual([{
      action: "raised",
      status: "raised",
      createdAt: "2026-06-02T00:00:00.000Z",
    }]);
  });

  it("scopes raised-only edits in the database predicate", async () => {
    let updateWhere: any;
    const prisma = {
      serviceComplaint: {
        updateMany: async ({ where }: any) => {
          updateWhere = where;
          return { count: 1 };
        },
        findFirst: async () => detailRow({ description: "Updated" }),
      },
      attachment: { findMany: async () => [] },
    };
    const caller = servicePortalRouter.createCaller(makeContext(prisma));
    const output = await caller.updateMyComplaint({
      id: COMPLAINT_ID,
      description: "Updated",
    });
    expect(updateWhere).toMatchObject({
      id: COMPLAINT_ID,
      raisedByServiceUserId: SERVICE_USER_ID,
      orgId: "org-test",
      status: "raised",
    });
    expect(output.description).toBe("Updated");
  });

  it("rejects non-image and oversized portal evidence before database access", async () => {
    const caller = servicePortalRouter.createCaller(makeContext({}));
    await expect(caller.createComplaintAttachment({
      complaintId: COMPLAINT_ID,
      fileName: "diagnostic.txt",
      mimeType: "text/plain" as any,
      fileSize: 100,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.createComplaintAttachment({
      complaintId: COMPLAINT_ID,
      fileName: "large.jpg",
      mimeType: "image/jpeg",
      fileSize: 25 * 1024 * 1024 + 1,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("service portal customer catalog", () => {
  it("requires a service-user session", async () => {
    const caller = servicePortalRouter.createCaller(makeContext({}, false));
    await expect(caller.listCatalogFacets()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.listCatalogProducts({ limit: 12 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("returns only active brand and category names with active products", async () => {
    let query: any;
    const caller = servicePortalRouter.createCaller(makeContext({
      brand: {
        findMany: async (args: any) => {
          query = args;
          return [{
            name: "Syrex",
            categories: [{ name: "Inverter Batteries" }, { name: "Automotive" }],
          }];
        },
      },
    }));

    expect(await caller.listCatalogFacets()).toEqual([{
      name: "Syrex",
      categories: ["Inverter Batteries", "Automotive"],
    }]);
    expect(query.where).toMatchObject({
      isActive: true,
      categories: {
        some: {
          isActive: true,
          products: { some: { isActive: true } },
        },
      },
    });
    expect(query.select).not.toHaveProperty("id");
  });

  it("returns a paginated customer-safe product projection", async () => {
    let query: any;
    const rows = [
      {
        id: "product-internal-2",
        sku: "SYX-200",
        name: "Power 200",
        displayName: "Syrex Power 200",
        description: "Tall tubular battery",
        warrantyMonths: 48,
        createdAt: new Date("2026-06-02T00:00:00.000Z"),
        category: { name: "Inverter Batteries", brand: { name: "Syrex" } },
        images: [{ uri: "https://cdn.example.com/power-200.jpg" }],
        basePrice: "9999",
        transferValue: "5000",
      },
      {
        id: "product-internal-1",
        sku: "SYX-150",
        name: "Power 150",
        displayName: null,
        description: null,
        warrantyMonths: 36,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        category: { name: "Inverter Batteries", brand: { name: "Syrex" } },
        images: [],
        basePrice: "7999",
        transferValue: "4000",
      },
    ];
    const caller = servicePortalRouter.createCaller(makeContext({
      product: {
        findMany: async (args: any) => {
          query = args;
          return rows;
        },
      },
    }));

    const output = await caller.listCatalogProducts({
      limit: 1,
      q: "power",
      brandName: "Syrex",
      categoryName: "Inverter Batteries",
    });
    expect(output.items).toEqual([{
      sku: "SYX-200",
      name: "Power 200",
      displayName: "Syrex Power 200",
      brandName: "Syrex",
      categoryName: "Inverter Batteries",
      description: "Tall tubular battery",
      warrantyMonths: 48,
      primaryImageUrl: "https://cdn.example.com/power-200.jpg",
    }]);
    expect(output.nextCursor).toBeString();
    expect(query.where).toMatchObject({
      isActive: true,
      category: {
        isActive: true,
        name: "Inverter Batteries",
        brand: { isActive: true, name: "Syrex" },
      },
    });
    expect(query.take).toBe(2);
    const serialized = JSON.stringify(output);
    for (const hidden of ["product-internal", "basePrice", "transferValue", "9999", "5000"]) {
      expect(serialized).not.toContain(hidden);
    }
  });
});
