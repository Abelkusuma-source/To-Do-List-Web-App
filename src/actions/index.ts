import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { todosTable } from "../db/schema";

export const server = {
  getTodos: defineAction({
    input: z.void(),
    handler: async () => {
      const todos = await db
        .select()
        .from(todosTable)
        .orderBy(todosTable.createdAt);
      return todos;
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
    handler: async (input) => {
      const now = Date.now();
      const todo = {
        id: crypto.randomUUID(),
        title: input.title.trim(),
        description: input.description || "",
        done: false,
        status: input.status,
        priority: input.priority,
        deadline: input.deadline || null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(todosTable).values(todo);
      return todo;
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
    }),
    handler: async (input) => {
      const { id, ...updates } = input;
      const updateData = {
        ...updates,
        updatedAt: Date.now(),
      };
      await db
        .update(todosTable)
        .set(updateData)
        .where(eq(todosTable.id, id));
      const [todo] = await db
        .select()
        .from(todosTable)
        .where(eq(todosTable.id, id));
      return todo ?? null;
    },
  }),

  deleteTodo: defineAction({
    input: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      await db.delete(todosTable).where(eq(todosTable.id, id));
      return { success: true };
    },
  }),

  clearCompleted: defineAction({
    input: z.void(),
    handler: async () => {
      await db
        .delete(todosTable)
        .where(eq(todosTable.done, true));
      return { success: true };
    },
  }),
};
