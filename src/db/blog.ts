import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { blogPostsTable } from "./blog-schema";

let _initialized = false;

/**
 * Ensures the blog_posts table exists in the database.
 * Called lazily on first blog request — no drizzle-kit needed.
 */
export async function ensureBlogTable(): Promise<void> {
  if (_initialized) return;

  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      excerpt TEXT,
      cover_image TEXT,
      tags TEXT,
      published INTEGER NOT NULL DEFAULT 0,
      author_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      published_at INTEGER
    )
  `);

  _initialized = true;
}

/**
 * Re-export the blog table for convenient access.
 */
export { blogPostsTable };
