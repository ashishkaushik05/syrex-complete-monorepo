import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, internalPerm, internalPermAny } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor } from "./_shared";
import { recordComplaintActivity } from "./service-shared";
import type { ServiceFormTemplateField } from "@prisma/client";
import {
  resolveServiceActorRole,
  serviceComplaintAccessWhere,
} from "./service-access";

// Batch 04: refuse null actor orgId rather than silently widening filters.
function requireOrgId(actorOrgId: string | null): string {
  if (!actorOrgId) {
    throw apiError("FORBIDDEN", "Org context required");
  }
  return actorOrgId;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateFieldValue(
  field: Pick<ServiceFormTemplateField, "fieldType" | "isRequired" | "validationRules">,
  rawValue: string | undefined,
): { isValid: boolean; error?: string } {
  const empty = rawValue === undefined || rawValue.trim() === "";

  if (empty) {
    if (field.isRequired) return { isValid: false, error: "This field is required" };
    return { isValid: true };
  }

  const rules = (field.validationRules ?? {}) as Record<string, unknown>;
  const val = rawValue!.trim();

  switch (field.fieldType) {
    case "text":
    case "textarea": {
      if (typeof rules.minLength === "number" && val.length < rules.minLength) {
        return { isValid: false, error: `Minimum length is ${rules.minLength} characters` };
      }
      if (typeof rules.maxLength === "number" && val.length > rules.maxLength) {
        return { isValid: false, error: `Maximum length is ${rules.maxLength} characters` };
      }
      if (rules?.regex) {
        const regexSource = rules.regex as string;
        // ReDoS mitigation per Batch 04 (M-10). Node has no per-regex execution timeout,
        // so we bound regex source length, input length, and reject obvious
        // catastrophic-backtracking shapes. Replace with RE2 if templates need richer regex.
        if (typeof regexSource !== "string" || regexSource.length > 200) {
          return { isValid: false, error: "Validation configuration error" };
        }
        if (val.length > 10_000) {
          return { isValid: false, error: "Input is too long to validate" };
        }
        if (/(\(.*\+\)\+|\(.*\*\)\*|\(.*\?\)\?)/.test(regexSource)) {
          return { isValid: false, error: "Validation configuration error" };
        }
        try {
          if (!new RegExp(regexSource).test(val)) {
            return { isValid: false, error: (rules.regexError as string | undefined) ?? "Invalid format" };
          }
        } catch {
          return { isValid: false, error: "Validation configuration error" };
        }
      }
      return { isValid: true };
    }

    case "number": {
      const num = Number(val);
      if (isNaN(num)) return { isValid: false, error: "Must be a valid number" };
      if (typeof rules.min === "number" && num < rules.min) {
        return { isValid: false, error: `Minimum value is ${rules.min}` };
      }
      if (typeof rules.max === "number" && num > rules.max) {
        return { isValid: false, error: `Maximum value is ${rules.max}` };
      }
      return { isValid: true };
    }

    case "boolean": {
      if (val !== "true" && val !== "false") {
        return { isValid: false, error: 'Must be "true" or "false"' };
      }
      return { isValid: true };
    }

    case "select": {
      if (!rules?.options || (rules.options as string[]).length === 0) return { isValid: true };
      if (!(rules.options as string[]).includes(val)) {
        return { isValid: false, error: `Must be one of: ${(rules.options as string[]).join(", ")}` };
      }
      return { isValid: true };
    }

    case "multiselect": {
      const options = Array.isArray(rules.options) ? (rules.options as string[]) : [];
      let selected: string[];
      try {
        selected = JSON.parse(val);
        if (!Array.isArray(selected)) throw new Error();
      } catch {
        return { isValid: false, error: "Must be a JSON array of selected values" };
      }
      const invalid = selected.filter((s) => !options.includes(s));
      if (invalid.length > 0) {
        return { isValid: false, error: `Invalid options: ${invalid.join(", ")}` };
      }
      if (typeof rules.minSelections === "number" && selected.length < rules.minSelections) {
        return { isValid: false, error: `Select at least ${rules.minSelections} options` };
      }
      if (typeof rules.maxSelections === "number" && selected.length > rules.maxSelections) {
        return { isValid: false, error: `Select at most ${rules.maxSelections} options` };
      }
      return { isValid: true };
    }

    case "date": {
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/;
      if (!isoDateRegex.test(val)) return { isValid: false, error: "Invalid date format. Use YYYY-MM-DD" };
      const d = new Date(val);
      if (isNaN(d.getTime())) return { isValid: false, error: "Invalid date" };
      if (typeof rules.minDate === "string") {
        if (d < new Date(rules.minDate)) {
          return { isValid: false, error: `Date must be on or after ${rules.minDate}` };
        }
      }
      if (typeof rules.maxDate === "string") {
        if (d > new Date(rules.maxDate)) {
          return { isValid: false, error: `Date must be on or before ${rules.maxDate}` };
        }
      }
      return { isValid: true };
    }

    default:
      console.warn(`Unknown field type: ${field.fieldType}`);
      return { isValid: true };
  }
}

// ── Output schemas ────────────────────────────────────────────────────────────

const templateFieldSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  fieldKey: z.string(),
  label: z.string(),
  fieldType: z.string(),
  isRequired: z.boolean(),
  displayOrder: z.number(),
  validationRules: z.unknown().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  version: z.number(),
  isActive: z.boolean(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  fields: z.array(templateFieldSchema).optional(),
});

const submissionValueSchema = z.object({
  id: z.string(),
  fieldId: z.string(),
  fieldKey: z.string(),
  fieldLabel: z.string(),
  rawValue: z.string(),
  isValid: z.boolean(),
  validationError: z.string().nullable(),
});

const submissionAttachmentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  createdAt: z.string(),
});

const submissionSchema = z.object({
  id: z.string(),
  complaintId: z.string(),
  templateId: z.string(),
  templateName: z.string(),
  submittedById: z.string(),
  testReportId: z.string().nullable(),
  isDisabled: z.boolean(),
  disabledReason: z.string().nullable(),
  submittedAt: z.string(),
  values: z.array(submissionValueSchema),
  attachments: z.array(submissionAttachmentSchema),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTemplateField(f: {
  id: string;
  templateId: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  displayOrder: number;
  validationRules: unknown;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: f.id,
    templateId: f.templateId,
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: f.fieldType,
    isRequired: f.isRequired,
    displayOrder: f.displayOrder,
    validationRules: f.validationRules ?? null,
    isActive: f.isActive,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
  };
}

function toSubmissionAttachment(attachment: {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    fileSize: attachment.fileSize,
    createdAt: attachment.createdAt.toISOString(),
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

export const serviceFormsRouter = createTRPCRouter({
  // ── Template management (service:templates) ─────────────────────────────────

  listTemplates: internalPerm(P.service.read)
    .input(
      z.object({
        isActive: z.boolean().optional(),
        withFields: z.boolean().default(false),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .output(z.object({ items: z.array(templateSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const parsed = decodeCursor(input.cursor);
      const rows = await ctx.prisma.serviceFormTemplate.findMany({
        where: {
          orgId,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(parsed ? { OR: [{ createdAt: { lt: new Date(parsed.ts) } }, { createdAt: new Date(parsed.ts), id: { lt: parsed.id } }] } : {}),
        },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit + 1,
      });
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null;
      return {
        items: items.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          version: t.version,
          isActive: t.isActive,
          createdById: t.createdById,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          fields: input.withFields ? t.fields.map(toTemplateField) : undefined,
        })),
        nextCursor,
      };
    }),

  getTemplate: internalPerm(P.service.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(templateSchema)
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const t = await ctx.prisma.serviceFormTemplate.findFirst({
        where: { id: input.id, orgId },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
      });
      if (!t) throw apiError("NOT_FOUND", "Form template not found");
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        version: t.version,
        isActive: t.isActive,
        createdById: t.createdById,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        fields: t.fields.map(toTemplateField),
      };
    }),

  createTemplate: internalPermAny(P.service.templates, P.service.manage)
    .input(
      z.object({
        name: z.string().min(2).max(200),
        description: z.string().max(1000).optional(),
        fields: z
          .array(
            z.object({
              fieldKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
              label: z.string().min(1).max(200),
              fieldType: z.enum(["text", "textarea", "number", "boolean", "select", "multiselect", "date"]),
              isRequired: z.boolean().default(true),
              displayOrder: z.number().int().default(0),
              validationRules: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .optional(),
      }),
    )
    .output(templateSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      if (input.fields) {
        const fieldKeys = input.fields.map((f) => f.fieldKey);
        if (new Set(fieldKeys).size !== fieldKeys.length) {
          throw apiError("BAD_REQUEST", "Duplicate fieldKey values in template fields");
        }
        for (const f of input.fields) {
          if (f.fieldType === "select" || f.fieldType === "multiselect") {
            const options = f.validationRules?.options;
            if (!Array.isArray(options) || options.length === 0) {
              throw apiError("BAD_REQUEST", `Field '${f.fieldKey}' of type '${f.fieldType}' must have a non-empty validationRules.options array`);
            }
          }
        }
      }

      const orgId = requireOrgId(ctx.actor.orgId);
      const t = await ctx.prisma.serviceFormTemplate.create({
        data: {
          orgId,
          name: input.name,
          description: input.description ?? null,
          createdById: actorId,
          fields: input.fields
            ? {
                create: input.fields.map((f) => ({
                  fieldKey: f.fieldKey,
                  label: f.label,
                  fieldType: f.fieldType,
                  isRequired: f.isRequired,
                  displayOrder: f.displayOrder,
                  validationRules: f.validationRules ? (f.validationRules as Prisma.InputJsonValue) : undefined,
                })),
              }
            : undefined,
        },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
      });

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        version: t.version,
        isActive: t.isActive,
        createdById: t.createdById,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        fields: t.fields.map(toTemplateField),
      };
    }),

  updateTemplate: internalPermAny(P.service.templates, P.service.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
      }),
    )
    .output(templateSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const existing = await ctx.prisma.serviceFormTemplate.findFirst({ where: { id: input.id, orgId }, select: { id: true, orgId: true } });
      if (!existing) throw apiError("NOT_FOUND", "Form template not found");

      const t = await ctx.prisma.serviceFormTemplate.update({
        where: { id: input.id },
        data: {
          name: input.name,
          description: input.description,
        },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
      });

      return {
        id: t.id,
        name: t.name,
        description: t.description,
        version: t.version,
        isActive: t.isActive,
        createdById: t.createdById,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        fields: t.fields.map(toTemplateField),
      };
    }),

  addField: internalPermAny(P.service.templates, P.service.manage)
    .input(
      z.object({
        templateId: z.string().uuid(),
        fieldKey: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/),
        label: z.string().min(1).max(200),
        fieldType: z.enum(["text", "textarea", "number", "boolean", "select", "multiselect", "date"]),
        isRequired: z.boolean().default(true),
        displayOrder: z.number().int().default(0),
        validationRules: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .output(templateFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const tmpl = await ctx.prisma.serviceFormTemplate.findFirst({ where: { id: input.templateId, orgId }, select: { id: true, orgId: true } });
      if (!tmpl) throw apiError("NOT_FOUND", "Form template not found");

      if (input.fieldType === "select" || input.fieldType === "multiselect") {
        const options = input.validationRules?.options;
        if (!Array.isArray(options) || options.length === 0) {
          throw apiError("BAD_REQUEST", `Field of type '${input.fieldType}' must have a non-empty validationRules.options array`);
        }
      }

      try {
        const [field] = await ctx.prisma.$transaction([
          ctx.prisma.serviceFormTemplateField.create({
            data: {
              templateId: input.templateId,
              fieldKey: input.fieldKey,
              label: input.label,
              fieldType: input.fieldType,
              isRequired: input.isRequired,
              displayOrder: input.displayOrder,
              validationRules: input.validationRules ? (input.validationRules as Prisma.InputJsonValue) : undefined,
            },
          }),
          ctx.prisma.serviceFormTemplate.update({
            where: { id: input.templateId },
            data: { version: { increment: 1 } },
          }),
        ]);

        return toTemplateField(field);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw apiError("CONFLICT", "A field with this key already exists on the template");
        }
        throw err;
      }
    }),

  updateField: internalPermAny(P.service.templates, P.service.manage)
    .input(
      z.object({
        fieldId: z.string().uuid(),
        label: z.string().min(1).max(200).optional(),
        isRequired: z.boolean().optional(),
        displayOrder: z.number().int().optional(),
        validationRules: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .output(templateFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const existing = await ctx.prisma.serviceFormTemplateField.findFirst({
        where: { id: input.fieldId, template: { orgId } },
        select: { id: true, templateId: true },
      });
      if (!existing) throw apiError("NOT_FOUND", "Form field not found");

      const [field] = await ctx.prisma.$transaction([
        ctx.prisma.serviceFormTemplateField.update({
          where: { id: input.fieldId },
          data: {
            label: input.label,
            isRequired: input.isRequired,
            displayOrder: input.displayOrder,
            validationRules: input.validationRules !== undefined
              ? (input.validationRules === null
                  ? Prisma.NullableJsonNullValueInput.DbNull
                  : (input.validationRules as Prisma.InputJsonValue))
              : undefined,
          },
        }),
        ctx.prisma.serviceFormTemplate.update({
          where: { id: existing.templateId },
          data: { version: { increment: 1 } },
        }),
      ]);

      return toTemplateField(field);
    }),

  disableField: internalPermAny(P.service.templates, P.service.manage)
    .input(z.object({ fieldId: z.string().uuid() }))
    .output(templateFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const existing = await ctx.prisma.serviceFormTemplateField.findFirst({
        where: { id: input.fieldId, template: { orgId } },
        select: { id: true, templateId: true },
      });
      if (!existing) throw apiError("NOT_FOUND", "Form field not found");

      const [field] = await ctx.prisma.$transaction([
        ctx.prisma.serviceFormTemplateField.update({
          where: { id: input.fieldId },
          data: { isActive: false },
        }),
        ctx.prisma.serviceFormTemplate.update({
          where: { id: existing.templateId },
          data: { version: { increment: 1 } },
        }),
      ]);

      return toTemplateField(field);
    }),

  disableTemplate: internalPermAny(P.service.templates, P.service.manage)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const existing = await ctx.prisma.serviceFormTemplate.findFirst({ where: { id: input.id, orgId }, select: { id: true, orgId: true } });
      if (!existing) throw apiError("NOT_FOUND", "Form template not found");

      const t = await ctx.prisma.serviceFormTemplate.update({
        where: { id: input.id },
        data: { isActive: false },
        select: { id: true, isActive: true },
      });
      return t;
    }),

  // ── Submissions (service:write / service:form) ─────────────────────────────

  submitForm: internalPerm(P.service.form)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        templateId: z.string().uuid(),
        values: z.array(
          z.object({
            fieldKey: z.string(),
            rawValue: z.string(),
          }),
        ),
        attachmentIds: z.array(z.string().uuid()).max(5).optional(),
      }),
    )
    .output(submissionSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id as string;
      const orgId = requireOrgId(ctx.actor.orgId);
      const actorRole = await resolveServiceActorRole(ctx);
      const attachmentIds = input.attachmentIds ?? [];
      const accessWhere = await serviceComplaintAccessWhere(ctx, orgId);

      const [complaint, template] = await Promise.all([
        ctx.prisma.serviceComplaint.findFirst({
          where: { AND: [accessWhere, { id: input.complaintId }] },
          select: { id: true, orgId: true, status: true },
        }),
        ctx.prisma.serviceFormTemplate.findFirst({
          where: { id: input.templateId, orgId },
          include: { fields: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
        }),
      ]);

      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
      if (!template) throw apiError("NOT_FOUND", "Form template not found");
      if (complaint.status !== "visit") {
        throw apiError(
          "CONFLICT",
          `Diagnostic forms can only be submitted after a visit is logged; current status is '${complaint.status}'`,
        );
      }
      if (new Set(attachmentIds).size !== attachmentIds.length) {
        throw apiError("BAD_REQUEST", "Duplicate attachment IDs are not allowed");
      }
      if (
        actorRole === "service_engineer" &&
        (attachmentIds.length < 1 || attachmentIds.length > 5)
      ) {
        throw apiError("BAD_REQUEST", "Service Engineer form submissions require 1 to 5 images");
      }
      if (!template.isActive) throw apiError("BAD_REQUEST", "Cannot submit a disabled form template");

      const keys = input.values.map((v) => v.fieldKey);
      if (new Set(keys).size !== keys.length) {
        throw apiError("BAD_REQUEST", "Duplicate field keys in submission values");
      }

      const valueMap = new Map(input.values.map((v) => [v.fieldKey, v.rawValue]));
      const validatedValues: Array<{
        fieldId: string;
        fieldKey: string;
        rawValue: string;
        isValid: boolean;
        validationError: string | null;
      }> = [];
      const fieldErrors: string[] = [];

      for (const field of template.fields) {
        const rawValue = valueMap.get(field.fieldKey);
        const result = validateFieldValue(field, rawValue);
        validatedValues.push({
          fieldId: field.id,
          fieldKey: field.fieldKey,
          rawValue: rawValue ?? "",
          isValid: result.isValid,
          validationError: result.error ?? null,
        });
        if (!result.isValid) {
          fieldErrors.push(`${field.label}: ${result.error}`);
        }
      }

      if (fieldErrors.length > 0) {
        throw apiError("BAD_REQUEST", `Form validation failed: ${fieldErrors.join("; ")}`);
      }

      type SubmissionWithIncludes = Prisma.ServiceFormSubmissionGetPayload<{
        include: {
          values: { include: { field: { select: { label: true } } } };
          template: { select: { name: true } };
        };
      }>;

      const submission = await ctx.prisma.$transaction(async (tx) => {
        const attachments = attachmentIds.length === 0
          ? []
          : await tx.attachment.findMany({
              where: { id: { in: attachmentIds } },
              select: {
                id: true,
                entityType: true,
                entityId: true,
                fileName: true,
                mimeType: true,
                fileSize: true,
                uploadedById: true,
                isConfirmed: true,
                createdAt: true,
                pendingUpload: { select: { id: true } },
              },
            });
        if (attachments.length !== attachmentIds.length) {
          throw apiError("BAD_REQUEST", "One or more evidence attachments were not found");
        }
        for (const attachment of attachments) {
          if (!attachment.mimeType.toLowerCase().startsWith("image/")) {
            throw apiError("BAD_REQUEST", "Diagnostic evidence must use an image MIME type");
          }
          if (attachment.uploadedById !== actorId) {
            throw apiError("BAD_REQUEST", "Diagnostic evidence must be uploaded by the submitting user");
          }
          if (
            attachment.entityType !== "service_complaint" ||
            attachment.entityId !== input.complaintId
          ) {
            throw apiError("BAD_REQUEST", "Diagnostic evidence must be staged against this complaint");
          }
          if (!attachment.isConfirmed || attachment.pendingUpload) {
            throw apiError("BAD_REQUEST", "Diagnostic evidence upload must be confirmed");
          }
        }

        const sub = await tx.serviceFormSubmission.create({
          data: {
            complaintId: input.complaintId,
            templateId: input.templateId,
            submittedById: actorId,
            values: {
              create: validatedValues,
            },
          },
          include: {
            values: {
              include: {
                field: { select: { label: true } },
              },
            },
            template: { select: { name: true } },
          },
        }) as SubmissionWithIncludes;

        if (attachmentIds.length > 0) {
          const claimed = await tx.attachment.updateMany({
            where: {
              id: { in: attachmentIds },
              entityType: "service_complaint",
              entityId: input.complaintId,
              uploadedById: actorId,
              isConfirmed: true,
            },
            data: {
              entityType: "service_form_submission",
              entityId: sub.id,
            },
          });
          if (claimed.count !== attachmentIds.length) {
            throw apiError(
              "CONFLICT",
              "Diagnostic evidence was already committed; refresh and retry",
            );
          }
        }

        await recordComplaintActivity(tx, {
          complaintId: input.complaintId,
          actorId,
          action: "form_submitted",
          fromStatus: complaint.status,
          toStatus: complaint.status,
          meta: {
            templateId: input.templateId,
            templateName: template.name,
            fieldCount: validatedValues.length,
            attachmentCount: attachmentIds.length,
          },
        });

        return { sub, attachments };
      });

      return {
        id: submission.sub.id,
        complaintId: submission.sub.complaintId,
        templateId: submission.sub.templateId,
        templateName: submission.sub.template.name,
        submittedById: submission.sub.submittedById,
        testReportId: submission.sub.testReportId,
        isDisabled: submission.sub.isDisabled,
        disabledReason: submission.sub.disabledReason,
        submittedAt: submission.sub.submittedAt.toISOString(),
        values: submission.sub.values.map((v) => ({
          id: v.id,
          fieldId: v.fieldId,
          fieldKey: v.fieldKey,
          fieldLabel: v.field.label,
          rawValue: v.rawValue,
          isValid: v.isValid,
          validationError: v.validationError,
        })),
        attachments: submission.attachments.map(toSubmissionAttachment),
      };
    }),

  listSubmissions: internalPerm(P.service.read)
    .input(
      z.object({
        complaintId: z.string().uuid(),
        cursor: z.string().nullable().optional(),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    )
    .output(z.object({ items: z.array(submissionSchema), nextCursor: z.string().nullable() }))
    .query(async ({ ctx, input }) => {
      const orgId = requireOrgId(ctx.actor.orgId);
      const accessWhere = await serviceComplaintAccessWhere(ctx, orgId);
      const complaint = await ctx.prisma.serviceComplaint.findFirst({
        where: { AND: [accessWhere, { id: input.complaintId }] },
        select: { id: true, orgId: true },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

      const parsed = decodeCursor(input.cursor);
      const subs = await ctx.prisma.serviceFormSubmission.findMany({
        where: {
          complaintId: input.complaintId,
          ...(parsed ? { OR: [{ submittedAt: { gt: new Date(parsed.ts) } }, { submittedAt: new Date(parsed.ts), id: { gt: parsed.id } }] } : {}),
        },
        include: {
          values: {
            include: {
              field: { select: { label: true } },
            },
          },
          template: { select: { name: true } },
        },
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        take: input.limit + 1,
      });
      const hasMore = subs.length > input.limit;
      const items = hasMore ? subs.slice(0, input.limit) : subs;
      const evidence = items.length === 0
        ? []
        : await ctx.prisma.attachment.findMany({
            where: {
              entityType: "service_form_submission",
              entityId: { in: items.map((item) => item.id) },
              isConfirmed: true,
            },
            select: {
              id: true,
              entityId: true,
              fileName: true,
              mimeType: true,
              fileSize: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          });
      const evidenceBySubmission = new Map<string, typeof evidence>();
      for (const attachment of evidence) {
        const current = evidenceBySubmission.get(attachment.entityId) ?? [];
        current.push(attachment);
        evidenceBySubmission.set(attachment.entityId, current);
      }
      const nextCursor = hasMore
        ? encodeCursor({ createdAt: items[items.length - 1].submittedAt, id: items[items.length - 1].id })
        : null;

      return {
        items: items.map((s) => ({
          id: s.id,
          complaintId: s.complaintId,
          templateId: s.templateId,
          templateName: s.template.name,
          submittedById: s.submittedById,
          testReportId: s.testReportId,
          isDisabled: s.isDisabled,
          disabledReason: s.disabledReason,
          submittedAt: s.submittedAt.toISOString(),
          values: s.values.map((v) => ({
            id: v.id,
            fieldId: v.fieldId,
            fieldKey: v.fieldKey,
            fieldLabel: v.field.label,
            rawValue: v.rawValue,
            isValid: v.isValid,
            validationError: v.validationError,
          })),
          attachments: (evidenceBySubmission.get(s.id) ?? []).map(toSubmissionAttachment),
        })),
        nextCursor,
      };
    }),

  disableSubmission: internalPermAny(P.service.workflow, P.service.manage)
    .input(
      z.object({
        submissionId: z.string().uuid(),
        reason: z.string().min(2).max(1000),
      }),
    )
    .output(z.object({ id: z.string(), isDisabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      const orgId = requireOrgId(ctx.actor.orgId);
      const accessWhere = await serviceComplaintAccessWhere(ctx, orgId);

      const existing = await ctx.prisma.serviceFormSubmission.findFirst({
        where: { id: input.submissionId, complaint: accessWhere },
        select: { id: true, complaintId: true, isDisabled: true },
      });
      if (!existing) throw apiError("NOT_FOUND", "Form submission not found");
      if (existing.isDisabled) throw apiError("CONFLICT", "Submission is already disabled");

      const complaint = await ctx.prisma.serviceComplaint.findFirst({
        where: { id: existing.complaintId, orgId },
        select: { orgId: true, status: true },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");

      await ctx.prisma.$transaction(async (tx) => {
        await tx.serviceFormSubmission.update({
          where: { id: input.submissionId },
          data: { isDisabled: true, disabledReason: input.reason },
        });

        await recordComplaintActivity(tx, {
          complaintId: existing.complaintId,
          actorId,
          action: "form_submission_disabled",
          fromStatus: complaint.status,
          toStatus: complaint.status,
          meta: { submissionId: input.submissionId, reason: input.reason },
        });
      });

      return { id: input.submissionId, isDisabled: true };
    }),
});
