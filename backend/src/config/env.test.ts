import { describe, expect, it } from "bun:test";
import { parseRuntimeEnvironment, resolveObjectStorageEnvironment } from "./env";

describe("object storage environment resolution", () => {
  it("maps the existing MinIO development variables to the canonical contract", () => {
    expect(resolveObjectStorageEnvironment({
      MINIO_ENDPOINT: "localhost",
      MINIO_PORT: "9002",
      MINIO_USE_SSL: "false",
      MINIO_BUCKET: "platform-attachments",
      MINIO_ACCESS_KEY: "platform",
      MINIO_SECRET_KEY: "platform123",
    })).toEqual({
      endpoint: "http://localhost:9002",
      region: undefined,
      bucket: "platform-attachments",
      accessKeyId: "platform",
      secretAccessKey: "platform123",
      forcePathStyle: "true",
    });
  });

  it("does not mix explicit object-storage settings with legacy MinIO values", () => {
    expect(resolveObjectStorageEnvironment({
      OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
      OBJECT_STORAGE_REGION: "ap-south-1",
      OBJECT_STORAGE_BUCKET: "attachments",
      OBJECT_STORAGE_ACCESS_KEY_ID: "explicit-key",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "explicit-secret",
      OBJECT_STORAGE_FORCE_PATH_STYLE: "false",
      MINIO_ENDPOINT: "localhost",
      MINIO_PORT: "9002",
      MINIO_BUCKET: "legacy-bucket",
      MINIO_ACCESS_KEY: "legacy-key",
      MINIO_SECRET_KEY: "legacy-secret",
    })).toEqual({
      endpoint: "https://storage.example.test",
      region: "ap-south-1",
      bucket: "attachments",
      accessKeyId: "explicit-key",
      secretAccessKey: "explicit-secret",
      forcePathStyle: "false",
    });
  });
});

describe("production environment contract", () => {
  const productionSource = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@db.example.test:5432/syrex",
    JWT_SECRET: "staff-secret-which-is-at-least-thirty-two-characters",
    SERVICE_PORTAL_JWT_SECRET: "portal-secret-which-is-at-least-thirty-two-characters",
    DEFAULT_ORG_ID: "org-production",
    CORS_ORIGINS: "https://admin.example.test, https://service.example.test",
    OBJECT_STORAGE_ENDPOINT: "https://storage.example.test",
    OBJECT_STORAGE_BUCKET: "attachments",
    OBJECT_STORAGE_ACCESS_KEY_ID: "key-id",
    OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
  };

  it("accepts a complete production configuration and normalizes origin lists", () => {
    expect(parseRuntimeEnvironment(productionSource)).toMatchObject({
      NODE_ENV: "production",
      CORS_ORIGINS: ["https://admin.example.test", "https://service.example.test"],
      MAX_REQUEST_BODY_BYTES: 1_048_576,
    });
  });

  it("rejects a production start when required launch configuration is missing", () => {
    expect(() => parseRuntimeEnvironment({
      ...productionSource,
      CORS_ORIGINS: "",
      OBJECT_STORAGE_SECRET_ACCESS_KEY: "",
    })).toThrow("CORS_ORIGINS, OBJECT_STORAGE_SECRET_ACCESS_KEY");
  });
});
