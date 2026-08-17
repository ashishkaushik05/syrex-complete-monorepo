import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  __resetObjectStorageForTests,
  __setObjectStorageAdapterForTests,
} from "../../infra/object-storage";
import {
  confirmPendingAttachment,
  createAttachmentDownload,
  createPendingAttachment,
  removeAttachment,
} from "./attachments";

const ATTACHMENT_ID = "11111111-1111-4111-8111-111111111111";
const COMPLAINT_ID = "22222222-2222-4222-8222-222222222222";
const SERVICE_USER_ID = "33333333-3333-4333-8333-333333333333";

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    entityType: "service_complaint",
    entityId: COMPLAINT_ID,
    fileName: "evidence.jpg",
    mimeType: "image/jpeg",
    fileSize: 512,
    storageKey: "attachments/service_complaint/evidence.jpg",
    uploadedById: null,
    uploadedByServiceUserId: SERVICE_USER_ID,
    isConfirmed: false,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    pendingUpload: {
      id: "pending-1",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
    ...overrides,
  };
}

function makeContext(prisma: any) {
  return {
    requestId: "attachment-test",
    actor: { id: null, orgId: null, sessionId: null },
    serviceUser: { id: SERVICE_USER_ID, sessionId: "session-1" },
    prisma,
    permissions: [],
    managedWarehouseId: null,
    userType: null,
    linkedOutletId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "127.0.0.1",
  } as any;
}

beforeEach(() => {
  __setObjectStorageAdapterForTests({
    createUploadUrl: async () => "https://storage.example/signed-put",
    verifyUploadedObject: async () => true,
    createDownloadUrl: async () => "https://storage.example/signed-get",
    deleteStoredObject: async () => {},
  });
});

afterEach(() => {
  __resetObjectStorageForTests();
});

describe("Release 2 attachment storage", () => {
  it("creates a service-user-owned pending upload with a signed PUT URL", async () => {
    let createData: any;
    const ctx = makeContext({
      serviceComplaint: { findUnique: async () => ({ id: COMPLAINT_ID }) },
      attachment: {
        create: async ({ data }: any) => {
          createData = data;
          return pendingRow({ storageKey: data.storageKey });
        },
      },
    });

    const output = await createPendingAttachment(ctx, {
      entityType: "service_complaint",
      entityId: COMPLAINT_ID,
      fileName: "evidence.jpg",
      mimeType: "image/jpeg",
      fileSize: 512,
      expiresInMinutes: 15,
    }, { uploadedByServiceUserId: SERVICE_USER_ID });

    expect(createData).toMatchObject({
      uploadedById: null,
      uploadedByServiceUserId: SERVICE_USER_ID,
      isConfirmed: false,
    });
    expect(output.upload.method).toBe("PUT");
    expect(output.upload.uploadUrl).toBe("https://storage.example/signed-put");
  });

  it("requires exactly one uploader type", async () => {
    const ctx = makeContext({
      serviceComplaint: { findUnique: async () => ({ id: COMPLAINT_ID }) },
    });
    await expect(createPendingAttachment(ctx, {
      entityType: "service_complaint",
      entityId: COMPLAINT_ID,
      fileName: "evidence.jpg",
      mimeType: "image/jpeg",
      fileSize: 512,
      expiresInMinutes: 15,
    }, {
      uploadedById: "internal-user",
      uploadedByServiceUserId: SERVICE_USER_ID,
    } as any)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("checks HeadObject metadata before confirming", async () => {
    __setObjectStorageAdapterForTests({
      verifyUploadedObject: async () => false,
    });
    let updated = false;
    const ctx = makeContext({
      attachment: {
        findUnique: async () => pendingRow(),
        update: async () => {
          updated = true;
          return pendingRow({ isConfirmed: true, pendingUpload: null });
        },
      },
    });
    await expect(confirmPendingAttachment(
      ctx,
      ATTACHMENT_ID,
      { uploadedByServiceUserId: SERVICE_USER_ID },
    )).rejects.toMatchObject({ code: "CONFLICT" });
    expect(updated).toBe(false);
  });

  it("denies confirmation by a different uploader", async () => {
    const ctx = makeContext({
      attachment: { findUnique: async () => pendingRow() },
    });
    await expect(confirmPendingAttachment(
      ctx,
      ATTACHMENT_ID,
      { uploadedByServiceUserId: "foreign-service-user" },
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns signed GET URLs only for confirmed records", async () => {
    const ctx = makeContext({
      attachment: {
        findUnique: async () => pendingRow({ isConfirmed: true, pendingUpload: null }),
      },
    });
    const output = await createAttachmentDownload(ctx, ATTACHMENT_ID);
    expect(output.downloadUrl).toBe("https://storage.example/signed-get");
    expect(JSON.stringify(output.attachment)).not.toContain("signed-get");
  });

  it("deletes the object and pending child before removing its database record", async () => {
    const calls: string[] = [];
    __setObjectStorageAdapterForTests({
      deleteStoredObject: async () => {
        calls.push("delete-object");
      },
    });
    const ctx = makeContext({
      attachment: {
        findUnique: async () => pendingRow(),
      },
      $transaction: async (callback: (tx: any) => unknown) => callback({
        pendingUpload: {
          deleteMany: async () => {
            calls.push("delete-pending");
            return { count: 1 };
          },
        },
        attachment: {
          delete: async () => {
            calls.push("delete-row");
            return {};
          },
        },
      }),
    });
    await removeAttachment(
      ctx,
      ATTACHMENT_ID,
      { uploadedByServiceUserId: SERVICE_USER_ID },
    );
    expect(calls).toEqual(["delete-object", "delete-pending", "delete-row"]);
  });
});
