import { getAuth } from "../../../lib/auth";
import type { APIRoute } from "astro";

export const GET: APIRoute = async (ctx) => {
  return getAuth().handler(ctx.request);
};

export const POST: APIRoute = async (ctx) => {
  return getAuth().handler(ctx.request);
};
