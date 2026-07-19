import { buildMeetingNoteUri, isObsidianConfigured } from "@/lib/obsidian";

// Pull one query param out of an obsidian:// URI and decode it, so we can
// assert on the (URI-encoded) file path and note content the button produces.
function param(uri: string, key: string): string {
  const match = uri.match(new RegExp(`[?&]${key}=([^&]*)`));
  if (!match) throw new Error(`param ${key} not found in ${uri}`);
  return decodeURIComponent(match[1]);
}

describe("obsidian meeting note", () => {
  const originalVault = process.env.NEXT_PUBLIC_OBSIDIAN_VAULT;
  const originalFolder = process.env.NEXT_PUBLIC_OBSIDIAN_MEETINGS_FOLDER;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_OBSIDIAN_VAULT = "Obsidian-Vault";
    process.env.NEXT_PUBLIC_OBSIDIAN_MEETINGS_FOLDER = "001-Home/Meetings/";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_OBSIDIAN_VAULT = originalVault;
    process.env.NEXT_PUBLIC_OBSIDIAN_MEETINGS_FOLDER = originalFolder;
  });

  // A naive (no-Z) datetime so format() yields the same wall-clock date in any
  // test-runner timezone.
  const start = "2026-07-19T14:00:00";

  describe("isObsidianConfigured", () => {
    it("is true when the vault env var is set", () => {
      expect(isObsidianConfigured()).toBe(true);
    });

    it("is false when the vault env var is unset", () => {
      delete process.env.NEXT_PUBLIC_OBSIDIAN_VAULT;
      expect(isObsidianConfigured()).toBe(false);
    });
  });

  describe("buildMeetingNoteUri", () => {
    it("targets obsidian://new in the configured vault and folder", () => {
      const uri = buildMeetingNoteUri({ title: "Standup", start, people: [] });
      expect(uri.startsWith("obsidian://new?")).toBe(true);
      expect(uri).toContain("vault=Obsidian-Vault");
      expect(param(uri, "file")).toBe("001-Home/Meetings/2026-07-19 Standup");
      expect(uri).toContain("append=true");
    });

    it("encodes spaces as %20, never as + (Obsidian can't decode +)", () => {
      const uri = buildMeetingNoteUri({
        title: "Weekly sync meeting",
        start,
        people: [],
      });
      expect(uri).toContain("%20");
      expect(uri).not.toContain("+");
    });

    it("strips Windows-invalid characters and trailing dots from the file name", () => {
      const uri = buildMeetingNoteUri({
        title: 'Sync: eng / product <draft>? |x|.',
        start,
        people: [],
      });
      // \ / : * ? " < > | and a trailing dot are all gone; @ ! would survive.
      expect(param(uri, "file")).toBe("001-Home/Meetings/2026-07-19 Sync eng product draft x");
    });

    it("includes the #meeting tag and a [[YYYY-MM-DD]] daily-note link", () => {
      const content = param(
        buildMeetingNoteUri({ title: "Retro", start, people: [] }),
        "content"
      );
      expect(content).toContain("#meeting");
      expect(content).toContain("[[2026-07-19]]");
    });

    it("wiki-links attendees by first + last name, keeping the email plain", () => {
      const content = param(
        buildMeetingNoteUri({
          title: "1:1",
          start,
          people: [
            { name: "Tony Ferguson", email: "ferguson.tony@gmail.com" },
            { name: "Natorion A. Johnson", email: "natorion.johnson@belden.com" },
            { name: "Cesar Cuevas, EIT, SEI", email: "cesar@example.com" },
          ],
        }),
        "content"
      );
      expect(content).toContain("[[Tony Ferguson]] (ferguson.tony@gmail.com)");
      // Middle initial dropped.
      expect(content).toContain("[[Natorion Johnson]] (natorion.johnson@belden.com)");
      // Comma-separated credential suffix dropped.
      expect(content).toContain("[[Cesar Cuevas]] (cesar@example.com)");
    });

    it("leaves email-only attendees unlinked", () => {
      const content = param(
        buildMeetingNoteUri({
          title: "Sync",
          start,
          people: [{ email: "noreply@example.com" }],
        }),
        "content"
      );
      expect(content).toContain("- noreply@example.com");
      expect(content).not.toContain("[[noreply@example.com]]");
    });

    it("lays out the note sections", () => {
      const content = param(
        buildMeetingNoteUri({ title: "Planning", start, people: [] }),
        "content"
      );
      expect(content).toContain("## Agenda");
      expect(content).toContain("## Notes");
      expect(content).toContain("### To-dos");
      expect(content).toContain("- [ ] ");
      expect(content).toContain("### Follow-ups");
    });
  });
});
