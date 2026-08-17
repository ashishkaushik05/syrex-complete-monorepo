import { Prisma, type PrismaClient } from "@prisma/client";

export const BATTERY_WARRANTY_TEMPLATE_ID = "f9000000-0000-4000-8000-000000000001";

export const BATTERY_WARRANTY_TEMPLATE = {
  id: BATTERY_WARRANTY_TEMPLATE_ID,
  name: "Battery Warranty Check",
  description:
    "Standard battery warranty inspection. Record purchase proof, physical condition, electrical readings, probable cause, recommendation, and supporting photographic evidence.",
  fields: [
    {
      id: "fa000000-0000-4000-8000-000000000001",
      fieldKey: "inspection_date",
      label: "Inspection date",
      fieldType: "date",
      isRequired: true,
      displayOrder: 10,
    },
    {
      id: "fa000000-0000-4000-8000-000000000002",
      fieldKey: "invoice_available",
      label: "Purchase invoice available",
      fieldType: "boolean",
      isRequired: true,
      displayOrder: 20,
    },
    {
      id: "fa000000-0000-4000-8000-000000000003",
      fieldKey: "invoice_number",
      label: "Purchase invoice number",
      fieldType: "text",
      isRequired: false,
      displayOrder: 30,
      validationRules: { maxLength: 100 },
    },
    {
      id: "fa000000-0000-4000-8000-000000000004",
      fieldKey: "purchase_date",
      label: "Purchase date",
      fieldType: "date",
      isRequired: false,
      displayOrder: 40,
    },
    {
      id: "fa000000-0000-4000-8000-000000000005",
      fieldKey: "application_type",
      label: "Battery application",
      fieldType: "select",
      isRequired: true,
      displayOrder: 50,
      validationRules: {
        options: ["Automotive", "Inverter", "Solar", "Commercial vehicle", "Other"],
      },
    },
    {
      id: "fa000000-0000-4000-8000-000000000006",
      fieldKey: "manufacturing_code",
      label: "Manufacturing code",
      fieldType: "text",
      isRequired: true,
      displayOrder: 60,
      validationRules: { minLength: 2, maxLength: 100 },
    },
    {
      id: "fa000000-0000-4000-8000-000000000007",
      fieldKey: "warranty_seal_intact",
      label: "Warranty seal intact",
      fieldType: "boolean",
      isRequired: true,
      displayOrder: 70,
    },
    {
      id: "fa000000-0000-4000-8000-000000000008",
      fieldKey: "terminal_condition",
      label: "Terminal condition",
      fieldType: "select",
      isRequired: true,
      displayOrder: 80,
      validationRules: {
        options: ["Good", "Corroded", "Loose", "Damaged"],
      },
    },
    {
      id: "fa000000-0000-4000-8000-000000000009",
      fieldKey: "electrolyte_level",
      label: "Electrolyte level",
      fieldType: "select",
      isRequired: true,
      displayOrder: 90,
      validationRules: {
        options: ["Normal", "Low", "Very low", "Not applicable"],
      },
    },
    {
      id: "fa000000-0000-4000-8000-000000000010",
      fieldKey: "visible_condition",
      label: "Visible battery condition",
      fieldType: "multiselect",
      isRequired: true,
      displayOrder: 100,
      validationRules: {
        options: [
          "No visible damage",
          "Bulging",
          "Cracked case",
          "Electrolyte leakage",
          "Burn marks",
          "Terminal damage",
          "Impact damage",
        ],
        minSelections: 1,
        maxSelections: 4,
      },
    },
    {
      id: "fa000000-0000-4000-8000-000000000011",
      fieldKey: "open_circuit_voltage",
      label: "Open-circuit voltage (V)",
      fieldType: "number",
      isRequired: true,
      displayOrder: 110,
      validationRules: { min: 0, max: 20 },
    },
    {
      id: "fa000000-0000-4000-8000-000000000012",
      fieldKey: "loaded_voltage",
      label: "Voltage under load (V)",
      fieldType: "number",
      isRequired: false,
      displayOrder: 120,
      validationRules: { min: 0, max: 20 },
    },
    {
      id: "fa000000-0000-4000-8000-000000000013",
      fieldKey: "charging_voltage",
      label: "Charging-system voltage (V)",
      fieldType: "number",
      isRequired: false,
      displayOrder: 130,
      validationRules: { min: 0, max: 20 },
    },
    {
      id: "fa000000-0000-4000-8000-000000000014",
      fieldKey: "specific_gravity",
      label: "Specific gravity",
      fieldType: "number",
      isRequired: false,
      displayOrder: 140,
      validationRules: { min: 1, max: 1.5 },
    },
    {
      id: "fa000000-0000-4000-8000-000000000015",
      fieldKey: "probable_failure_cause",
      label: "Probable failure cause",
      fieldType: "select",
      isRequired: true,
      displayOrder: 150,
      validationRules: {
        options: [
          "Manufacturing defect",
          "Deep discharge",
          "Charging-system issue",
          "Physical damage",
          "Improper maintenance",
          "Normal wear",
          "No fault found",
          "Inconclusive",
        ],
      },
    },
    {
      id: "fa000000-0000-4000-8000-000000000016",
      fieldKey: "warranty_recommendation",
      label: "Warranty recommendation",
      fieldType: "select",
      isRequired: true,
      displayOrder: 160,
      validationRules: {
        options: ["Eligible", "Not eligible", "Further review required"],
      },
    },
    {
      id: "fa000000-0000-4000-8000-000000000017",
      fieldKey: "engineer_observations",
      label: "Engineer observations",
      fieldType: "textarea",
      isRequired: true,
      displayOrder: 170,
      validationRules: { minLength: 10, maxLength: 2000 },
    },
  ],
} as const;

type SeedClient = Pick<PrismaClient, "$transaction">;

export async function installBatteryWarrantyTemplate(
  prisma: SeedClient,
  input: { orgId: string; createdById?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const template = await tx.serviceFormTemplate.upsert({
      where: { id: BATTERY_WARRANTY_TEMPLATE.id },
      update: {
        orgId: input.orgId,
        name: BATTERY_WARRANTY_TEMPLATE.name,
        description: BATTERY_WARRANTY_TEMPLATE.description,
        isActive: true,
        createdById: input.createdById ?? null,
      },
      create: {
        id: BATTERY_WARRANTY_TEMPLATE.id,
        orgId: input.orgId,
        name: BATTERY_WARRANTY_TEMPLATE.name,
        description: BATTERY_WARRANTY_TEMPLATE.description,
        isActive: true,
        createdById: input.createdById ?? null,
      },
    });

    for (const field of BATTERY_WARRANTY_TEMPLATE.fields) {
      const validationRules = "validationRules" in field
        ? (field.validationRules as Prisma.InputJsonValue)
        : Prisma.JsonNull;
      await tx.serviceFormTemplateField.upsert({
        where: { id: field.id },
        update: {
          templateId: template.id,
          fieldKey: field.fieldKey,
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          displayOrder: field.displayOrder,
          validationRules,
          isActive: true,
        },
        create: {
          id: field.id,
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

    return {
      templateId: template.id,
      name: template.name,
      fieldCount: BATTERY_WARRANTY_TEMPLATE.fields.length,
    };
  });
}
