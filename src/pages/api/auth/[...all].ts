import { auth } from "../../../lib/auth";
import type { APIRoute } from "astro";

export const GET: APIRoute = async (ctx) => {
  return auth.handler(ctx.request);
};

export const POST: APIRoute = async (ctx) => {
  return auth.handler(ctx.request);
};
