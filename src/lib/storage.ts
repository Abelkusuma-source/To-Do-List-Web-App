import fs from "node:fs";
import path from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StorageFile {
  /** Unique identifier for the file */
  id: string;
  /** Original file name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Public URL to access the file */
  url: string;
  /** Full path/key in storage */
  key: string;
}

export interface UploadOptions {
  /** The file buffer */
  buffer: ArrayBuffer;
  /** Original file name */
  fileName: string;
  /** MIME type */
  mimeType: string;
  /** Storage directory/prefix (e.g., "thumbnails", "attachments") */
  directory: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

interface StorageConfig {
  /** Storage mode: "local" for development, "r2" for production */
  mode: "local" | "r2";
  /** Local storage directory (used in local mode) */
  localPath: string;
  /** Base URL for local files (used in local mode) */
  localBaseUrl: string;
  /** R2 endpoint URL */
  r2Endpoint?: string;
  /** R2 region */
  r2Region?: string;
  /** R2 bucket name */
  r2Bucket?: string;
  /** R2 access key ID */
  r2AccessKeyId?: string;
  /** R2 secret access key */
  r2SecretAccessKey?: string;
  /** Public bucket URL for serving files directly */
  r2PublicUrl?: string;
}

function getConfig(): StorageConfig {
  const mode = (import.meta.env.STORAGE_MODE as string) === "r2" ? "r2" : "local";

  return {
    mode,
    localPath: import.meta.env.LOCAL_STORAGE_PATH || "./data/uploads",
    localBaseUrl: import.meta.env.LOCAL_STORAGE_BASE_URL || "/uploads",
    r2Endpoint: import.meta.env.R2_ENDPOINT,
    r2Region: import.meta.env.R2_REGION || "auto",
    r2Bucket: import.meta.env.R2_BUCKET,
    r2AccessKeyId: import.meta.env.R2_ACCESS_KEY_ID,
    r2SecretAccessKey: import.meta.env.R2_SECRET_ACCESS_KEY,
    r2PublicUrl: import.meta.env.R2_PUBLIC_URL,
  };
}

// ─── Local Filesystem Storage ────────────────────────────────────────────────

async function uploadLocal(options: UploadOptions): Promise<StorageFile> {
  const config = getConfig();
  const id = crypto.randomUUID();
  const ext = path.extname(options.fileName);
  const safeName = `${id}${ext}`;
  const relativePath = path.join(options.directory, safeName);
  const fullPath = path.join(config.localPath, relativePath);

  // Ensure directory exists
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });

  // Write file
  fs.writeFileSync(fullPath, Buffer.from(options.buffer));

  return {
    id,
    name: options.fileName,
    mimeType: options.mimeType,
    size: options.buffer.byteLength,
    url: `${config.localBaseUrl}/${relativePath}`,
    key: relativePath,
  };
}

async function deleteLocal(key: string): Promise<void> {
  const config = getConfig();
  const fullPath = path.join(config.localPath, key);
  try {
    fs.unlinkSync(fullPath);
  } catch {
    // File may not exist, ignore
  }
}

// ─── R2/S3-Compatible Storage ────────────────────────────────────────────────

let _s3Client: any = null;

async function getS3Client() {
  if (_s3Client) return _s3Client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  const config = getConfig();

  _s3Client = new S3Client({
    region: config.r2Region,
    endpoint: config.r2Endpoint,
    credentials: {
      accessKeyId: config.r2AccessKeyId!,
      secretAccessKey: config.r2SecretAccessKey!,
    },
    forcePathStyle: true,
  });

  return _s3Client;
}

async function uploadR2(options: UploadOptions): Promise<StorageFile> {
  const config = getConfig();
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();

  const id = crypto.randomUUID();
  const ext = path.extname(options.fileName);
  const safeName = `${id}${ext}`;
  const key = `${options.directory}/${safeName}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
      Body: Buffer.from(options.buffer),
      ContentType: options.mimeType,
    }),
  );

  const url = config.r2PublicUrl
    ? `${config.r2PublicUrl}/${key}`
    : `${config.r2Endpoint}/${config.r2Bucket}/${key}`;

  return {
    id,
    name: options.fileName,
    mimeType: options.mimeType,
    size: options.buffer.byteLength,
    url,
    key,
  };
}

async function deleteR2(key: string): Promise<void> {
  const config = getConfig();
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.r2Bucket,
      Key: key,
    }),
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const storage = {
  async upload(options: UploadOptions): Promise<StorageFile> {
    const config = getConfig();
    if (config.mode === "r2") {
      return uploadR2(options);
    }
    return uploadLocal(options);
  },

  async delete(key: string): Promise<void> {
    const config = getConfig();
    if (config.mode === "r2") {
      return deleteR2(key);
    }
    return deleteLocal(key);
  },

  getConfig,
};
