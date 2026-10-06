import { Hono } from "hono";
import { cors } from "hono/cors";
import { MEETING_TYPES } from "@ma/shared";
import { db } from "./db";
import { users } from "./db/schema";
import { authRoutes } from "./routes/auth";
import { recordingRoutes } from "./routes/recordings";
import { recoverStuckJobs } from "./jobs/process";

// If the server died mid-job last time, mark those recordings as failed.
await recoverStuckJobs();

const app = new Hono();

app.use("*", cors({ origin: "http://localhost:5173" }));

app.get("/health", async (c) => {
  const userCount = await db.$count(users);
  return c.json({
    ok: true,
    meetingTypes: [...MEETING_TYPES], // spread makes a plain string[] copy
    userCount,
  });
});

app.route("/auth", authRoutes);
app.route("/recordings", recordingRoutes);

export default {
  port: 3000,
  fetch: app.fetch,
  maxRequestBodySize: 110 * 1024 * 1024,
};