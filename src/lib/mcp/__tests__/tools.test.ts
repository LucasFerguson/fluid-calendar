// Keep the registry import free of DB/Google side effects.
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/google-calendar", () => ({
  __esModule: true,
  default: jest.fn(),
  createGoogleEvent: jest.fn(),
}));
jest.mock("@/lib/calendar/google-event-write", () => ({
  writeGoogleEventToDatabase: jest.fn(),
}));

import { buildOpenApiSpec } from "@/lib/mcp/openapi";
import { TOOLS, getTool } from "@/lib/mcp/tools";

describe("agent tool registry (MCP-ready)", () => {
  it("every tool has a unique name, description, and valid scope", () => {
    const names = new Set<string>();
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      expect(names.has(t.name)).toBe(false);
      names.add(t.name);
      expect(t.description.length).toBeGreaterThan(10);
      expect(["read", "write"]).toContain(t.scope);
      // Input must be a zod schema exposing safeParse.
      expect(typeof t.input.safeParse).toBe("function");
    }
    expect(TOOLS.length).toBeGreaterThanOrEqual(6);
  });

  it("classifies read vs write tools correctly", () => {
    expect(getTool("list_calendar_events")?.scope).toBe("read");
    expect(getTool("get_stats")?.scope).toBe("read");
    expect(getTool("create_task")?.scope).toBe("write");
    expect(getTool("create_calendar_event")?.scope).toBe("write");
  });

  it("validates tool arguments through the zod input schema", () => {
    const createTask = getTool("create_task")!;
    expect(createTask.input.safeParse({}).success).toBe(false); // title required
    expect(createTask.input.safeParse({ title: "Buy milk" }).success).toBe(
      true
    );

    const listEvents = getTool("list_calendar_events")!;
    expect(listEvents.input.safeParse({}).success).toBe(false); // start/end required
    expect(
      listEvents.input.safeParse({
        start: "2026-07-01T00:00:00Z",
        end: "2026-07-08T00:00:00Z",
      }).success
    ).toBe(true);
  });
});

describe("OpenAPI spec generation", () => {
  const spec = buildOpenApiSpec("https://example.com/api/mcp") as {
    openapi: string;
    servers: { url: string }[];
    components: { securitySchemes: Record<string, unknown> };
    paths: Record<string, { post: { operationId: string; security: unknown } }>;
  };

  it("is OpenAPI 3.1 with a bearer security scheme and the given server url", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.servers[0].url).toBe("https://example.com/api/mcp");
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("exposes a POST operation for every tool with a matching operationId", () => {
    for (const t of TOOLS) {
      const path = spec.paths[`/tools/${t.name}`];
      expect(path).toBeDefined();
      expect(path.post.operationId).toBe(t.name);
      expect(path.post.security).toEqual([{ bearerAuth: [] }]);
    }
  });
});
