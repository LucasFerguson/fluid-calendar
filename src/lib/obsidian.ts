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

// Strip characters that are invalid in a Windows path/name (\ / : * ? " < > |),
// plus Obsidian-special ones (# ^ [ ]) and any ASCII control chars, then trim
// so the name can't end in a space or dot (also disallowed on Windows).
function sanitizeFileName(name: string): string {
  const cleaned = Array.from(name)
    .filter((c) => c.charCodeAt(0) >= 32)
    .join("")
    .replace(/[\\/:*?"<>|#^[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned.replace(/[. ]+$/g, "").trim();
}

// A wiki-linkable name: first + last name only (drop credential suffixes after
// a comma and middle initials), with characters that would break a [[wikilink]]
// removed, so it matches a "First Last" note in the vault.
function personWikiName(name: string): string {
  const words = name
    .split(",")[0]
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^[A-Za-z]\.?$/.test(w)); // drop middle initials like "A."
  const picked =
    words.length <= 1 ? words : [words[0], words[words.length - 1]];
  return picked.join(" ").replace(/[[\]|#^]/g, "").trim() || name.trim();
}

function buildContent(input: MeetingNoteInput): string {
  const start = newDate(input.start);
  const lines = [
    `# ${input.title}`,
    "",
    "#meeting",
    "",
    // Human-readable date, plus a [[YYYY-MM-DD]] link back to the daily note.
    `- **Date:** ${format(start, "PPPp")} · [[${format(start, "yyyy-MM-dd")}]]`,
  ];
  if (input.location) lines.push(`- **Location:** ${input.location}`);
  if (input.people.length > 0) {
    lines.push("- **Attendees:**");
    for (const p of input.people) {
      // Wiki-link the person's name (so it links to their vault note); keep the
      // email as plain text alongside. Email-only attendees stay unlinked.
      const label = p.name
        ? `[[${personWikiName(p.name)}]] (${p.email})`
        : p.email;
      lines.push(`  - ${label}`);
    }
  }
  lines.push(
    "",
    "## Agenda",
    "",
    "## Notes",
    "",
    "### To-dos",
    "",
    "- [ ] ",
    "",
    "### Follow-ups",
    "",
    ""
  );
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
