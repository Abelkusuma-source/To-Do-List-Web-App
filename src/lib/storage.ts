import path from "node:path";
import { AwsClient } from "aws4fetch";
import { getEnv } from "./env";

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
  const modeStr = getEnv("STORAGE_MODE");
  const mode = modeStr === "r2" ? "r2" : "local";

  return {
    mode,
    localPath: getEnv("LOCAL_STORAGE_PATH") || "./data/uploads",
    localBaseUrl: getEnv("LOCAL_STORAGE_BASE_URL") || "/api/uploads",
    r2Endpoint: getEnv("R2_ENDPOINT"),
    r2Region: getEnv("R2_REGION") || "auto",
    r2Bucket: getEnv("R2_BUCKET"),
    r2AccessKeyId: getEnv("R2_ACCESS_KEY_ID"),
    r2SecretAccessKey: getEnv("R2_SECRET_ACCESS_KEY"),
    r2PublicUrl: getEnv("R2_PUBLIC_URL"),
    publicDomain: getEnv("PUBLIC_DOMAIN") || getEnv("BETTER_AUTH_URL") || "",
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

let _aws: AwsClient | null = null;

function getAwsClient(): AwsClient {
  if (_aws) return _aws;
  const config = getConfig();
  _aws = new AwsClient({
    accessKeyId: config.r2AccessKeyId!,
    secretAccessKey: config.r2SecretAccessKey!,
    region: config.r2Region,
    service: "s3",
  });
  return _aws;
}

async function uploadR2(options: UploadOptions): Promise<StorageFile> {
  const aws = getAwsClient();
  const config = getConfig();

  const id = crypto.randomUUID();
  const ext = path.extname(options.fileName);
  const safeName = `${id}${ext}`;
  const key = `${options.directory}/${safeName}`;

  const url = `${config.r2Endpoint}/${config.r2Bucket}/${key}`;

  await aws.fetch(url, {
    method: "PUT",
    body: options.buffer,
    headers: {
      "Content-Type": options.mimeType,
      "Cache-Control": getCacheControl(options.directory, options.mimeType),
      "Content-Disposition": getContentDisposition(options.directory, options.fileName),
    },
  });

  return {
    id,
    name: options.fileName,
    mimeType: options.mimeType,
    size: options.buffer.byteLength,
    url: `${config.localBaseUrl}/${key}`,
    key,
  };
}

async function deleteR2(key: string): Promise<void> {
  const aws = getAwsClient();
  const config = getConfig();
  const url = `${config.r2Endpoint}/${config.r2Bucket}/${key}`;

  await aws.fetch(url, {
    method: "DELETE",
  });
}

// ─── Download URLs ───────────────────────────────────────────────────────────

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
    return `${config.localBaseUrl}/${key}`;
  }

  const aws = getAwsClient();
  const objectUrl = new URL(`${config.r2Endpoint}/${config.r2Bucket}/${key}`);
  objectUrl.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  objectUrl.searchParams.set("response-content-disposition", getContentDisposition(directory, fileName));
  objectUrl.searchParams.set("response-content-type", mimeType);

  const signed = await aws.sign(objectUrl.toString(), {
    method: "GET",
    signQuery: true,
  });

  return signed.url;
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
