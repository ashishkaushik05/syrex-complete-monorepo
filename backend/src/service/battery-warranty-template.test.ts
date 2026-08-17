import { describe, expect, it } from "bun:test";
import { BATTERY_WARRANTY_TEMPLATE } from "./battery-warranty-template";
import { validateFieldValue } from "../trpc/routes/service-forms";

describe("Battery Warranty Check template", () => {
  it("has unique keys and deterministic display order", () => {
    const keys = BATTERY_WARRANTY_TEMPLATE.fields.map((field) => field.fieldKey);
    const orders = BATTERY_WARRANTY_TEMPLATE.fields.map((field) => field.displayOrder);
    expect(new Set(keys).size).toBe(keys.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("provides options for every choice field", () => {
    for (const field of BATTERY_WARRANTY_TEMPLATE.fields) {
      if (field.fieldType !== "select" && field.fieldType !== "multiselect") continue;
      expect(field.validationRules.options.length).toBeGreaterThan(0);
    }
  });

  it("rejects impossible electrical readings and short observations", () => {
    const openCircuit = BATTERY_WARRANTY_TEMPLATE.fields.find(
      (field) => field.fieldKey === "open_circuit_voltage",
    )!;
    const observations = BATTERY_WARRANTY_TEMPLATE.fields.find(
      (field) => field.fieldKey === "engineer_observations",
    )!;

    expect(validateFieldValue(openCircuit as never, "24")).toMatchObject({ isValid: false });
    expect(validateFieldValue(openCircuit as never, "12.6")).toEqual({ isValid: true });
    expect(validateFieldValue(observations as never, "short")).toMatchObject({ isValid: false });
    expect(validateFieldValue(observations as never, "Battery tested under normal load.")).toEqual({
      isValid: true,
    });
  });
});
