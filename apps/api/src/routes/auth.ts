import { Hono } from "hono";
import { sign } from "hono/jwt";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { LoginSchema, RegisterSchema, UpdateProfileSchema } from "@ma/shared";
import { db } from "../db";
import { users } from "../db/schema";
import { JWT_SECRET } from "../config";
import { requireAuth, type AuthEnv } from "../middleware/auth";

export const authRoutes = new Hono<AuthEnv>();

const WEEK = 60 * 60 * 24 * 7;

function makeToken(userId: string) {
  return sign(
    { sub: userId, exp: Math.floor(Date.now() / 1000) + WEEK },
    JWT_SECRET,
    "HS256",
  );
}

// Never send passwordHash to the client.
function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt };
}

authRoutes.post("/register", zValidator("json", RegisterSchema), async (c) => {
  const { name, email, password } = c.req.valid("json");

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return c.json({ error: "Email already registered" }, 409);

  // Bun.password uses argon2id by default: slow on purpose, salted automatically.
  const passwordHash = await Bun.password.hash(password);
  const [user] = await db.insert(users).values({ name, email, passwordHash }).returning();

  return c.json({ token: await makeToken(user.id), user: publicUser(user) }, 201);
});

authRoutes.post("/login", zValidator("json", LoginSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });
  const ok = user && (await Bun.password.verify(password, user.passwordHash));

  // Same message for "no such email" and "wrong password" so attackers
  // can't use this endpoint to discover which emails have accounts.
  if (!user || !ok) return c.json({ error: "Invalid email or password" }, 401);

  return c.json({ token: await makeToken(user.id), user: publicUser(user) });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = await db.query.users.findFirst({ where: eq(users.id, c.get("userId")) });
  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json({ user: publicUser(user) });
});

authRoutes.patch("/me", requireAuth, zValidator("json", UpdateProfileSchema), async (c) => {
  const { name } = c.req.valid("json");
  const [user] = await db
    .update(users)
    .set({ name })
    .where(eq(users.id, c.get("userId")))
    .returning();
  return c.json({ user: publicUser(user) });
});