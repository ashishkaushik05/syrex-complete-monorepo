import { describe, expect, it } from "bun:test";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../context";
import {
  resolveServiceActorRole,
  serviceComplaintAccessWhere,
} from "./service-access";
import { serviceComplaintsRouter } from "./service-complaints";
import { serviceFormsRouter } from "./service-forms";
import { removeAttachment } from "./attachments";
import {
  __resetObjectStorageForTests,
  __setObjectStorageAdapterForTests,
} from "../../infra/object-storage";

const ACTOR_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMPLAINT_ID = "11111111-1111-4111-8111-111111111111";
const TEMPLATE_ID = "22222222-2222-4222-8222-222222222222";
const FIELD_ID = "33333333-3333-4333-8333-333333333333";
const ATTACHMENT_ID = "44444444-4444-4444-8444-444444444444";

function context(
  prisma: any,
  permissions: string[],
  userType: "internal" | "outlet" = "internal",
): TrpcContext {
  return {
    requestId: "release-3",
    actor: { id: ACTOR_ID, orgId: "org-A", sessionId: "session-1" },
    serviceUser: null,
    prisma,
    permissions,
    managedWarehouseId: null,
    userType,
    linkedOutletId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: [],
    sourceIp: "127.0.0.1",
  } as TrpcContext;
}

async function expectCode(promise: Promise<unknown>, code: TRPCError["code"]) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("Release 3 role-aware latest assignment access", () => {
  it("scopes ASI and SE actors by their latest assignment columns", async () => {
    const rows = [
      { complaintId: "asi-owned", asiUserId: ACTOR_ID, seUserId: null },
      { complaintId: "se-owned", asiUserId: "other", seUserId: ACTOR_ID },
      { complaintId: "foreign", asiUserId: "other", seUserId: "other" },
    ];
    const makePrisma = (roleName: string) => ({
      user: { findUnique: async () => ({ role: { name: roleName } }) },
      serviceAssignmentHistory: { findMany: async () => rows },
    });

    const asiCtx = context(makePrisma("ASI"), ["service:read"]);
    const seCtx = context(makePrisma("Service Engineer"), ["service:read"]);

    expect(await resolveServiceActorRole(asiCtx)).toBe("asi");
    expect(await serviceComplaintAccessWhere(asiCtx, "org-A")).toEqual({
      orgId: "org-A",
      id: { in: ["asi-owned"] },
    });
    expect(await serviceComplaintAccessWhere(seCtx, "org-A")).toEqual({
      orgId: "org-A",
      id: { in: ["se-owned"] },
    });
  });

  it("keeps back-office users org-scoped without assignment filtering", async () => {
    const ctx = context({
      user: { findUnique: async () => ({ role: { name: "Admin" } }) },
    }, ["*"]);
    expect(await serviceComplaintAccessWhere(ctx, "org-A")).toEqual({ orgId: "org-A" });
  });

  it("rejects an outlet actor before role lookup or staff route execution", async () => {
    let roleLookedUp = false;
    const ctx = context({
      user: {
        findUnique: async () => {
          roleLookedUp = true;
          return { role: { name: "Outlet" } };
        },
      },
    }, ["service:read"], "outlet");

    await expectCode(serviceComplaintAccessWhere(ctx, "org-A"), "FORBIDDEN");
    expect(roleLookedUp).toBe(false);

    const caller = serviceComplaintsRouter.createCaller(ctx);
    await expectCode(caller.list({ limit: 20 }), "FORBIDDEN");
  });
});

function formPrisma(options: { mimeType?: string; status?: string } = {}) {
  let retarget: any;
  const prisma: any = {
    user: {
      findUnique: async () => ({ role: { name: "Service Engineer" } }),
    },
    serviceAssignmentHistory: {
      findMany: async () => [{
        complaintId: COMPLAINT_ID,
        asiUserId: "asi-1",
        seUserId: ACTOR_ID,
      }],
    },
    serviceComplaint: {
      findFirst: async () => ({
        id: COMPLAINT_ID,
        orgId: "org-A",
        status: options.status ?? "visit",
      }),
    },
    serviceFormTemplate: {
      findFirst: async () => ({
        id: TEMPLATE_ID,
        orgId: "org-A",
        name: "Battery diagnostic",
        isActive: true,
        fields: [{
          id: FIELD_ID,
          fieldKey: "voltage",
          label: "Voltage",
          fieldType: "number",
          isRequired: true,
          validationRules: {},
        }],
      }),
    },
    attachment: {
      findMany: async () => [{
        id: ATTACHMENT_ID,
        entityType: "service_complaint",
        entityId: COMPLAINT_ID,
        fileName: "evidence.jpg",
        mimeType: options.mimeType ?? "image/jpeg",
        fileSize: 512,
        uploadedById: ACTOR_ID,
        isConfirmed: true,
        createdAt: new Date("2026-06-12T00:00:00.000Z"),
        pendingUpload: null,
      }],
      updateMany: async (args: any) => {
        retarget = args.data;
        return { count: 1 };
      },
    },
    serviceFormSubmission: {
      create: async () => ({
        id: "submission-1",
        complaintId: COMPLAINT_ID,
        templateId: TEMPLATE_ID,
        submittedById: ACTOR_ID,
        testReportId: null,
        isDisabled: false,
        disabledReason: null,
        submittedAt: new Date("2026-06-12T00:00:00.000Z"),
        template: { name: "Battery diagnostic" },
        values: [{
          id: "value-1",
          fieldId: FIELD_ID,
          fieldKey: "voltage",
          field: { label: "Voltage" },
          rawValue: "12.6",
          isValid: true,
          validationError: null,
        }],
      }),
    },
    serviceComplaintActivity: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  };
  prisma.$transaction = async (cb: (tx: any) => Promise<unknown>) => cb(prisma);
  return { prisma, retarget: () => retarget };
}

describe("Release 3 diagnostic evidence", () => {
  it("rejects diagnostic form submission before a visit is logged", async () => {
    const { prisma } = formPrisma({ status: "assigned" });
    const caller = serviceFormsRouter.createCaller(
      context(prisma, ["service:form"]),
    );
    await expectCode(caller.submitForm({
      complaintId: COMPLAINT_ID,
      templateId: TEMPLATE_ID,
      values: [{ fieldKey: "voltage", rawValue: "12.6" }],
      attachmentIds: [ATTACHMENT_ID],
    }), "CONFLICT");
  });

  it("requires at least one image for Service Engineer form submissions", async () => {
    const { prisma } = formPrisma();
    const caller = serviceFormsRouter.createCaller(
      context(prisma, ["service:form"]),
    );
    await expectCode(caller.submitForm({
      complaintId: COMPLAINT_ID,
      templateId: TEMPLATE_ID,
      values: [{ fieldKey: "voltage", rawValue: "12.6" }],
    }), "BAD_REQUEST");
  });

  it("commits confirmed complaint evidence to the created form submission", async () => {
    const state = formPrisma();
    const caller = serviceFormsRouter.createCaller(
      context(state.prisma, ["service:form"]),
    );
    const result = await caller.submitForm({
      complaintId: COMPLAINT_ID,
      templateId: TEMPLATE_ID,
      values: [{ fieldKey: "voltage", rawValue: "12.6" }],
      attachmentIds: [ATTACHMENT_ID],
    });
    expect(state.retarget()).toEqual({
      entityType: "service_form_submission",
      entityId: "submission-1",
    });
    expect(result.attachments).toEqual([{
      id: ATTACHMENT_ID,
      fileName: "evidence.jpg",
      mimeType: "image/jpeg",
      fileSize: 512,
      createdAt: "2026-06-12T00:00:00.000Z",
    }]);
    for (const attachment of result.attachments) {
      expect("storageKey" in attachment).toBe(false);
    }
    expect(result.values[0]?.fieldLabel).toBe("Voltage");
  });

  it("returns readable field labels with historical submissions", async () => {
    const submittedAt = new Date("2026-06-12T00:00:00.000Z");
    const prisma: any = {
      user: { findUnique: async () => ({ role: { name: "Admin" } }) },
      serviceComplaint: {
        findFirst: async () => ({ id: COMPLAINT_ID, orgId: "org-A" }),
      },
      serviceFormSubmission: {
        findMany: async () => [{
          id: "submission-1",
          complaintId: COMPLAINT_ID,
          templateId: TEMPLATE_ID,
          submittedById: ACTOR_ID,
          testReportId: null,
          isDisabled: false,
          disabledReason: null,
          submittedAt,
          template: { name: "Battery diagnostic" },
          values: [{
            id: "value-1",
            fieldId: FIELD_ID,
            fieldKey: "voltage",
            field: { label: "Open Circuit Voltage" },
            rawValue: "12.6",
            isValid: true,
            validationError: null,
          }],
        }],
      },
      attachment: { findMany: async () => [] },
    };
    const caller = serviceFormsRouter.createCaller(context(prisma, ["service:read"]));

    const result = await caller.listSubmissions({ complaintId: COMPLAINT_ID });

    expect(result.items[0]?.values[0]).toMatchObject({
      fieldKey: "voltage",
      fieldLabel: "Open Circuit Voltage",
      rawValue: "12.6",
    });
  });

  it("rejects non-image evidence", async () => {
    const { prisma } = formPrisma({ mimeType: "application/pdf" });
    const caller = serviceFormsRouter.createCaller(
      context(prisma, ["service:form"]),
    );
    await expectCode(caller.submitForm({
      complaintId: COMPLAINT_ID,
      templateId: TEMPLATE_ID,
      values: [{ fieldKey: "voltage", rawValue: "12.6" }],
      attachmentIds: [ATTACHMENT_ID],
    }), "BAD_REQUEST");
  });

  it("prevents removal after evidence is committed", async () => {
    __setObjectStorageAdapterForTests({
      deleteStoredObject: async () => {
        throw new Error("object delete must not run");
      },
    });
    try {
      await expectCode(removeAttachment(context({
        attachment: {
          findUnique: async () => ({
            id: ATTACHMENT_ID,
            entityType: "service_form_submission",
            storageKey: "attachments/committed.jpg",
            uploadedById: ACTOR_ID,
            uploadedByServiceUserId: null,
          }),
        },
      }, []), ATTACHMENT_ID, { uploadedById: ACTOR_ID }), "CONFLICT");
    } finally {
      __resetObjectStorageForTests();
    }
  });
});

describe("Release 3 tested-ok closure", () => {
  function transitionContext(verdict: string, status = "test_result_submitted", updates?: Record<string, unknown>[]) {
    const now = new Date("2026-06-12T00:00:00.000Z");
    const prisma: any = {
      user: { findUnique: async () => ({ role: { name: "Service Engineer" } }) },
      serviceAssignmentHistory: {
        findMany: async () => [{
          complaintId: COMPLAINT_ID,
          asiUserId: "asi-1",
          seUserId: ACTOR_ID,
        }],
      },
      serviceComplaint: {
        findFirst: async () => ({
          status,
          testReports: [{ verdict }],
        }),
        update: async (args: { data: Record<string, unknown> }) => {
          updates?.push(args.data);
          return {};
        },
        findUniqueOrThrow: async () => ({
          id: COMPLAINT_ID,
          complaintNumber: "CMP-2026-000001",
          status: status === "assigned" ? "visit" : "resolved",
          issueCategory: "Battery",
          title: null,
          customerName: null,
          customerPhone: null,
          raisedByUserId: ACTOR_ID,
          raisedByServiceUserId: null,
          createdAt: now,
          updatedAt: now,
          description: null,
          complainantType: "self",
          thirdPartyName: null,
          thirdPartyPhone: null,
          telephonicReason: null,
          resolutionNote: null,
          closedAt: null,
          cancelledAt: null,
          reopenedAt: null,
          lines: [],
          assignments: [],
          testReports: [],
          activities: [],
          warrantyDecision: null,
        }),
      },
      serviceComplaintActivity: { create: async () => ({}) },
      auditLog: { create: async () => ({}) },
    };
    prisma.$transaction = async (cb: (tx: any) => Promise<unknown>) => cb(prisma);
    return context(prisma, ["service:workflow"]);
  }

  it("rejects closure when the latest verdict is not tested_ok", async () => {
    const caller = serviceComplaintsRouter.createCaller(transitionContext("failed"));
    await expectCode(caller.transition({
      id: COMPLAINT_ID,
      action: "tested_ok_close",
      note: "done",
    }), "CONFLICT");
  });

  it("rejects direct test_submitted transitions", async () => {
    const caller = serviceComplaintsRouter.createCaller(transitionContext("tested_ok"));
    await expectCode(caller.transition({
      id: COMPLAINT_ID,
      action: "test_submitted",
    }), "BAD_REQUEST");
  });

  it("records visitAt when the Service Engineer logs a visit", async () => {
    const updates: Record<string, unknown>[] = [];
    const caller = serviceComplaintsRouter.createCaller(
      transitionContext("tested_ok", "assigned", updates),
    );

    await caller.transition({
      id: COMPLAINT_ID,
      action: "visit_logged",
    });

    expect(updates[0]?.status).toBe("visit");
    expect(updates[0]?.visitAt).toBeInstanceOf(Date);
  });
});
