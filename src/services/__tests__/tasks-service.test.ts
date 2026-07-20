jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { create: jest.fn(), findMany: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { prisma } from "@/lib/prisma";

import { createTask, listTasks } from "@/services/tasks-service";

const mockPrisma = prisma as unknown as {
  task: { create: jest.Mock; findMany: jest.Mock };
};

const baseRow = {
  id: "t1",
  title: "Write report",
  description: null,
  status: "todo",
  priority: null,
  energyLevel: null,
  dueDate: null,
  duration: null,
  scheduledStart: null,
  scheduledEnd: null,
  isAutoScheduled: false,
  projectId: null,
  tags: [],
};

describe("tasks-service.createTask", () => {
  beforeEach(() => {
    mockPrisma.task.create.mockReset();
    mockPrisma.task.findMany.mockReset();
  });

  it("defaults status to 'todo' and scopes to the user", async () => {
    mockPrisma.task.create.mockResolvedValue(baseRow);
    await createTask({ userId: "u1", title: "Write report" });

    const arg = mockPrisma.task.create.mock.calls[0][0];
    expect(arg.data.status).toBe("todo");
    expect(arg.data.userId).toBe("u1");
    expect(arg.data.title).toBe("Write report");
    expect(arg.data.isRecurring).toBe(false);
  });

  it("maps date fields to ISO strings in the DTO", async () => {
    mockPrisma.task.create.mockResolvedValue({
      ...baseRow,
      dueDate: new Date("2026-07-21T00:00:00.000Z"),
      scheduledStart: new Date("2026-07-21T14:00:00.000Z"),
    });
    const dto = await createTask({ userId: "u1", title: "x" });
    expect(dto.dueDate).toBe("2026-07-21T00:00:00.000Z");
    expect(dto.scheduledStart).toBe("2026-07-21T14:00:00.000Z");
    expect(dto.scheduledEnd).toBeNull();
  });
});

describe("tasks-service.listTasks", () => {
  beforeEach(() => mockPrisma.task.findMany.mockReset());

  it("applies a status filter and a bounded take", async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);
    await listTasks({ userId: "u1", status: ["todo"], limit: 9999 });

    const arg = mockPrisma.task.findMany.mock.calls[0][0];
    expect(arg.where.userId).toBe("u1");
    expect(arg.where.status).toEqual({ in: ["todo"] });
    expect(arg.take).toBe(500); // capped
  });
});
