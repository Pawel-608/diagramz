import { Hono } from "hono";
import type {
  CreateDiagramRequest,
  CreateDiagramResponse,
  Diagram,
  UpdateDiagramRequest,
} from "@diagramz/shared";
import { DEFAULT_TTL_MS, MAX_ELEMENTS, MAX_TITLE_LENGTH } from "@diagramz/shared";
import { getDiagram, saveDiagram, deleteDiagram, touchDiagram } from "../store.js";

export const diagramRoutes = new Hono();

function generateId(): string {
  return crypto.randomUUID();
}

/** POST / — Create a new diagram */
diagramRoutes.post("/", async (c) => {
  const body = await c.req.json<CreateDiagramRequest>();

  if (body.title && body.title.length > MAX_TITLE_LENGTH) {
    return c.json({ error: "Title too long" }, 400);
  }
  if (body.elements && body.elements.length > MAX_ELEMENTS) {
    return c.json({ error: `Too many elements (max ${MAX_ELEMENTS})` }, 400);
  }

  const now = new Date().toISOString();
  const id = generateId();

  const diagram: Diagram = {
    id,
    title: body.title,
    elements: body.elements ?? [],
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + DEFAULT_TTL_MS).toISOString(),
  };

  saveDiagram(diagram);

  const baseUrl = process.env.BASE_URL || "http://localhost:3000";
  const response: CreateDiagramResponse = {
    id,
    url: `${baseUrl}/d/${id}`,
    editUrl: `${baseUrl}/d/${id}/edit`,
    diagram,
  };

  return c.json(response, 201);
});

/** GET /:id — Get diagram data */
diagramRoutes.get("/:id", (c) => {
  const diagram = getDiagram(c.req.param("id"));
  if (!diagram) {
    return c.json({ error: "Diagram not found" }, 404);
  }
  touchDiagram(diagram.id);
  return c.json(diagram);
});

/** PATCH /:id — Update diagram */
diagramRoutes.patch("/:id", async (c) => {
  const diagram = getDiagram(c.req.param("id"));
  if (!diagram) {
    return c.json({ error: "Diagram not found" }, 404);
  }

  const body = await c.req.json<UpdateDiagramRequest>();

  if (body.title !== undefined) {
    if (body.title.length > MAX_TITLE_LENGTH) {
      return c.json({ error: "Title too long" }, 400);
    }
    diagram.title = body.title;
  }

  if (body.elements !== undefined) {
    if (body.elements.length > MAX_ELEMENTS) {
      return c.json({ error: `Too many elements (max ${MAX_ELEMENTS})` }, 400);
    }
    diagram.elements = body.elements;
  }

  touchDiagram(diagram.id);
  saveDiagram(diagram);

  return c.json(diagram);
});

/** DELETE /:id — Delete diagram */
diagramRoutes.delete("/:id", (c) => {
  const deleted = deleteDiagram(c.req.param("id"));
  if (!deleted) {
    return c.json({ error: "Diagram not found" }, 404);
  }
  return c.json({ ok: true });
});
