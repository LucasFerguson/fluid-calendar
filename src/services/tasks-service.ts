import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { TaskStatus } from "@/types/task";

const LOG_SOURCE = "TasksService";

// Canonical read/write path for tasks used by the agent/MCP tools. All task DB
// access for the agent surface goes through here (not scattered prisma calls),
// and results are returned as plain serializable DTOs.

export interface TaskDTO {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  energyLevel: string | null;
  dueDate: string | null;
  duration: number | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  isAutoScheduled: boolean;
  projectId: string | null;
  tags: { id: string; name: string; color: string | null }[];
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  energyLevel: string | null;
  dueDate: Date | null;
  duration: number | null;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  isAutoScheduled: boolean;
  projectId: string | null;
  tags: { id: string; name: string; color: string | null }[];
};

function toDTO(task: TaskRow): TaskDTO {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    energyLevel: task.energyLevel,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    duration: task.duration,
    scheduledStart: task.scheduledStart
      ? task.scheduledStart.toISOString()
      : null,
    scheduledEnd: task.scheduledEnd ? task.scheduledEnd.toISOString() : null,
    isAutoScheduled: task.isAutoScheduled,
    projectId: task.projectId,
    tags: task.tags,
  };
}

const SELECT = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  energyLevel: true,
  dueDate: true,
  duration: true,
  scheduledStart: true,
  scheduledEnd: true,
  isAutoScheduled: true,
  projectId: true,
  tags: { select: { id: true, name: true, color: true } },
} as const;

export interface ListTasksParams {
  userId: string;
  status?: string[];
  search?: string;
  limit?: number;
}

export async function listTasks(params: ListTasksParams): Promise<TaskDTO[]> {
  const { userId, status, search, limit = 100 } = params;
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      ...(status && status.length > 0 ? { status: { in: status } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { description: { contains: search } },
            ],
          }
        : {}),
    },
    select: SELECT,
    orderBy: [{ scheduledStart: "asc" }, { dueDate: "asc" }],
    take: Math.min(Math.max(limit, 1), 500),
  });
  return tasks.map(toDTO);
}

export interface CreateTaskParams {
  userId: string;
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  energyLevel?: string;
  dueDate?: string;
  duration?: number;
  projectId?: string;
}

export async function createTask(params: CreateTaskParams): Promise<TaskDTO> {
  const { userId, title } = params;

  const task = await prisma.task.create({
    data: {
      userId,
      title,
      description: params.description,
      status: params.status ?? TaskStatus.TODO,
      priority: params.priority,
      energyLevel: params.energyLevel,
      dueDate: params.dueDate ? newDate(params.dueDate) : undefined,
      duration: params.duration,
      projectId: params.projectId,
      isRecurring: false,
    },
    select: SELECT,
  });

  logger.info(
    "Agent created a task",
    { userId, taskId: task.id },
    LOG_SOURCE
  );

  return toDTO(task);
}
