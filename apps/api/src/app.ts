import { Hono } from "hono";
import { cors } from "hono/cors";
import { diagramRoutes } from "./routes/diagrams.js";

export const app = new Hono();

app.use("/*", cors());

app.route("/api/diagrams", diagramRoutes);

app.get("/health", (c) => c.json({ status: "ok" }));
