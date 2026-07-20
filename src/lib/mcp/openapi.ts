import { zodToJsonSchema } from "zod-to-json-schema";

import { TOOLS } from "./tools";

// Build an OpenAPI 3.1 document describing the agent tools as POST operations.
// This is the format Open WebUI (and other OpenAPI tool-server clients) consume:
// each operationId becomes a callable tool and the requestBody schema its args.
export function buildOpenApiSpec(baseUrl: string) {
  const paths: Record<string, unknown> = {};

  for (const t of TOOLS) {
    const schema = zodToJsonSchema(t.input, {
      target: "openApi3",
      $refStrategy: "none",
    }) as Record<string, unknown>;
    delete schema.$schema;

    paths[`/tools/${t.name}`] = {
      post: {
        operationId: t.name,
        summary: t.title,
        description:
          t.description +
          (t.scope === "write"
            ? " Requires a write-scoped API key."
            : ""),
        requestBody: {
          required: true,
          content: { "application/json": { schema } },
        },
        responses: {
          "200": {
            description: "Success",
            content: { "application/json": { schema: { type: "object" } } },
          },
        },
        security: [{ bearerAuth: [] }],
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "FluidCalendar",
      description:
        "Read the user's calendar events, tasks, and archive stats, and create tasks and calendar events.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "A FluidCalendar API key (fc_...).",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths,
  };
}
