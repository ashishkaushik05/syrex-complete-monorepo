import { describe, expect, it } from "bun:test";
import { createApp } from "./app";

describe("API origin boundary", () => {
  it("allows a configured browser origin and returns CORS credentials headers", async () => {
    const app = createApp({ corsOrigins: ["https://admin.example.test"] });
    const response = await app.request("http://api.example.test/health", {
      headers: { origin: "https://admin.example.test" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://admin.example.test");
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("rejects requests carrying an origin outside the configured allowlist", async () => {
    const app = createApp({ corsOrigins: ["https://admin.example.test"] });
    const response = await app.request("http://api.example.test/health", {
      headers: { origin: "https://attacker.example.test" },
    });

    expect(response.status).toBe(403);
  });
});

describe("API transport hardening", () => {
  it("sets API security headers and enables HSTS only for production", async () => {
    const app = createApp({ isProduction: true });
    const response = await app.request("http://api.example.test/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
  });

  it("rejects an oversized declared tRPC body before authentication or route execution", async () => {
    const app = createApp({ maxRequestBodyBytes: 100 });
    const response = await app.request("http://api.example.test/trpc/auth.login", {
      method: "POST",
      headers: { "content-length": "101" },
    });

    expect(response.status).toBe(413);
  });
});
