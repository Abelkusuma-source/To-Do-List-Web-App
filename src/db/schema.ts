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
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
