import fs from "node:fs";
import type { APIRoute } from "astro";
import { storage, getDownloadUrl, getFileStream, getContentDisposition } from "../../../lib/storage";
import { auth } from "../../../lib/auth";
import { db } from "../../../db";
import { taskAttachmentsTable, todosTable } from "../../../db/schema";
import { eq, and } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RangeInfo {
  start: number;
  end: number;
}

// ─── Range Request Parsing ───────────────────────────────────────────────────

function parseRange(rangeHeader: string, fileSize: number): RangeInfo | null {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) return null;

  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  if (start >= fileSize || start < 0) return null;
  return { start, end: Math.min(end, fileSize - 1) };
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const GET: APIRoute = async ({ params, request }) => {
  const path = params.path;

  if (!path || Array.isArray(path)) {
    return new Response("Not Found", { status: 404 });
  }

  // ── Determine file type from path ──────────────────────────────────────
  // Sanitize path segments to prevent traversal attacks
  const segments = path.split("/").filter((s) => s !== ".." && s !== "." && s !== "");
  if (segments.length < 2) {
    return new Response("Not Found", { status: 404 });
  }
  const directory = segments[0]; // "thumbnails" or "attachments"
  const fileKey = segments.slice(0, 2).join("/"); // "thumbnails/uuid.ext" or "attachments/uuid.ext"

  // ── Check if this is an attachment (needs auth) ─────────────────────────
  if (directory === "attachments") {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return new Response("Unauthorized", { status: 401 });
    }    // Verify the user owns this attachment via task ownership
      const [attachment] = await db
        .select({ taskId: taskAttachmentsTable.taskId })
        .from(taskAttachmentsTable)
        .where(eq(taskAttachmentsTable.fileUrl, `/uploads/${fileKey}`));

      if (attachment) {
        const [todo] = await db
          .select({ id: todosTable.id })
          .from(todosTable)
          .where(and(eq(todosTable.id, attachment.taskId), eq(todosTable.userId, session.user.id)));

        if (!todo) {
          return new Response("Forbidden", { status: 403 });
        }
      }
  }

  // ── Get storage config for serving ──────────────────────────────────────
  const config = storage.getConfig();

  if (config.mode === "r2") {
    // R2 mode: Redirect to presigned URL for direct download
    // Extract original filename from the fileKey if possible, or use a default
    const fileName = fileKey.split("/").pop() ?? "file";
    const mimeType = getMimeTypeFromExt(fileKey);

    try {
      const presignedUrl = await getDownloadUrl(fileKey, fileName, mimeType, directory, 3600);
      return Response.redirect(presignedUrl, 302);
    } catch (err) {
      console.error("Failed to generate presigned URL:", err);
      return new Response("Not Found", { status: 404 });
    }
  }

  // ── Local mode: Stream the file with Range support ──────────────────────
  const fileStream = await getFileStream(fileKey);
  if (!fileStream) {
    return new Response("Not Found", { status: 404 });
  }

  const { stream: readStream, size: fileSize } = fileStream;
  const mimeType = getMimeTypeFromExt(fileKey);
  const fileName = fileKey.split("/").pop() ?? "file";
  const disposition = getContentDisposition(directory, fileName);

  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, fileSize);
    if (range) {
      const { start, end } = range;
      const chunkSize = end - start + 1;

      const partialStream = fs.createReadStream(fileKey, { start, end });

      return new Response(partialStream as any, {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Content-Length": String(chunkSize),
          "Content-Disposition": disposition,
          "Cache-Control": directory === "thumbnails"
            ? "public, max-age=31536000, immutable"
            : "private, max-age=3600",
          "Accept-Ranges": "bytes",
        },
      });
    }
  }

  // Full file response
  return new Response(readStream as any, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileSize),
      "Content-Disposition": disposition,
      "Cache-Control": directory === "thumbnails"
        ? "public, max-age=31536000, immutable"
        : "private, max-age=3600",
      "Accept-Ranges": "bytes",
    },
  });
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMimeTypeFromExt(fileKey: string): string {
  const ext = fileKey.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    zip: "application/zip",
    txt: "text/plain",
  };
  return mimeMap[ext] ?? "application/octet-stream";
}
