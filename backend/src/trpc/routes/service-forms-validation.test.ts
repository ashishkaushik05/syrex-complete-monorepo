import { describe, expect, it } from "bun:test";

import { validateFieldValue } from "./service-forms";

// Batch 04 (M-10) — ReDoS hardening regression coverage for text field regex.
describe("service-forms validateFieldValue regex hardening", () => {
  it("rejects regex source longer than 200 chars (config error)", () => {
    const longRegex = "a".repeat(250);
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: longRegex },
      },
      "abc",
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Validation configuration error");
  });

  it("rejects classic catastrophic-backtracking patterns like (a+)+", () => {
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: "(a+)+$" },
      },
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!",
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Validation configuration error");
  });

  it("rejects (.*?)? heuristic catastrophic patterns", () => {
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: "(.*?)?" },
      },
      "anything",
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Validation configuration error");
  });

  it("rejects inputs longer than 10000 chars without compiling regex", () => {
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: "^a+$" },
      },
      "a".repeat(10_001),
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Input is too long to validate");
  });

  it("accepts a benign regex and matching input", () => {
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: "^[A-Z]{3}-\\d{4}$" },
      },
      "ABC-1234",
    );
    expect(result.isValid).toBe(true);
  });

  it("returns user-friendly error from rules.regexError when regex does not match", () => {
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: "^\\d+$", regexError: "Numbers only" },
      },
      "abc",
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Numbers only");
  });

  it("rejects malformed regex source as configuration error", () => {
    const result = validateFieldValue(
      {
        fieldType: "text",
        isRequired: true,
        validationRules: { regex: "[" },
      },
      "abc",
    );
    expect(result.isValid).toBe(false);
    expect(result.error).toBe("Validation configuration error");
  });
});
