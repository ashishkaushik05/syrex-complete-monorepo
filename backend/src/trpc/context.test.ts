import { describe, expect, it } from "bun:test";
import { readSourceIp } from "./context";

function requestContext(headers: Record<string, string>) {
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
  } as Parameters<typeof readSourceIp>[0];
}

describe("readSourceIp", () => {
  it("prefers nginx's overwritten real IP header", () => {
    expect(readSourceIp(requestContext({
      "x-real-ip": "203.0.113.10",
      "x-forwarded-for": "198.51.100.9, 203.0.113.10",
    }))).toBe("203.0.113.10");
  });

  it("uses the nearest proxy entry instead of a spoofable first forwarded value", () => {
    expect(readSourceIp(requestContext({
      "x-forwarded-for": "198.51.100.9, 203.0.113.10",
    }))).toBe("203.0.113.10");
  });

  it("falls back to an unknown bucket when no proxy address is available", () => {
    expect(readSourceIp(requestContext({}))).toBe("unknown");
  });
});
