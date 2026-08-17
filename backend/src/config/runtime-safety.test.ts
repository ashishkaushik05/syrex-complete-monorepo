import { describe, expect, it } from "bun:test";
import { assertNonProductionCommand, assertTestOnlyCommand } from "./runtime-safety";

describe("destructive development command guard", () => {
  it("allows development and test commands", () => {
    expect(() => assertNonProductionCommand("demo-seed", { NODE_ENV: "development" })).not.toThrow();
    expect(() => assertNonProductionCommand("demo-seed", { NODE_ENV: "test" })).not.toThrow();
    expect(() => assertNonProductionCommand("demo-seed", {})).not.toThrow();
  });

  it("rejects production, including mixed casing and whitespace", () => {
    expect(() => assertNonProductionCommand("demo-seed", { NODE_ENV: "production" })).toThrow("[demo-seed] refuses to run");
    expect(() => assertNonProductionCommand("db:reset", { NODE_ENV: " Production " })).toThrow("[db:reset] refuses to run");
  });
});

describe("test fixture command guard", () => {
  it("allows only an explicit test environment", () => {
    expect(() => assertTestOnlyCommand("db:test:prepare", { NODE_ENV: "test" })).not.toThrow();
    expect(() => assertTestOnlyCommand("db:test:prepare", { NODE_ENV: "TEST" })).not.toThrow();
  });

  it("rejects missing, development, and production environments", () => {
    for (const NODE_ENV of [undefined, "development", "production"]) {
      expect(() => assertTestOnlyCommand("db:test:prepare", { NODE_ENV })).toThrow(
        "NODE_ENV must be test",
      );
    }
  });
});
