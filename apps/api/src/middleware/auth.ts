import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";
import { JWT_SECRET } from "../config";

// Tells Hono's types that after this middleware, c.get("userId") exists.
export type AuthEnv = { Variables: { userId: string } };

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verify(token, JWT_SECRET, "HS256");
    c.set("userId", payload.sub as string);
  } catch {
    // verify() throws if the signature is wrong or the token expired.
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  await next(); // token is fine, continue to the real route
});