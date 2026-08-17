import { Prisma, type PrismaClient } from "@prisma/client";

// Legacy-parity battery test form (wms.syrexbatteries.com). Captures per-cell
// voltage readings across the three charge stages, the physical inspection
// checklist, and the HRD (High-Rate Discharge) load test. Mirrors the fixed
// test sheet the legacy platform required service engineers to fill.
export const BATTERY_TEST_STANDARD_TEMPLATE_ID = "f9000000-0000-4000-8000-000000000002";

const OK_NOT_OK = { options: ["ok", "not_ok"] };
const YES_NO = { options: ["yes", "no"] };

type FieldDef = {
  fieldKey: string;
  label: string;
  fieldType: "text" | "textarea" | "number" | "boolean" | "select" | "multiselect" | "date";
  isRequired: boolean;
  validationRules?: Record<string, unknown>;
};

function cellStage(stage: "at_receipt" | "on_charging" | "after_charging", stageLabel: string): FieldDef[] {
  const fields: FieldDef[] = [];
  for (let cell = 1; cell <= 6; cell += 1) {
    fields.push({
      fieldKey: `cell${cell}_${stage}`,
      label: `Cell ${cell} Voltage ${stageLabel} (V)`,
      fieldType: "number",
      isRequired: true,
      validationRules: { min: 0, max: 5 },
    });
  }
  fields.push({
    fieldKey: `ocv_${stage}`,
    label: `OCV ${stageLabel} (V)`,
    fieldType: "number",
    isRequired: true,
    validationRules: { min: 0, max: 20 },
  });
  return fields;
}

const FIELD_DEFS: FieldDef[] = [
  ...cellStage("at_receipt", "at Receipt"),
  {
    fieldKey: "physical_condition_at_receipt",
    label: "Physical Condition at Receipt",
    fieldType: "text",
    isRequired: false,
    validationRules: { maxLength: 500 },
  },
  ...cellStage("on_charging", "on Charging"),
  ...cellStage("after_charging", "after Charging"),
  // Physical inspection checklist
  { fieldKey: "physical_container", label: "Container Condition", fieldType: "select", isRequired: true, validationRules: OK_NOT_OK },
  { fieldKey: "physical_pos_terminal", label: "Positive Terminal", fieldType: "select", isRequired: true, validationRules: OK_NOT_OK },
  { fieldKey: "physical_neg_terminal", label: "Negative Terminal", fieldType: "select", isRequired: true, validationRules: OK_NOT_OK },
  { fieldKey: "physical_electrolyte_level", label: "Electrolyte Level", fieldType: "select", isRequired: true, validationRules: OK_NOT_OK },
  { fieldKey: "physical_electrolyte_colour", label: "Electrolyte Colour", fieldType: "select", isRequired: true, validationRules: OK_NOT_OK },
  { fieldKey: "physical_warranty_card", label: "Warranty Card Present", fieldType: "select", isRequired: true, validationRules: YES_NO },
  { fieldKey: "physical_invoice", label: "Invoice / Bill Present", fieldType: "select", isRequired: true, validationRules: YES_NO },
  // HRD (High-Rate Discharge) load test
  { fieldKey: "hrd_load_current", label: "HRD Load Current (A)", fieldType: "number", isRequired: true, validationRules: { min: 0, max: 2000 } },
  { fieldKey: "hrd_voltage", label: "HRD Voltage (V)", fieldType: "number", isRequired: true, validationRules: { min: 0, max: 20 } },
  { fieldKey: "hrd_start_time", label: "HRD Test Start Time", fieldType: "text", isRequired: true, validationRules: { maxLength: 20 } },
  { fieldKey: "hrd_end_time", label: "HRD Test End Time", fieldType: "text", isRequired: true, validationRules: { maxLength: 20 } },
  { fieldKey: "hrd_duration_minutes", label: "HRD Test Duration (minutes)", fieldType: "number", isRequired: true, validationRules: { min: 0, max: 1440 } },
  { fieldKey: "remarks", label: "Remarks", fieldType: "textarea", isRequired: false, validationRules: { maxLength: 2000 } },
];

export const BATTERY_TEST_STANDARD_TEMPLATE = {
  id: BATTERY_TEST_STANDARD_TEMPLATE_ID,
  name: "Battery Test — Standard",
  description:
    "Standard battery diagnostic test sheet: per-cell voltages at receipt / on charging / after charging, physical inspection checklist, and HRD load test.",
  fields: FIELD_DEFS.map((field, index) => ({
    ...field,
    displayOrder: (index + 1) * 10,
  })),
} as const;

type SeedClient = Pick<PrismaClient, "$transaction">;

export async function installBatteryTestStandardTemplate(
  prisma: SeedClient,
  input: { orgId: string; createdById?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.serviceFormTemplate.upsert({
      where: { id: BATTERY_TEST_STANDARD_TEMPLATE.id },
      update: {
        orgId: input.orgId,
        name: BATTERY_TEST_STANDARD_TEMPLATE.name,
        description: BATTERY_TEST_STANDARD_TEMPLATE.description,
        isActive: true,
        createdById: input.createdById ?? null,
      },
      create: {
        id: BATTERY_TEST_STANDARD_TEMPLATE.id,
        orgId: input.orgId,
        name: BATTERY_TEST_STANDARD_TEMPLATE.name,
        description: BATTERY_TEST_STANDARD_TEMPLATE.description,
        isActive: true,
        createdById: input.createdById ?? null,
      },
    });

    // Idempotent re-seed: replace this template's fields wholesale by fieldKey.
    const existingFields = await tx.serviceFormTemplateField.findMany({
      where: { templateId: template.id },
      select: { id: true, fieldKey: true },
    });
    const idByKey = new Map(existingFields.map((f) => [f.fieldKey, f.id]));

    for (const field of BATTERY_TEST_STANDARD_TEMPLATE.fields) {
      const validationRules = field.validationRules
        ? (field.validationRules as Prisma.InputJsonValue)
        : Prisma.JsonNull;
      const existingId = idByKey.get(field.fieldKey);
      if (existingId) {
        await tx.serviceFormTemplateField.update({
          where: { id: existingId },
          data: {
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            displayOrder: field.displayOrder,
            validationRules,
            isActive: true,
          },
        });
      } else {
        await tx.serviceFormTemplateField.create({
          data: {
            templateId: template.id,
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired,
            displayOrder: field.displayOrder,
            validationRules,
            isActive: true,
          },
        });
      }
    }

    return {
      templateId: template.id,
      name: template.name,
      fieldCount: BATTERY_TEST_STANDARD_TEMPLATE.fields.length,
    };
  });
}
