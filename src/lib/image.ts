/**
 * Image processing module.
 *
 * Uses `sharp` for server-side image processing (resize, convert to WebP,
 * generate blur placeholders). On Cloudflare Workers where native binaries
 * are not available, we fall back gracefully — functions return null/empty
 * results and the caller (actions) relies on client-side compression instead.
 *
 * Client-side image compression is handled in app.ts via Canvas API,
 * which runs before the upload action is called.
 */

// ─── Lazy `sharp` Import ────────────────────────────────────────────────────
// sharp is a native binary that doesn't work on Cloudflare Workers.
// We lazily import it so this module can be loaded without crashing.

let _sharp: any = null;
let _sharpError: Error | null = null;

async function getSharp(): Promise<any> {
  if (_sharpError) return null;
  if (_sharp) return _sharp;

  try {
    const mod = await import("sharp");
    _sharp = mod.default || mod;
    return _sharp;
  } catch (err) {
    _sharpError = err instanceof Error ? err : new Error(String(err));
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      console.warn("[image] sharp not available, image processing disabled:", _sharpError.message);
    }
    return null;
  }
}

/** Check if sharp (and thus server-side image processing) is available */
export async function isSharpAvailable(): Promise<boolean> {
  const s = await getSharp();
  return s !== null;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export interface ImageOptions {
  /** Max width for thumbnail. Default: 800 */
  maxWidth: number;
  /** Max height for thumbnail. Default: 800 */
  maxHeight: number;
  /** JPEG/WebP quality (1-100). Default: 82 */
  quality: number;
  /** Format to convert to. Default: "webp" */
  format: "webp" | "jpeg" | "png" | "avif";
}

const DEFAULT_OPTIONS: ImageOptions = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 82,
  format: "webp",
};

// ─── Thumbnail Processing ────────────────────────────────────────────────────

export interface ProcessedImage {
  /** Optimized image buffer */
  buffer: Buffer;
  /** MIME type of the output */
  mimeType: string;
  /** File extension for the output */
  extension: string;
  /** Final dimensions */
  width: number;
  height: number;
  /** Size in bytes after optimization */
  size: number;
}

/**
 * Process an uploaded image for use as a thumbnail:
 * - Resize to fit within maxWidth x maxHeight (maintaining aspect ratio)
 * - Convert to WebP (or configured format)
 * - Compress with quality setting
 *
 * Returns null if sharp is not available (e.g., Cloudflare Workers).
 * In that case, rely on client-side compression (Canvas API in app.ts).
 */
export async function processThumbnail(
  input: Buffer | ArrayBuffer,
  options: Partial<ImageOptions> = {},
): Promise<ProcessedImage | null> {
  const sharp = await getSharp();
  if (!sharp) return null;

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const buffer = input instanceof ArrayBuffer ? Buffer.from(input) : input;

  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const resizeOpts: sharp.ResizeOptions = {
    fit: "inside",
    withoutEnlargement: true,
    ...(width > opts.maxWidth || height > opts.maxHeight
      ? { width: opts.maxWidth, height: opts.maxHeight }
      : {}),
  };

  const mimeType =
    opts.format === "webp" ? "image/webp" :
    opts.format === "avif" ? "image/avif" :
    opts.format === "jpeg" ? "image/jpeg" :
    "image/png";
  const extension = opts.format === "jpeg" ? "jpg" : opts.format;

  const processed = await sharp(buffer)
    .resize(resizeOpts)
    [opts.format]({ quality: opts.quality })
    .toBuffer();

  const processedMeta = await sharp(processed).metadata();

  return {
    buffer: processed,
    mimeType,
    extension,
    width: processedMeta.width ?? 0,
    height: processedMeta.height ?? 0,
    size: processed.length,
  };
}

// ─── Blur-up Placeholder ─────────────────────────────────────────────────────

export interface BlurPlaceholder {
  /** Base64-encoded tiny blurred image (10px wide) */
  base64: string;
  /** CSS background-size value */
  cssSize: string;
}

/**
 * Generate a tiny blur-up placeholder from an image buffer.
 * Creates a 10px-wide image encoded as a base64 data URI for use
 * as a low-quality image placeholder (LQIP).
 *
 * Returns null if sharp is not available.
 */
export async function generateBlurPlaceholder(
  input: Buffer | ArrayBuffer,
): Promise<BlurPlaceholder | null> {
  const sharp = await getSharp();
  if (!sharp) return null;

  const buffer = input instanceof ArrayBuffer ? Buffer.from(input) : input;

  const metadata = await sharp(buffer).metadata();
  const origWidth = metadata.width ?? 1;
  const origHeight = metadata.height ?? 1;

  const tinyBuffer = await sharp(buffer)
    .resize(10, null, { fit: "inside" })
    .blur(5)
    .webp({ quality: 30 })
    .toBuffer();

  const base64 = `data:image/webp;base64,${tinyBuffer.toString("base64")}`;

  return {
    base64,
    cssSize: `${origWidth}px ${origHeight}px`,
  };
}

// ─── File Type Detection ─────────────────────────────────────────────────────

/**
 * Validate that a buffer starts with known image magic bytes.
 * More reliable than trusting the Content-Type header alone.
 * This function has no sharp dependency, so it works everywhere.
 */
export function isValidImageBuffer(buffer: ArrayBuffer | Uint8Array): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // JPEG: FF D8 FF
  if (hex.startsWith("ffd8ff")) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (hex.startsWith("89504e470d0a1a0a")) return true;
  // WebP: 52 49 46 46 .... 57 45 42 50
  if (hex.slice(0, 4) === "52494646" && hex.slice(8, 16) === "57454250") return true;
  // GIF: 47 49 46 38
  if (hex.startsWith("47494638")) return true;
  // AVIF: 00 00 00 1C 66 74 79 70 61 76 69 66
  if (hex.includes("66747970") && (hex.includes("61766966") || hex.includes("61766973"))) return true;

  return false;
}
