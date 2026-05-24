import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── Better Auth Tables ──────────────────────────────────────────────────────
// These tables are required by BetterAuth for user authentication & session management.

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at"),
  refreshTokenExpiresAt: integer("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at"),
  updatedAt: integer("updated_at"),
});

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
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
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
  /** Original file extension (e.g. ".jpg", ".pdf") */
  fileExtension: text("file_extension"),
  /** Width in pixels (for images) */
  imageWidth: integer("image_width"),
  /** Height in pixels (for images) */
  imageHeight: integer("image_height"),
  /** Blur-up placeholder base64 (for images) */
  placeholderBlur: text("placeholder_blur"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ─── Storage Usage Table ─────────────────────────────────────────────────────

export const storageUsageTable = sqliteTable("storage_usage", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Total bytes used across all files */
  totalBytes: integer("total_bytes").notNull().default(0),
  /** Number of files stored */
  fileCount: integer("file_count").notNull().default(0),
  /** Max allowed bytes (soft limit) */
  quotaBytes: integer("quota_bytes").notNull().default(100 * 1024 * 1024), // 100MB default
  updatedAt: integer("updated_at").notNull(),
});
