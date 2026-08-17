import { beforeAll, describe, expect, it } from "bun:test";
import {
  hashServiceUserRefreshSecret,
  makeServiceUserRefreshToken,
  parseServiceUserRefreshToken,
  signServiceUserAccessToken,
  verifyServiceUserAccessToken,
  verifyServiceUserRefreshSecret,
  SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS,
} from "./service-portal-auth";

// The service-portal credential boundary (P1). These are the pure crypto primitives behind
// every service-user session: a forged or tampered access token must not verify, an expired
// one must be rejected, and refresh secrets must only match their own bcrypt hash. Tested as
// a self-contained unit — no prisma, just the HMAC + bcrypt contract.

beforeAll(() => {
  // getSecret() requires a >=32 char secret; set a deterministic one for the suite.
  process.env.SERVICE_PORTAL_JWT_SECRET = "test-secret-which-is-long-enough-32+chars";
});

const ID = { serviceUserId: "svc-user-1", sessionId: "sess-1" };

describe("service access token sign/verify", () => {
  it("round-trips a freshly signed token", async () => {
    const token = await signServiceUserAccessToken(ID);
    const claims = await verifyServiceUserAccessToken(token);
    expect(claims).not.toBeNull();
    expect(claims!.serviceUserId).toBe("svc-user-1");
    expect(claims!.sessionId).toBe("sess-1");
  });

  it("stamps the exp at now + TTL", async () => {
    const now = 1_000_000;
    const token = await signServiceUserAccessToken(ID, now);
    const claims = await verifyServiceUserAccessToken(token, now);
    expect(claims!.exp).toBe(now + SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS);
  });

  it("rejects an expired token", async () => {
    const issuedAt = 1_000_000;
    const token = await signServiceUserAccessToken(ID, issuedAt);
    // verify one second past expiry
    const claims = await verifyServiceUserAccessToken(token, issuedAt + SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS + 1);
    expect(claims).toBeNull();
  });

  it("rejects a token whose payload was tampered (signature mismatch)", async () => {
    const token = await signServiceUserAccessToken(ID);
    const [h, , s] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker", sid: "sess-1", type: "service_user", exp: 9_999_999_999 }),
    ).toString("base64url");
    const forged = `${h}.${forgedBody}.${s}`;
    expect(await verifyServiceUserAccessToken(forged)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signServiceUserAccessToken(ID);
    process.env.SERVICE_PORTAL_JWT_SECRET = "a-completely-different-secret-32+characters";
    const claims = await verifyServiceUserAccessToken(token);
    process.env.SERVICE_PORTAL_JWT_SECRET = "test-secret-which-is-long-enough-32+chars";
    expect(claims).toBeNull();
  });

  it.each([
    ["too few segments", "only.two"],
    ["empty string", ""],
    ["garbage", "not-a-token-at-all"],
  ])("rejects a malformed token: %s", async (_label, bad) => {
    expect(await verifyServiceUserAccessToken(bad)).toBeNull();
  });

  it("rejects a token whose claims.type is not service_user", async () => {
    // hand-build a token with a valid signature but the wrong type — must still fail.
    const token = await signServiceUserAccessToken(ID);
    const [h, b, s] = token.split(".");
    const claims = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
    claims.type = "internal_user";
    const swapped = Buffer.from(JSON.stringify(claims)).toString("base64url");
    // signature no longer matches the swapped body → null (the type check + sig check both guard)
    expect(await verifyServiceUserAccessToken(`${h}.${swapped}.${s}`)).toBeNull();
  });
});

describe("service refresh token", () => {
  it("makes a sessionId.secret token and parses it back", () => {
    const { secret, refreshToken } = makeServiceUserRefreshToken("sess-42");
    const parsed = parseServiceUserRefreshToken(refreshToken);
    expect(parsed).not.toBeNull();
    expect(parsed!.sessionId).toBe("sess-42");
    expect(parsed!.secret).toBe(secret);
  });

  it.each([
    ["no separator", "nosessionsecret"],
    ["leading separator", ".secret"],
    ["trailing separator", "sess."],
    ["secret contains a separator", "sess.part.part"],
  ])("rejects a malformed refresh token: %s", (_label, bad) => {
    expect(parseServiceUserRefreshToken(bad)).toBeNull();
  });

  it("verifies a refresh secret against its own bcrypt hash", async () => {
    const { secret } = makeServiceUserRefreshToken("sess-9");
    const hash = await hashServiceUserRefreshSecret(secret);
    expect(await verifyServiceUserRefreshSecret(secret, hash)).toBe(true);
  });

  it("rejects a wrong refresh secret", async () => {
    const { secret } = makeServiceUserRefreshToken("sess-9");
    const hash = await hashServiceUserRefreshSecret(secret);
    expect(await verifyServiceUserRefreshSecret("not-the-secret", hash)).toBe(false);
  });

  it("returns false (not throw) on a malformed hash", async () => {
    expect(await verifyServiceUserRefreshSecret("x", "not-a-bcrypt-hash")).toBe(false);
  });
});
