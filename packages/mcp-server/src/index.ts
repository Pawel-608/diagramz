#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { CreateDiagramResponse } from "@diagramz/shared";

const API_URL = process.env.DIAGRAMZ_API_URL || "http://localhost:3001";

const server = new McpServer({
  name: "diagramz",
  version: "0.0.1",
});

server.tool(
  "create_diagram",
  "Create a new diagram and get a shareable link. Provide a title and elements (rectangles, ellipses, diamonds, arrows, lines, text).",
  {
    title: z.string().optional().describe("Diagram title"),
    elements: z
      .array(
        z.object({
          type: z.enum([
            "rectangle",
            "ellipse",
            "diamond",
            "arrow",
            "line",
            "text",
          ]),
          x: z.number().describe("X position"),
          y: z.number().describe("Y position"),
          width: z.number().describe("Width"),
          height: z.number().describe("Height"),
          label: z.string().optional().describe("Text label"),
          strokeColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          startBinding: z
            .string()
            .optional()
            .describe("Element ID this arrow starts from"),
          endBinding: z
            .string()
            .optional()
            .describe("Element ID this arrow points to"),
        })
      )
      .describe("Diagram elements to create"),
  },
  async ({ title, elements }) => {
    const res = await fetch(`${API_URL}/api/diagrams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, elements }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: "text", text: `Error: ${err}` }] };
    }

    const data: CreateDiagramResponse = await res.json();
    return {
      content: [
        {
          type: "text",
          text: `Diagram created!\n\nView: ${data.url}\nEdit: ${data.editUrl}\nAPI: ${API_URL}/api/diagrams/${data.id}`,
        },
      ],
    };
  }
);

server.tool(
  "get_diagram",
  "Retrieve an existing diagram by its ID.",
  {
    id: z.string().describe("Diagram UUID"),
  },
  async ({ id }) => {
    const res = await fetch(`${API_URL}/api/diagrams/${id}`);
    if (!res.ok) {
      return { content: [{ type: "text", text: "Diagram not found" }] };
    }
    const diagram = await res.json();
    return {
      content: [
        { type: "text", text: JSON.stringify(diagram, null, 2) },
      ],
    };
  }
);

server.tool(
  "update_diagram",
  "Update an existing diagram's title or elements.",
  {
    id: z.string().describe("Diagram UUID"),
    title: z.string().optional().describe("New title"),
    elements: z
      .array(
        z.object({
          type: z.enum([
            "rectangle",
            "ellipse",
            "diamond",
            "arrow",
            "line",
            "text",
          ]),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          label: z.string().optional(),
          strokeColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          startBinding: z.string().optional(),
          endBinding: z.string().optional(),
        })
      )
      .optional()
      .describe("Updated elements"),
  },
  async ({ id, title, elements }) => {
    const res = await fetch(`${API_URL}/api/diagrams/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, elements }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { content: [{ type: "text", text: `Error: ${err}` }] };
    }

    const diagram = await res.json();
    return {
      content: [
        { type: "text", text: `Diagram updated.\n\n${JSON.stringify(diagram, null, 2)}` },
      ],
    };
  }
);

server.tool(
  "delete_diagram",
  "Delete a diagram by its ID.",
  {
    id: z.string().describe("Diagram UUID"),
  },
  async ({ id }) => {
    const res = await fetch(`${API_URL}/api/diagrams/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      return { content: [{ type: "text", text: "Diagram not found" }] };
    }
    return { content: [{ type: "text", text: "Diagram deleted." }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
