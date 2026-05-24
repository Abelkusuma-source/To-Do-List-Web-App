import { db } from "../db";
import { storageUsageTable } from "../db/schema";
import { eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StorageQuota {
  totalBytes: number;
  fileCount: number;
  quotaBytes: number;
  usagePercent: number;
}

// ─── Quota Management ────────────────────────────────────────────────────────

/**
 * Get the current storage usage for a user.
 * Creates a usage record if one doesn't exist yet.
 */
export async function getStorageQuota(userId: string): Promise<StorageQuota> {
  let usage = await db
    .select()
    .from(storageUsageTable)
    .where(eq(storageUsageTable.userId, userId))
    .then((rows) => rows[0] ?? null);

  if (!usage) {
    const now = Date.now();
    usage = {
      id: crypto.randomUUID(),
      userId,
      totalBytes: 0,
      fileCount: 0,
      quotaBytes: 100 * 1024 * 1024, // 100MB default
      updatedAt: now,
    };
    await db.insert(storageUsageTable).values(usage);
  }

  return {
    totalBytes: usage.totalBytes,
    fileCount: usage.fileCount,
    quotaBytes: usage.quotaBytes,
    usagePercent: usage.quotaBytes > 0
      ? Math.round((usage.totalBytes / usage.quotaBytes) * 100)
      : 0,
  };
}

/**
 * Add bytes to a user's storage usage (after a successful upload).
 */
export async function addStorageUsage(
  userId: string,
  bytes: number,
  isNewFile: boolean = true,
): Promise<void> {
  const now = Date.now();
  const existing = await db
    .select()
    .from(storageUsageTable)
    .where(eq(storageUsageTable.userId, userId))
    .then((rows) => rows[0] ?? null);

  if (existing) {
    await db
      .update(storageUsageTable)
      .set({
        totalBytes: existing.totalBytes + bytes,
        fileCount: existing.fileCount + (isNewFile ? 1 : 0),
        updatedAt: now,
      })
      .where(eq(storageUsageTable.userId, userId));
  } else {
    await db.insert(storageUsageTable).values({
      id: crypto.randomUUID(),
      userId,
      totalBytes: bytes,
      fileCount: isNewFile ? 1 : 0,
      quotaBytes: 100 * 1024 * 1024,
      updatedAt: now,
    });
  }
}

/**
 * Subtract bytes from a user's storage usage (after a deletion).
 */
export async function removeStorageUsage(
  userId: string,
  bytes: number,
  removedFile: boolean = true,
): Promise<void> {
  const existing = await db
    .select()
    .from(storageUsageTable)
    .where(eq(storageUsageTable.userId, userId))
    .then((rows) => rows[0] ?? null);

  if (existing) {
    await db
      .update(storageUsageTable)
      .set({
        totalBytes: Math.max(0, existing.totalBytes - bytes),
        fileCount: Math.max(0, existing.fileCount - (removedFile ? 1 : 0)),
        updatedAt: Date.now(),
      })
      .where(eq(storageUsageTable.userId, userId));
  }
}

/**
 * Check if a user has enough quota for an upload.
 * Throws if the upload would exceed the quota.
 */
export async function checkQuota(
  userId: string,
  requiredBytes: number,
): Promise<void> {
  const quota = await getStorageQuota(userId);

  if (quota.totalBytes + requiredBytes > quota.quotaBytes) {
    const usedMB = Math.round(quota.totalBytes / (1024 * 1024));
    const quotaMB = Math.round(quota.quotaBytes / (1024 * 1024));
    throw new Error(
      `Penyimpanan hampir penuh (${usedMB}MB / ${quotaMB}MB). Hapus beberapa file sebelum mengunggah.`,
    );
  }

  // Also check per-file limit (no single file > 50% of quota)
  if (requiredBytes > quota.quotaBytes * 0.5) {
    const maxMB = Math.round((quota.quotaBytes * 0.5) / (1024 * 1024));
    throw new Error(
      `Ukuran file terlalu besar. Maksimum per file: ${maxMB}MB.`,
    );
  }
}
