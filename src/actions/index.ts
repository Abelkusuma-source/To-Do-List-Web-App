import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, and } from "drizzle-orm";

import { db } from "../db";
import { todosTable, taskAttachmentsTable } from "../db/schema";
import { storage } from "../lib/storage";
import { auth } from "../lib/auth";
import type { Todo, TaskAttachment } from "../scripts/todo";
import type { ActionAPIContext } from "astro:actions";

// ─── Helper: Get authenticated user ─────────────────────────────────────────

async function requireAuth(context: ActionAPIContext): Promise<string> {
  const session = await auth.api.getSession({
    headers: context.request.headers,
  });
  if (!session?.user?.id) {
    throw new Error("Unauthorized: Silakan login terlebih dahulu.");
  }
  return session.user.id;
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
const ALLOWED_ATTACHMENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/zip",
  "text/plain",
  "image/png",
  "image/jpg",
  "image/jpeg",
];
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024; // 20MB

/** Extract storage key from a file URL regardless of storage backend */
function storageKeyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/uploads\//, "");
  } catch {
    return url.replace(/^\/uploads\//, "");
  }
}

// ─── Todo Actions ────────────────────────────────────────────────────────────

export const server = {
  getTodos: defineAction({
    input: z.void(),
    handler: async (_input, context) => {
      const userId = await requireAuth(context);
      const todos = await db
        .select()
        .from(todosTable)
        .where(eq(todosTable.userId, userId))
        .orderBy(todosTable.createdAt);
      return todos as Todo[];
    },
  }),

  addTodo: defineAction({
    input: z.object({
      title: z.string().min(1).max(500),
      description: z.string().max(2000).default(""),
      status: z.enum(["todo", "in_progress", "done"]).default("todo"),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      deadline: z.string().nullable().optional(),
    }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);
      const now = Date.now();
      const todo = {
        id: crypto.randomUUID(),
        title: input.title.trim(),
        description: input.description || "",
        done: false,
        status: input.status,
        priority: input.priority,
        deadline: input.deadline || null,
        thumbnailUrl: null as string | null,
        userId,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(todosTable).values(todo);
      return todo as Todo;
    },
  }),

  updateTodo: defineAction({
    input: z.object({
      id: z.string(),
      title: z.string().min(1).max(500).optional(),
      description: z.string().max(2000).optional(),
      done: z.boolean().optional(),
      status: z.enum(["todo", "in_progress", "done"]).optional(),
      priority: z.enum(["low", "medium", "high"]).optional(),
      deadline: z.string().nullable().optional(),
      thumbnailUrl: z.string().nullable().optional(),
    }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);
      const { id, ...updates } = input;

      // Only update if the todo belongs to this user
      await db
        .update(todosTable)
        .set({ ...updates, updatedAt: Date.now() })
        .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)));

      const [todo] = await db
        .select()
        .from(todosTable)
        .where(eq(todosTable.id, id));
      return (todo ?? null) as Todo | null;
    },
  }),

  deleteTodo: defineAction({
    input: z.object({ id: z.string() }),
    handler: async ({ id }, context) => {
      const userId = await requireAuth(context);

      // Get todo to verify ownership and clean up thumbnail
      const [todo] = await db
        .select()
        .from(todosTable)
        .where(and(eq(todosTable.id, id), eq(todosTable.userId, userId)));

      if (!todo) return { success: false };

      // Clean up thumbnail from storage
      if (todo.thumbnailUrl) {
        try {
          await storage.delete(storageKeyFromUrl(todo.thumbnailUrl));
        } catch {
          // ignore storage errors during cleanup
        }
      }

      // Clean up attachments from storage
      const attachments = await db
        .select()
        .from(taskAttachmentsTable)
        .where(eq(taskAttachmentsTable.taskId, id));

      for (const att of attachments) {
        try {
          await storage.delete(storageKeyFromUrl(att.fileUrl));
        } catch {
          // ignore storage errors during cleanup
        }
      }

      // Delete todo (cascade deletes attachments from DB)
      await db.delete(todosTable).where(eq(todosTable.id, id));
      return { success: true };
    },
  }),

  clearCompleted: defineAction({
    input: z.void(),
    handler: async (_input, context) => {
      const userId = await requireAuth(context);

      // Get completed todos for this user
      const completedTodos = await db
        .select()
        .from(todosTable)
        .where(and(eq(todosTable.done, true), eq(todosTable.userId, userId)));

      // Clean up thumbnails
      for (const todo of completedTodos) {
        if (todo.thumbnailUrl) {
          try {
            await storage.delete(storageKeyFromUrl(todo.thumbnailUrl));
          } catch {
            // ignore
          }
        }
      }

      // Clean up attachment files
      for (const todo of completedTodos) {
        const attachments = await db
          .select()
          .from(taskAttachmentsTable)
          .where(eq(taskAttachmentsTable.taskId, todo.id));
        for (const att of attachments) {
          try {
            await storage.delete(storageKeyFromUrl(att.fileUrl));
          } catch {
            // ignore
          }
        }
      }

      // Delete completed todos (cascade deletes attachments from DB)
      await db.delete(todosTable).where(and(eq(todosTable.done, true), eq(todosTable.userId, userId)));
      return { success: true };
    },
  }),

  // ─── Thumbnail Actions ─────────────────────────────────────────────────────

  uploadThumbnail: defineAction({
    accept: "form",
    input: z.object({
      taskId: z.string(),
      file: z.instanceof(File),
    }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);

      // Validate file type
      if (!ALLOWED_IMAGE_TYPES.includes(input.file.type)) {
        throw new Error(
          "Tipe file tidak didukung. Gunakan PNG, JPG, atau WebP."
        );
      }

      // Validate file size
      if (input.file.size > MAX_THUMBNAIL_SIZE) {
        throw new Error("Ukuran file maksimal 5MB.");
      }

      const buffer = await input.file.arrayBuffer();

      // Get existing thumbnail to delete it (verify ownership)
      const [todo] = await db
        .select()
        .from(todosTable)
        .where(and(eq(todosTable.id, input.taskId), eq(todosTable.userId, userId)));

      // Delete old thumbnail if exists
      if (todo?.thumbnailUrl) {
        try {
          await storage.delete(storageKeyFromUrl(todo.thumbnailUrl));
        } catch {
          // ignore
        }
      }

      // Upload new thumbnail
      const uploaded = await storage.upload({
        buffer,
        fileName: input.file.name,
        mimeType: input.file.type,
        directory: "thumbnails",
      });

      // Update todo with thumbnail URL
      await db
        .update(todosTable)
        .set({ thumbnailUrl: uploaded.url, updatedAt: Date.now() })
        .where(eq(todosTable.id, input.taskId));

      return { url: uploaded.url };
    },
  }),

  deleteThumbnail: defineAction({
    input: z.object({ taskId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);

      const [todo] = await db
        .select()
        .from(todosTable)
        .where(and(eq(todosTable.id, input.taskId), eq(todosTable.userId, userId)));

      if (todo?.thumbnailUrl) {
        try {
          await storage.delete(storageKeyFromUrl(todo.thumbnailUrl));
        } catch {
          // ignore
        }
      }

      await db
        .update(todosTable)
        .set({ thumbnailUrl: null, updatedAt: Date.now() })
        .where(eq(todosTable.id, input.taskId));

      return { success: true };
    },
  }),

  // ─── Attachment Actions ────────────────────────────────────────────────────

  uploadAttachment: defineAction({
    accept: "form",
    input: z.object({
      taskId: z.string(),
      file: z.instanceof(File),
    }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);

      // Verify todo ownership
      const [todo] = await db
        .select({ id: todosTable.id })
        .from(todosTable)
        .where(and(eq(todosTable.id, input.taskId), eq(todosTable.userId, userId)));

      if (!todo) {
        throw new Error("Tugas tidak ditemukan.");
      }

      // Validate file type
      if (!ALLOWED_ATTACHMENT_TYPES.includes(input.file.type)) {
        throw new Error(
          "Tipe file tidak didukung. Gunakan PDF, DOCX, ZIP, TXT, PNG, atau JPG."
        );
      }

      // Validate file size
      if (input.file.size > MAX_ATTACHMENT_SIZE) {
        throw new Error("Ukuran file maksimal 20MB.");
      }

      const buffer = await input.file.arrayBuffer();

      // Upload file
      const uploaded = await storage.upload({
        buffer,
        fileName: input.file.name,
        mimeType: input.file.type,
        directory: "attachments",
      });

      const now = Date.now();
      const attachment = {
        id: crypto.randomUUID(),
        taskId: input.taskId,
        fileName: input.file.name,
        fileUrl: uploaded.url,
        fileSize: input.file.size,
        mimeType: input.file.type,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(taskAttachmentsTable).values(attachment);

      return attachment as TaskAttachment;
    },
  }),

  getAttachments: defineAction({
    input: z.object({ taskId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);

      // Verify todo ownership
      const [todo] = await db
        .select({ id: todosTable.id })
        .from(todosTable)
        .where(and(eq(todosTable.id, input.taskId), eq(todosTable.userId, userId)));

      if (!todo) {
        throw new Error("Tugas tidak ditemukan.");
      }

      const attachments = await db
        .select()
        .from(taskAttachmentsTable)
        .where(eq(taskAttachmentsTable.taskId, input.taskId))
        .orderBy(taskAttachmentsTable.createdAt);

      return attachments as TaskAttachment[];
    },
  }),

  deleteAttachment: defineAction({
    input: z.object({ attachmentId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);

      const [attachment] = await db
        .select({
          id: taskAttachmentsTable.id,
          taskId: taskAttachmentsTable.taskId,
          fileUrl: taskAttachmentsTable.fileUrl,
        })
        .from(taskAttachmentsTable)
        .where(eq(taskAttachmentsTable.id, input.attachmentId));

      if (!attachment) {
        throw new Error("Lampiran tidak ditemukan.");
      }

      // Verify todo ownership
      const [todo] = await db
        .select({ id: todosTable.id })
        .from(todosTable)
        .where(and(eq(todosTable.id, attachment.taskId), eq(todosTable.userId, userId)));

      if (!todo) {
        throw new Error("Tugas tidak ditemukan.");
      }

      try {
        await storage.delete(storageKeyFromUrl(attachment.fileUrl));
      } catch {
        // ignore
      }

      await db
        .delete(taskAttachmentsTable)
        .where(eq(taskAttachmentsTable.id, input.attachmentId));

      return { success: true };
    },
  }),

  downloadAttachment: defineAction({
    input: z.object({ attachmentId: z.string() }),
    handler: async (input, context) => {
      const userId = await requireAuth(context);

      const [attachment] = await db
        .select()
        .from(taskAttachmentsTable)
        .where(eq(taskAttachmentsTable.id, input.attachmentId));

      if (!attachment) {
        throw new Error("Lampiran tidak ditemukan.");
      }

      // Verify todo ownership
      const [todo] = await db
        .select({ id: todosTable.id })
        .from(todosTable)
        .where(and(eq(todosTable.id, attachment.taskId), eq(todosTable.userId, userId)));

      if (!todo) {
        throw new Error("Tugas tidak ditemukan.");
      }

      return attachment as TaskAttachment;
    },
  }),
};
