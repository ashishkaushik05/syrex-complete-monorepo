import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { assertOrgAccess, recordComplaintActivity, FINAL_STATUSES } from "./service-shared";
import type { ServiceFormTemplateField } from "@prisma/client";

// ── Validation ────────────────────────────────────────────────────────────────

function validateFieldValue(
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
        if ((rules.regex as string).length > 500) return { isValid: false, error: "Validation configuration error" };
        try {
          if (!new RegExp(rules.regex as string).test(val)) {
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
  rawValue: z.string(),
  isValid: z.boolean(),
  validationError: z.string().nullable(),
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

// ── Router ────────────────────────────────────────────────────────────────────

export const serviceFormsRouter = createTRPCRouter({
  // ── Template management (service:manage) ────────────────────────────────────

  listTemplates: perm(P.service.read)
    .input(
      z.object({
        isActive: z.boolean().optional(),
        withFields: z.boolean().default(false),
      }),
    )
    .output(z.array(templateSchema))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.prisma.serviceFormTemplate.findMany({
        where: {
          orgId: ctx.actor.orgId ?? undefined,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
        orderBy: { createdAt: "desc" },
      });
      return rows.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        version: t.version,
        isActive: t.isActive,
        createdById: t.createdById,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        fields: input.withFields ? t.fields.map(toTemplateField) : undefined,
      }));
    }),

  getTemplate: perm(P.service.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(templateSchema)
    .query(async ({ ctx, input }) => {
      const t = await ctx.prisma.serviceFormTemplate.findUnique({
        where: { id: input.id },
        include: { fields: { orderBy: { displayOrder: "asc" } } },
      });
      if (!t) throw apiError("NOT_FOUND", "Form template not found");
      assertOrgAccess(ctx.actor.orgId, t.orgId, "Form template");
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

  createTemplate: perm(P.service.manage)
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

      const t = await ctx.prisma.serviceFormTemplate.create({
        data: {
          orgId: ctx.actor.orgId ?? null,
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

  updateTemplate: perm(P.service.manage)
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(2).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
      }),
    )
    .output(templateSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.serviceFormTemplate.findUnique({ where: { id: input.id }, select: { id: true, orgId: true } });
      if (!existing) throw apiError("NOT_FOUND", "Form template not found");
      assertOrgAccess(ctx.actor.orgId, existing.orgId, "Form template");

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

  addField: perm(P.service.manage)
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
      const tmpl = await ctx.prisma.serviceFormTemplate.findUnique({ where: { id: input.templateId }, select: { id: true, orgId: true } });
      if (!tmpl) throw apiError("NOT_FOUND", "Form template not found");
      assertOrgAccess(ctx.actor.orgId, tmpl.orgId, "Form template");

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

  updateField: perm(P.service.manage)
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
      const existing = await ctx.prisma.serviceFormTemplateField.findUnique({
        where: { id: input.fieldId },
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

  disableField: perm(P.service.manage)
    .input(z.object({ fieldId: z.string().uuid() }))
    .output(templateFieldSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.serviceFormTemplateField.findUnique({
        where: { id: input.fieldId },
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

  disableTemplate: perm(P.service.manage)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.serviceFormTemplate.findUnique({ where: { id: input.id }, select: { id: true, orgId: true } });
      if (!existing) throw apiError("NOT_FOUND", "Form template not found");
      assertOrgAccess(ctx.actor.orgId, existing.orgId, "Form template");

      const t = await ctx.prisma.serviceFormTemplate.update({
        where: { id: input.id },
        data: { isActive: false },
        select: { id: true, isActive: true },
      });
      return t;
    }),

  // ── Submissions (service:write / service:form) ─────────────────────────────

  submitForm: perm(P.service.form)
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
      }),
    )
    .output(submissionSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id as string;

      const [complaint, template] = await Promise.all([
        ctx.prisma.serviceComplaint.findUnique({
          where: { id: input.complaintId },
          select: { id: true, orgId: true, status: true },
        }),
        ctx.prisma.serviceFormTemplate.findUnique({
          where: { id: input.templateId },
          include: { fields: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
        }),
      ]);

      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
      assertOrgAccess(ctx.actor.orgId, complaint.orgId, "Complaint");
      if (!template) throw apiError("NOT_FOUND", "Form template not found");
      assertOrgAccess(ctx.actor.orgId, template.orgId, "Form template");
      if (!template.isActive) throw apiError("BAD_REQUEST", "Cannot submit a disabled form template");

      if (FINAL_STATUSES.has(complaint.status)) {
        throw apiError("CONFLICT", `Cannot submit a form to a complaint with status '${complaint.status}'`);
      }

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
        include: { values: true; template: { select: { name: true } } };
      }>;

      const submission = await ctx.prisma.$transaction(async (tx) => {
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
            values: true,
            template: { select: { name: true } },
          },
        }) as SubmissionWithIncludes;

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
          },
        });

        return sub;
      });

      return {
        id: submission.id,
        complaintId: submission.complaintId,
        templateId: submission.templateId,
        templateName: submission.template.name,
        submittedById: submission.submittedById,
        testReportId: submission.testReportId,
        isDisabled: submission.isDisabled,
        disabledReason: submission.disabledReason,
        submittedAt: submission.submittedAt.toISOString(),
        values: submission.values.map((v) => ({
          id: v.id,
          fieldId: v.fieldId,
          fieldKey: v.fieldKey,
          rawValue: v.rawValue,
          isValid: v.isValid,
          validationError: v.validationError,
        })),
      };
    }),

  listSubmissions: perm(P.service.read)
    .input(z.object({ complaintId: z.string().uuid() }))
    .output(z.array(submissionSchema))
    .query(async ({ ctx, input }) => {
      const complaint = await ctx.prisma.serviceComplaint.findUnique({
        where: { id: input.complaintId },
        select: { id: true, orgId: true },
      });
      if (!complaint) throw apiError("NOT_FOUND", "Complaint not found");
      assertOrgAccess(ctx.actor.orgId, complaint.orgId, "Complaint");

      const subs = await ctx.prisma.serviceFormSubmission.findMany({
        where: { complaintId: input.complaintId },
        include: {
          values: true,
          template: { select: { name: true } },
        },
        orderBy: { submittedAt: "asc" },
      });

      return subs.map((s) => ({
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
          rawValue: v.rawValue,
          isValid: v.isValid,
          validationError: v.validationError,
        })),
      }));
    }),

  disableSubmission: perm(P.service.manage)
    .input(
      z.object({
        submissionId: z.string().uuid(),
        reason: z.string().min(2).max(1000),
      }),
    )
    .output(z.object({ id: z.string(), isDisabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;

      const existing = await ctx.prisma.serviceFormSubmission.findUnique({
        where: { id: input.submissionId },
        select: { id: true, complaintId: true, isDisabled: true },
      });
      if (!existing) throw apiError("NOT_FOUND", "Form submission not found");
      if (existing.isDisabled) throw apiError("CONFLICT", "Submission is already disabled");

      const complaint = await ctx.prisma.serviceComplaint.findUnique({
        where: { id: existing.complaintId },
        select: { orgId: true, status: true },
      });
      assertOrgAccess(ctx.actor.orgId, complaint?.orgId ?? null, "Complaint");

      await ctx.prisma.$transaction(async (tx) => {
        await tx.serviceFormSubmission.update({
          where: { id: input.submissionId },
          data: { isDisabled: true, disabledReason: input.reason },
        });

        await recordComplaintActivity(tx, {
          complaintId: existing.complaintId,
          actorId,
          action: "form_submission_disabled",
          fromStatus: complaint?.status ?? null,
          toStatus: complaint?.status ?? null,
          meta: { submissionId: input.submissionId, reason: input.reason },
        });
      });

      return { id: input.submissionId, isDisabled: true };
    }),
});
