import { z } from "zod";

type EnvironmentSource = Record<string, string | undefined>;

export type RuntimeEnvironment = {
  NODE_ENV: "development" | "test" | "production";
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET?: string;
  SERVICE_PORTAL_JWT_SECRET?: string;
  DEFAULT_ORG_ID?: string;
  CORS_ORIGINS: string[];
  MAX_REQUEST_BODY_BYTES: number;
  FIELD_LOCATION_RETENTION_DAYS: number;
  FIELD_LOCATION_RETENTION_DISABLED: boolean;
  OBJECT_STORAGE_ENDPOINT?: string;
  OBJECT_STORAGE_REGION: string;
  OBJECT_STORAGE_BUCKET?: string;
  OBJECT_STORAGE_ACCESS_KEY_ID?: string;
  OBJECT_STORAGE_SECRET_ACCESS_KEY?: string;
  OBJECT_STORAGE_FORCE_PATH_STYLE: boolean;
};

function nonEmpty(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function legacyMinioEndpoint(source: EnvironmentSource) {
  const rawEndpoint = nonEmpty(source.MINIO_ENDPOINT);
  if (!rawEndpoint) return undefined;

  const endpoint = new URL(
    /^https?:\/\//i.test(rawEndpoint)
      ? rawEndpoint
      : `${["true", "1", "yes", "on"].includes(
          (source.MINIO_USE_SSL ?? "").trim().toLowerCase(),
        ) ? "https" : "http"}://${rawEndpoint}`,
  );
  const port = nonEmpty(source.MINIO_PORT);
  if (port && !endpoint.port) endpoint.port = port;
  return endpoint.toString().replace(/\/$/, "");
}

export function resolveObjectStorageEnvironment(source: EnvironmentSource) {
  const explicitValues = [
    source.OBJECT_STORAGE_ENDPOINT,
    source.OBJECT_STORAGE_BUCKET,
    source.OBJECT_STORAGE_ACCESS_KEY_ID,
    source.OBJECT_STORAGE_SECRET_ACCESS_KEY,
  ];
  const useExplicitConfiguration = explicitValues.some((value) => nonEmpty(value));

  if (useExplicitConfiguration) {
    return {
      endpoint: nonEmpty(source.OBJECT_STORAGE_ENDPOINT),
      region: nonEmpty(source.OBJECT_STORAGE_REGION),
      bucket: nonEmpty(source.OBJECT_STORAGE_BUCKET),
      accessKeyId: nonEmpty(source.OBJECT_STORAGE_ACCESS_KEY_ID),
      secretAccessKey: nonEmpty(source.OBJECT_STORAGE_SECRET_ACCESS_KEY),
      forcePathStyle: nonEmpty(source.OBJECT_STORAGE_FORCE_PATH_STYLE),
    };
  }

  const endpoint = legacyMinioEndpoint(source);
  return {
    endpoint,
    region: nonEmpty(source.MINIO_REGION),
    bucket: nonEmpty(source.MINIO_BUCKET),
    accessKeyId: nonEmpty(source.MINIO_ACCESS_KEY),
    secretAccessKey: nonEmpty(source.MINIO_SECRET_KEY),
    forcePathStyle: endpoint ? "true" : undefined,
  };
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32).optional(),
  SERVICE_PORTAL_JWT_SECRET: z.string().min(32).optional(),
  DEFAULT_ORG_ID: z.string().min(1).optional(),
  CORS_ORIGINS: z.array(z.string().url()).default([]),
  MAX_REQUEST_BODY_BYTES: z.coerce.number().int().positive().default(1_048_576),
  FIELD_LOCATION_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  FIELD_LOCATION_RETENTION_DISABLED: z
    .preprocess((value) => {
      if (value == null || value === "") return undefined;
      return ["true", "1", "yes", "on"].includes(
        String(value).trim().toLowerCase()
      );
    }, z.boolean())
    .default(false),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_REGION: z.string().min(1).default("auto"),
  OBJECT_STORAGE_BUCKET: z.string().min(1).optional(),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1).optional(),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_FORCE_PATH_STYLE: z
    .preprocess((value) => {
      if (value == null || value === "") return undefined;
      return ["true", "1", "yes", "on"].includes(String(value).trim().toLowerCase());
    }, z.boolean())
    .default(false),
});

function parseCorsOrigins(value: string | undefined) {
  const normalized = nonEmpty(value);
  if (!normalized) return [];
  return normalized.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function parseRuntimeEnvironment(
  source: EnvironmentSource = Bun.env,
): RuntimeEnvironment {
  const objectStorageEnvironment = resolveObjectStorageEnvironment(source);
  const parsed = envSchema.parse({
    NODE_ENV: source.NODE_ENV,
    PORT: source.PORT,
    DATABASE_URL: source.DATABASE_URL,
    JWT_SECRET: source.JWT_SECRET,
    SERVICE_PORTAL_JWT_SECRET: source.SERVICE_PORTAL_JWT_SECRET,
    DEFAULT_ORG_ID: source.DEFAULT_ORG_ID,
    CORS_ORIGINS: parseCorsOrigins(source.CORS_ORIGINS),
    MAX_REQUEST_BODY_BYTES: source.MAX_REQUEST_BODY_BYTES,
    FIELD_LOCATION_RETENTION_DAYS: source.FIELD_LOCATION_RETENTION_DAYS,
    FIELD_LOCATION_RETENTION_DISABLED: source.FIELD_LOCATION_RETENTION_DISABLED,
    OBJECT_STORAGE_ENDPOINT: objectStorageEnvironment.endpoint,
    OBJECT_STORAGE_REGION: objectStorageEnvironment.region,
    OBJECT_STORAGE_BUCKET: objectStorageEnvironment.bucket,
    OBJECT_STORAGE_ACCESS_KEY_ID: objectStorageEnvironment.accessKeyId,
    OBJECT_STORAGE_SECRET_ACCESS_KEY: objectStorageEnvironment.secretAccessKey,
    OBJECT_STORAGE_FORCE_PATH_STYLE: objectStorageEnvironment.forcePathStyle,
  });

  if (parsed.NODE_ENV === "production") {
    const missing: string[] = [];
    if (!parsed.JWT_SECRET) missing.push("JWT_SECRET");
    if (!parsed.SERVICE_PORTAL_JWT_SECRET) missing.push("SERVICE_PORTAL_JWT_SECRET");
    if (!parsed.DEFAULT_ORG_ID) missing.push("DEFAULT_ORG_ID");
    if (!parsed.CORS_ORIGINS.length) missing.push("CORS_ORIGINS");
    if (!parsed.OBJECT_STORAGE_ENDPOINT) missing.push("OBJECT_STORAGE_ENDPOINT");
    if (!parsed.OBJECT_STORAGE_BUCKET) missing.push("OBJECT_STORAGE_BUCKET");
    if (!parsed.OBJECT_STORAGE_ACCESS_KEY_ID) missing.push("OBJECT_STORAGE_ACCESS_KEY_ID");
    if (!parsed.OBJECT_STORAGE_SECRET_ACCESS_KEY) missing.push("OBJECT_STORAGE_SECRET_ACCESS_KEY");
    if (missing.length) {
      throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
    }
  }

  return parsed;
}

export const env = parseRuntimeEnvironment();
