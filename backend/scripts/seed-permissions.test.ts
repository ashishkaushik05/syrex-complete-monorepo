import { describe, expect, it } from "bun:test";
import { OUTLET_PERMISSIONS } from "./seed-permissions";

describe("outlet seed permissions", () => {
  it("does not grant internal service or generic attachment authority", () => {
    expect(OUTLET_PERMISSIONS.filter((permission) => permission.startsWith("service:"))).toEqual([]);
    expect(OUTLET_PERMISSIONS.filter((permission) => permission.startsWith("attachments:"))).toEqual([]);
  });
});
