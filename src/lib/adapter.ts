import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import type { Db } from "./db";

/**
 * Creates a BetterAuth database adapter that avoids `.returning()` queries.
 *
 * ## Why this exists
 *
 * On Cloudflare Workers, the `@libsql/client/web` hrana protocol can encounter
 * HTTP 404 errors when executing `INSERT … RETURNING`, `UPDATE … RETURNING`,
 * or `DELETE … RETURNING` against Turso. The root cause is a protocol-level
 * serialisation issue in the Edge runtime — the SQL is valid and runs fine
 * locally, but fails in production Workers.
 *
 * ## What this does
 *
 * Instead of relying on `.returning()`, this adapter uses a **two-step**
 * insert/update/delete-then-select pattern that avoids `RETURNING` entirely.
 * This is the same approach the BetterAuth drizzle adapter already uses for
 * MySQL — we simply extend it to SQLite on Workers.
 *
 * ## Affected operations
 *
 * - `create`   → `db.insert().values(data).execute()` + `db.select().where()` by id
 * - `update`   → `original.findOne()` + `db.update().set().where()` without returning
 * - `consumeOne` → `original.findOne()` + `db.delete().where()` without returning
 * - `updateMany`, `delete`, `deleteMany`, `findOne`, `findMany`, `count` → unchanged
 */
export function createAdapter(
  _db: Db,
  config: Parameters<typeof drizzleAdapter>[1],
) {
  // Get the original adapter factory from BetterAuth.
  // This returns a function: (options) => Adapter
  const adapterFn = drizzleAdapter(_db, config);

  return (options: any) => {
    const original = adapterFn(options);

    return {
      // ── Passthrough: reads and bulk ops never use .returning() ─────────
      ...original,

      // ── create: insert + select instead of insert.returning() ────────
      create: async ({
        model,
        data,
      }: {
        model: string;
        data: Record<string, any>;
      }) => {
        const schemaModel = config.schema?.[model as keyof typeof config.schema];
        if (!schemaModel || !data.id) {
          return original.create({ model, data });
        }

        // Step 1: Insert WITHOUT .returning()
        await _db.insert(schemaModel).values(data).execute();

        // Step 2: Select the inserted record by its id
        const result = await _db
          .select()
          .from(schemaModel)
          .where(eq(schemaModel.id, data.id))
          .limit(1)
          .execute();

        return result[0] ?? null;
      },

      // ── update: select-then-update instead of update.returning() ──────
      update: async ({
        model,
        where,
        update: values,
      }: {
        model: string;
        where: any[];
        update: Record<string, any>;
      }) => {
        const schemaModel = config.schema?.[model as keyof typeof config.schema];
        if (!schemaModel) {
          return original.update({ model, where, update: values });
        }

        // Step 1: Find the record before updating — gives us the id
        const before = await original.findOne({ model, where });
        if (!before) return null;

        // Step 2: Update by the record's id (avoids needing to parse the
        // BetterAuth where clause format). This always works because every
        // BetterAuth table has an id column and BetterAuth never updates
        // without first finding the record.
        if (before.id && schemaModel.id) {
          await _db
            .update(schemaModel)
            .set(values)
            .where(eq(schemaModel.id, before.id))
            .execute();
        } else {
          // Last resort: update using first entry from where clause
          // (This path should never be hit in practice)
          const first = where?.[0];
          if (first && schemaModel[first.field]) {
            await _db
              .update(schemaModel)
              .set(values)
              .where(eq(schemaModel[first.field], first.value))
              .execute();
          }
        }

        // Return the merged result (before + applied updates)
        return { ...before, ...values };
      },

      // ── consumeOne: select-then-delete instead of delete.returning() ──
      consumeOne: async ({
        model,
        where,
      }: {
        model: string;
        where: any[];
      }) => {
        const schemaModel = config.schema?.[model as keyof typeof config.schema];
        if (!schemaModel) {
          return original.consumeOne({ model, where });
        }

        // Step 1: Find the record
        const target = await original.findOne({ model, where });
        if (!target) return null;

        // Step 2: Delete by the record's id (no RETURNING needed)
        if (target.id && schemaModel.id) {
          await _db
            .delete(schemaModel)
            .where(eq(schemaModel.id, target.id))
            .execute();
        }

        return target;
      },
    };
  };
}
