import type { APIRoute } from "astro";
import fs from "node:fs";
import path from "node:path";

export const GET: APIRoute = async (ctx) => {
  const filePath = ctx.params.path;
  if (!filePath) {
    return new Response("Not found", { status: 404 });
  }

  // Prevent path traversal attacks
  const sanitizedPath = path.normalize(filePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(
    process.cwd(),
    "data",
    "uploads",
    sanitizedPath,
  );

  // Ensure the path is within the uploads directory
  const uploadsDir = path.resolve(process.cwd(), "data", "uploads");
  const resolvedPath = path.resolve(fullPath);
  if (!resolvedPath.startsWith(uploadsDir)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    if (!fs.existsSync(resolvedPath)) {
      return new Response("Not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".zip": "application/zip",
      ".txt": "text/plain",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Internal server error", { status: 500 });
  }
};
