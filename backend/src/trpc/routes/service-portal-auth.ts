const ACCESS_TOKEN_TTL_SECONDS = 900;
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 30;

type ServiceUserClaims = {
  sub: string;
  sid: string;
  type: "service_user";
  exp: number;
};

function getSecret() {
  const secret = process.env.SERVICE_PORTAL_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SERVICE_PORTAL_JWT_SECRET must be set, >=32 chars");
  }
  return secret;
}

function getHmacKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function randomBase64Url(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Buffer.from(buffer).toString("base64url");
}

export async function signServiceUserAccessToken(
  input: { serviceUserId: string; sessionId: string },
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const header = encodeJson({ alg: "HS256", typ: "JWT" });
  const body = encodeJson({
    sub: input.serviceUserId,
    sid: input.sessionId,
    type: "service_user",
    exp: nowSeconds + ACCESS_TOKEN_TTL_SECONDS,
  } satisfies ServiceUserClaims);
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getHmacKey(),
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

export async function verifyServiceUserAccessToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, bodyB64, signatureB64] = parts;
  const header = decodeJson<{ alg?: string; typ?: string }>(headerB64);
  const claims = decodeJson<Partial<ServiceUserClaims>>(bodyB64);
  if (
    !header ||
    header.alg !== "HS256" ||
    header.typ !== "JWT" ||
    !claims ||
    claims.type !== "service_user" ||
    typeof claims.sub !== "string" ||
    typeof claims.sid !== "string" ||
    typeof claims.exp !== "number"
  ) {
    return null;
  }

  const valid = await crypto.subtle.verify(
    "HMAC",
    await getHmacKey(),
    Buffer.from(signatureB64, "base64url"),
    new TextEncoder().encode(`${headerB64}.${bodyB64}`),
  );
  if (!valid || claims.exp <= nowSeconds) return null;
  return {
    serviceUserId: claims.sub,
    sessionId: claims.sid,
    exp: claims.exp,
  };
}

export function makeServiceUserRefreshToken(sessionId: string) {
  const secret = randomBase64Url(32);
  return { secret, refreshToken: `${sessionId}.${secret}` };
}

export function parseServiceUserRefreshToken(token: string) {
  const separator = token.indexOf(".");
  if (separator <= 0 || separator === token.length - 1) return null;
  const sessionId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!sessionId || !secret || secret.includes(".")) return null;
  return { sessionId, secret };
}

export function hashServiceUserRefreshSecret(secret: string) {
  return Bun.password.hash(secret, { algorithm: "bcrypt", cost: 12 });
}

export async function verifyServiceUserRefreshSecret(secret: string, hash: string) {
  try {
    return await Bun.password.verify(secret, hash);
  } catch {
    return false;
  }
}

export function serviceUserRefreshExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
}

export const SERVICE_USER_ACCESS_TOKEN_TTL_SECONDS = ACCESS_TOKEN_TTL_SECONDS;
