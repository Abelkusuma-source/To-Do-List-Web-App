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
  /** Domain for presigned URLs */
  publicDomain?: string;
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
    publicDomain: import.meta.env.PUBLIC_DOMAIN || import.meta.env.BETTER_AUTH_URL,
  };
}

// ─── Lazy `fs` Import ────────────────────────────────────────────────────────
// Cloudflare Workers do not support node:fs. We dynamically import it so that
// the module can be loaded on edge runtimes without crashing. The fs module is
// only needed when running in "local" storage mode (development only).

let _fs: typeof import("node:fs") | null = null;

async function getFs(): Promise<typeof import("node:fs")> {
  if (!_fs) {
    _fs = await import("node:fs");
  }
  return _fs;
}

// ─── Local Filesystem Storage ────────────────────────────────────────────────

async function uploadLocal(options: UploadOptions): Promise<StorageFile> {
  const config = getConfig();
  const fs = await getFs();
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
  const fs = await getFs();
  const config = getConfig();
  const fullPath = path.join(config.localPath, key);
  try {
    fs.unlinkSync(fullPath);
  } catch {
    // File may not exist, ignore
  }
}

// ─── Cache & Content-Disposition Helpers ─────────────────────────────────────

/** Get appropriate Cache-Control header based on directory and file type */
function getCacheControl(directory: string, _mimeType: string): string {
  switch (directory) {
    case "thumbnails":
      // Thumbnails are content-addressable (random UUID names) → cache forever
      return "public, max-age=31536000, immutable";
    case "attachments":
      return "private, max-age=3600";
    default:
      return "public, max-age=86400";
  }
}

/** Get Content-Disposition header: force download for attachments, inline for thumbnails */
function getContentDisposition(directory: string, fileName: string): string {
  const encoded = encodeURIComponent(fileName);
  if (directory === "attachments") {
    return `attachment; filename*=UTF-8''${encoded}`;
  }
  return `inline; filename*=UTF-8''${encoded}`;
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
      CacheControl: getCacheControl(options.directory, options.mimeType),
      ContentDisposition: getContentDisposition(options.directory, options.fileName),
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

// ─── Presigned URLs ───────────────────────────────────────────────────────────

/**
 * Generate a presigned download URL that expires after the given time.
 * Presigned URLs allow direct client-to-R2 downloads without proxying
 * through the Astro server, reducing bandwidth costs and latency.
 *
 * For local mode, it returns the direct local URL (no expiration).
 */
export async function getDownloadUrl(
  key: string,
  fileName: string,
  mimeType: string,
  directory: string,
  expiresInSeconds: number = 3600,
): Promise<string> {
  const config = getConfig();

  if (config.mode !== "r2") {
    // Local mode: return direct URL (validated by session in download route)
    return `${config.localBaseUrl}/${key}`;
  }

  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const client = await getS3Client();

  const command = new GetObjectCommand({
    Bucket: config.r2Bucket,
    Key: key,
    ResponseContentDisposition: getContentDisposition(directory, fileName),
    ResponseContentType: mimeType,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Stream a file from storage to the response.
 * Used for local mode downloads with proper headers and Range support.
 * For R2 mode, prefer using presigned URLs instead.
 *
 * NOTE: This function uses node:fs and is only available in "local" mode.
 * In Cloudflare Workers (R2 mode), returns null.
 */
export async function getFileStream(key: string): Promise<{
  stream: import("stream").Readable;
  size: number;
} | null> {
  const config = getConfig();

  if (config.mode !== "local") {
    return null; // R2 mode uses presigned URLs
  }

  const fs = await getFs();
  const fullPath = path.join(config.localPath, key);
  try {
    await fs.promises.access(fullPath, fs.constants.R_OK);
    const stat = await fs.promises.stat(fullPath);
    const stream = fs.createReadStream(fullPath);
    return { stream, size: stat.size };
  } catch {
    return null;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export { getCacheControl, getContentDisposition };

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
