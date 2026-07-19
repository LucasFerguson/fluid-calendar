import { format, newDate } from "@/lib/date-utils";

// Builds obsidian://new URIs for the "Create meeting note" button. See
// docs/obsidian-uri.md. Vault name and target folder are env-configurable so
// they aren't hard-coded to one machine.

export interface MeetingNotePerson {
  name?: string | null;
  email: string;
}

export interface MeetingNoteInput {
  title: string;
  start: Date | string;
  location?: string | null;
  people: MeetingNotePerson[];
}

function vault(): string {
  return process.env.NEXT_PUBLIC_OBSIDIAN_VAULT || "Obsidian";
}

function meetingsFolder(): string {
  // Normalize to a single trailing slash (or empty for the vault root).
  const raw = process.env.NEXT_PUBLIC_OBSIDIAN_MEETINGS_FOLDER || "";
  return raw ? raw.replace(/\/+$/, "") + "/" : "";
}

export function isObsidianConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_OBSIDIAN_VAULT;
}

// Obsidian disallows these in file names; collapse them to keep the path valid.
function sanitizeFileName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

function buildContent(input: MeetingNoteInput): string {
  const start = newDate(input.start);
  const lines = [
    `# ${input.title}`,
    "",
    `- **Date:** ${format(start, "PPPp")}`,
  ];
  if (input.location) lines.push(`- **Location:** ${input.location}`);
  if (input.people.length > 0) {
    lines.push("- **Attendees:**");
    for (const p of input.people) {
      const label = p.name ? `${p.name} (${p.email})` : p.email;
      lines.push(`  - ${label}`);
    }
  }
  lines.push("", "## Notes", "", "");
  return lines.join("\n");
}

/** The full obsidian://new URI to create (and open) the meeting note. */
export function buildMeetingNoteUri(input: MeetingNoteInput): string {
  const start = newDate(input.start);
  const fileName = `${format(start, "yyyy-MM-dd")} ${sanitizeFileName(input.title)}`;
  // Obsidian expects every value URI-encoded with %20 for spaces and %2F for
  // slashes (see docs/obsidian-uri.md). URLSearchParams would encode spaces as
  // "+", which Obsidian does not decode, so build the query manually with
  // encodeURIComponent. `file` is a vault-absolute path including the name.
  const params = [
    `vault=${encodeURIComponent(vault())}`,
    `file=${encodeURIComponent(meetingsFolder() + fileName)}`,
    `content=${encodeURIComponent(buildContent(input))}`,
    // Append so re-clicking doesn't clobber notes already written.
    `append=true`,
  ];
  return `obsidian://new?${params.join("&")}`;
}
