import { useState } from "react";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { HiCheck, HiPencil, HiTrash } from "react-icons/hi";
import {
  IoCalendarOutline,
  IoFlagOutline,
  IoFolderOutline,
  IoLocationOutline,
  IoLockClosedOutline,
  IoPeopleOutline,
  IoRepeat,
  IoTimeOutline,
} from "react-icons/io5";

import { format, isFutureDate, newDate } from "@/lib/date-utils";
import { isTaskOverdue } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { AttendeeStatus, CalendarEvent } from "@/types/calendar";
import { Priority, Task, TaskStatus } from "@/types/task";

interface Attendee {
  name?: string;
  email: string;
  status?: AttendeeStatus;
}

interface EventQuickViewProps {
  isOpen: boolean;
  onClose: () => void;
  item:
  | (CalendarEvent & {
    attendees?: Attendee[];
    extendedProps?: { isTask?: boolean };
  })
  | (Task & { project?: { name: string; color?: string | null } | null });
  onEdit: () => void;
  onDelete: (mode?: "single" | "series" | "thisAndFollowing") => void;
  isTask: boolean;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
  referenceElement: HTMLElement | null;
}

//TODO: move to utils
const priorityColors = {
  [Priority.HIGH]: "text-destructive dark:text-destructive",
  [Priority.MEDIUM]: "text-warning dark:text-warning",
  [Priority.LOW]: "text-primary dark:text-primary",
  [Priority.NONE]: "text-muted-foreground",
};

export function EventQuickView({
  isOpen,
  onClose,
  item,
  onEdit,
  onDelete,
  isTask,
  onStatusChange,
  referenceElement,
}: EventQuickViewProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const getStatusColor = (status: string | undefined) => {
    switch (status?.toUpperCase()) {
      case "ACCEPTED":
      case TaskStatus.COMPLETED:
        return "text-green-600 dark:text-green-400";
      case "TENTATIVE":
      case TaskStatus.IN_PROGRESS:
        return "text-warning dark:text-warning";
      case "DECLINED":
        return "text-destructive dark:text-destructive";
      default:
        return "text-muted-foreground";
    }
  };

  // Cast item to the appropriate type based on isTask
  const taskItem = isTask ? (item as Task) : null;
  const eventItem = !isTask
    ? (item as CalendarEvent & { attendees?: Attendee[] })
    : null;

  const isOverdue = taskItem && isTaskOverdue(taskItem);

  return (
    <Popover open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <PopoverTrigger asChild>
        <div
          className="w-0 h-0 opacity-0 pointer-events-none"
          style={{
            position: 'fixed',
            left: referenceElement ? referenceElement.getBoundingClientRect().left : 0,
            top: referenceElement ? referenceElement.getBoundingClientRect().top : 0,
          }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="z-[10000] w-80 rounded-lg border border-border bg-background p-4 shadow-lg"
        align="start"
        sideOffset={24}
        onOpenAutoFocus={(e) => e.preventDefault()}
        forceMount
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="event-title flex items-center gap-2 font-medium text-foreground">
              {item.title}
              {isTask ? (
                <>
                  {taskItem?.isRecurring && (
                    <IoRepeat
                      className="h-4 w-4 text-primary"
                      title="Recurring task"
                    />
                  )}
                  {taskItem?.scheduleLocked && (
                    <IoLockClosedOutline
                      className="h-4 w-4 text-warning"
                      title="Schedule locked"
                    />
                  )}
                </>
              ) : (
                eventItem?.isRecurring && (
                  <IoRepeat
                    className="h-4 w-4 text-primary"
                    title="Recurring event"
                  />
                )
              )}
            </h3>
            <div className="flex items-center gap-1">
              {isTask && taskItem && onStatusChange && (
                <button
                  onClick={() =>
                    onStatusChange(
                      taskItem.id,
                      taskItem.status === TaskStatus.COMPLETED
                        ? TaskStatus.TODO
                        : TaskStatus.COMPLETED
                    )
                  }
                  className={cn(
                    "rounded-md p-1.5",
                    taskItem.status === TaskStatus.COMPLETED
                      ? "bg-green-500/20 text-green-700 hover:bg-green-500/30 dark:text-green-400"
                      : "text-muted-foreground hover:bg-muted hover:text-green-600"
                  )}
                  title={
                    taskItem.status === TaskStatus.COMPLETED
                      ? "Mark as todo"
                      : "Mark as completed"
                  }
                >
                  <HiCheck className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={onEdit}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-primary"
                title="Edit"
              >
                <HiPencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  // Recurring events get Google's three-way choice; everything
                  // else falls through to the caller's own delete handling.
                  if (!isTask && eventItem?.isRecurring) {
                    setShowDeleteDialog(true);
                  } else {
                    onDelete();
                  }
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                title="Delete"
              >
                <HiTrash className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isTask && eventItem && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <IoTimeOutline className="h-4 w-4 flex-shrink-0" />
                <span>
                  {format(newDate(eventItem.start), "PPp")} -{" "}
                  {format(
                    newDate(eventItem.end),
                    eventItem.allDay ? "PP" : "p"
                  )}
                </span>
              </div>
              {eventItem.location && (
                <div className="flex items-center gap-2">
                  <IoLocationOutline className="h-4 w-4 flex-shrink-0" />
                  <span className="event-location line-clamp-2">
                    {eventItem.location}
                  </span>
                </div>
              )}
              {eventItem.attendees && eventItem.attendees.length > 0 && (
                <div className="flex items-start gap-2">
                  <IoPeopleOutline className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="flex-1">
                    {eventItem.attendees.map((attendee) => (
                      <div
                        key={attendee.email}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="event-attendees flex-1 truncate">
                          {attendee.name || attendee.email}
                        </span>
                        <span
                          className={cn(
                            "ml-2 flex-shrink-0",
                            getStatusColor(attendee.status)
                          )}
                        >
                          {attendee.status?.toLowerCase() || "pending"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {eventItem.description && (
                <div className="event-description mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {eventItem.description}
                </div>
              )}
            </div>
          )}

          {isTask && taskItem && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <IoTimeOutline className="h-4 w-4 flex-shrink-0" />
                  {taskItem.dueDate ? (
                    <span
                      className={cn(
                        isOverdue &&
                        "text-destructive dark:text-destructive font-medium",
                        isFutureDate(taskItem.dueDate) &&
                        "text-primary font-medium"
                      )}
                    >
                      Due {format(newDate(taskItem.dueDate), "PPp")}
                      {isOverdue && " (OVERDUE)"}
                      {isFutureDate(taskItem.dueDate) && " (UPCOMING)"}
                    </span>
                  ) : (
                    <span>No due date</span>
                  )}
                </div>
                <span
                  className={cn("rounded-full px-2 py-0.5 text-xs", {
                    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100":
                      taskItem.status === TaskStatus.COMPLETED,
                    "bg-warning/10 text-warning":
                      taskItem.status === TaskStatus.IN_PROGRESS,
                    "bg-muted text-muted-foreground":
                      taskItem.status === TaskStatus.TODO,
                  })}
                >
                  {taskItem.status.toLowerCase().replace("_", " ")}
                </span>
              </div>

              {taskItem.startDate && (
                <div className="flex items-center gap-2">
                  <IoCalendarOutline className="h-4 w-4 flex-shrink-0" />
                  <span
                    className={cn(
                      isFutureDate(taskItem.startDate) &&
                      "text-primary font-medium"
                    )}
                  >
                    Starts {format(newDate(taskItem.startDate), "PPp")}
                    {isFutureDate(taskItem.startDate) && " (UPCOMING)"}
                  </span>
                </div>
              )}

              {taskItem.priority && (
                <div className="flex items-center gap-2">
                  <IoFlagOutline className="h-4 w-4 flex-shrink-0" />
                  <span
                    className={cn(
                      "text-sm",
                      priorityColors[taskItem.priority]
                    )}
                  >
                    {taskItem.priority.charAt(0).toUpperCase() +
                      taskItem.priority.slice(1)}{" "}
                    Priority
                  </span>
                </div>
              )}

              {taskItem.isAutoScheduled &&
                taskItem.scheduledStart &&
                taskItem.scheduledEnd && (
                  <div className="flex items-center gap-2">
                    <IoCalendarOutline className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1">
                      <div>
                        Scheduled:{" "}
                        {format(newDate(taskItem.scheduledStart), "PPp")} -{" "}
                        {format(newDate(taskItem.scheduledEnd), "p")}
                      </div>
                      {taskItem.scheduleScore !== undefined && (
                        <div className="text-xs text-muted-foreground">
                          Confidence:{" "}
                          {Math.round((taskItem.scheduleScore ?? 0) * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                )}

              {taskItem.project && (
                <div className="flex items-center gap-2">
                  <IoFolderOutline className="h-4 w-4 flex-shrink-0" />
                  <span
                    className="rounded px-2 py-0.5 text-xs"
                    style={{
                      backgroundColor:
                        (taskItem.project.color || "hsl(var(--primary))") +
                        "20",
                      color: taskItem.project.color || "hsl(var(--primary))",
                    }}
                  >
                    {taskItem.project.name}
                  </span>
                </div>
              )}

              {taskItem.duration && (
                <div className="flex items-center gap-2">
                  <IoTimeOutline className="h-4 w-4 flex-shrink-0" />
                  <span>Duration: {taskItem.duration} minutes</span>
                </div>
              )}

              {taskItem.tags && taskItem.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {taskItem.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                      style={{
                        backgroundColor:
                          (tag.color || "hsl(var(--primary))") + "20",
                        color: tag.color || "hsl(var(--primary))",
                      }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {taskItem.description && (
                <div className="task-description mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {taskItem.description}
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>

      {/* Recurring Event Delete Dialog (Google's three-way choice) */}
      <AlertDialog.Root
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[10001] bg-background/80 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[10002] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg">
            <AlertDialog.Title className="mb-4 text-lg font-semibold">
              Delete recurring event
            </AlertDialog.Title>
            <AlertDialog.Description className="mb-6 text-sm text-muted-foreground">
              Delete only this occurrence, this and all following occurrences,
              or the entire series?
            </AlertDialog.Description>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setShowDeleteDialog(false);
                  onDelete("single");
                }}
              >
                This event
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setShowDeleteDialog(false);
                  onDelete("thisAndFollowing");
                }}
              >
                This and following events
              </Button>
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => {
                  setShowDeleteDialog(false);
                  onDelete("series");
                }}
              >
                All events
              </Button>
              <Button
                variant="ghost"
                className="mt-1 self-end"
                onClick={() => setShowDeleteDialog(false)}
              >
                Cancel
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Popover>
  );
}
