import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

type ObjectStorageConfig = {
  bucket: string;
  client: S3Client;
};

let cached: ObjectStorageConfig | null = null;
type ObjectStorageTestAdapter = {
  createUploadUrl?: (input: UploadUrlInput) => Promise<string>;
  verifyUploadedObject?: (input: VerifyObjectInput) => Promise<boolean>;
  createDownloadUrl?: (storageKey: string, expiresInSeconds?: number) => Promise<string>;
  deleteStoredObject?: (storageKey: string) => Promise<void>;
};
let testAdapter: ObjectStorageTestAdapter | null = null;

type UploadUrlInput = {
  storageKey: string;
  mimeType: string;
  fileSize: number;
  expiresInSeconds: number;
};

type VerifyObjectInput = {
  storageKey: string;
  mimeType: string;
  fileSize: number;
};

function getConfig(): ObjectStorageConfig {
  if (cached) return cached;

  const endpoint = env.OBJECT_STORAGE_ENDPOINT;
  const bucket = env.OBJECT_STORAGE_BUCKET;
  const accessKeyId = env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("Object storage is not configured");
  }

  cached = {
    bucket,
    client: new S3Client({
      endpoint,
      region: env.OBJECT_STORAGE_REGION,
      forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
  return cached;
}

export async function createUploadUrl(input: UploadUrlInput): Promise<string> {
  if (testAdapter?.createUploadUrl) return testAdapter.createUploadUrl(input);
  const { bucket, client } = getConfig();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.storageKey,
      ContentType: input.mimeType,
      ContentLength: input.fileSize,
    }),
    { expiresIn: input.expiresInSeconds },
  );
}

export async function verifyUploadedObject(input: VerifyObjectInput): Promise<boolean> {
  if (testAdapter?.verifyUploadedObject) return testAdapter.verifyUploadedObject(input);
  const { bucket, client } = getConfig();
  const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: input.storageKey }));
  return object.ContentLength === input.fileSize && object.ContentType === input.mimeType;
}

export async function createDownloadUrl(
  storageKey: string,
  expiresInSeconds = 300,
): Promise<string> {
  if (testAdapter?.createDownloadUrl) {
    return testAdapter.createDownloadUrl(storageKey, expiresInSeconds);
  }
  const { bucket, client } = getConfig();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deleteStoredObject(storageKey: string): Promise<void> {
  if (testAdapter?.deleteStoredObject) return testAdapter.deleteStoredObject(storageKey);
  const { bucket, client } = getConfig();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
}

export function __resetObjectStorageForTests() {
  cached = null;
  testAdapter = null;
}

export function __setObjectStorageAdapterForTests(adapter: ObjectStorageTestAdapter) {
  testAdapter = adapter;
}
