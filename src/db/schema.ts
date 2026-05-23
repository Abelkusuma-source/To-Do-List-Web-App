import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Todos Table ─────────────────────────────────────────────────────────────

export const todosTable = sqliteTable("todos", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").default("").notNull(),
  done: integer("done", { mode: "boolean" }).default(false).notNull(),
  status: text("status", { enum: ["todo", "in_progress", "done"] })
    .default("todo")
    .notNull(),
  priority: text("priority", { enum: ["low", "medium", "high"] })
    .default("medium")
    .notNull(),
  deadline: text("deadline"),
  thumbnailUrl: text("thumbnail_url"),
  userId: text("user_id"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ─── Task Attachments Table ──────────────────────────────────────────────────

export const taskAttachmentsTable = sqliteTable("task_attachments", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => todosTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
