import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { user } from "./schema";

/**
 * Blog posts table — stores all blog content.
 * Managed via the admin interface and served publicly at /blog.
 */
export const blogPostsTable = sqliteTable("blog_posts", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content").notNull(),
  excerpt: text("excerpt"),
  coverImage: text("cover_image"),
  tags: text("tags"), // JSON array of tag strings
  published: integer("published", { mode: "boolean" }).default(false).notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  publishedAt: integer("published_at"),
});

export type BlogPost = typeof blogPostsTable.$inferSelect;
export type NewBlogPost = typeof blogPostsTable.$inferInsert;
