# Obsidian URI

Obsidian URI is a custom URI protocol that Obsidian registers with the OS. Any
app (including this one) can trigger Obsidian actions — open a note, create a
note, run a search — by navigating to an `obsidian://` link. This is what
powers the **"Create meeting note"** button on calendar events (see
[How this app uses it](#how-this-app-uses-it)).

## Format

```
obsidian://<action>?param1=value&param2=value
```

`<action>` is one of:

| Action | Purpose |
|---|---|
| `open` | Open an existing note. |
| `new` | Create a note (or append to / overwrite an existing one). |
| `daily` | Create or open today's daily note (Daily notes plugin required). |
| `unique` | Create a new unique note (Unique note creator plugin required). |
| `search` | Open search, optionally with a query. |
| `choose-vault` | Open the vault manager. |

### Encoding (important)

All parameter **values must be URI-encoded**. In particular:

- space → `%20`
- forward slash `/` → `%2F`

An improperly encoded reserved character can break interpretation of the whole
URI, so encode every value (in JS, `encodeURIComponent(value)`).

## `new` — create a note

Creates a note in the vault, optionally with content.

```
obsidian://new?vault=my%20vault&name=my%20note
obsidian://new?vault=my%20vault&file=path%2Fto%2Fmy%20note
```

Parameters:

| Param | Meaning |
|---|---|
| `vault` | Vault **name** or vault ID. Required to target a specific vault. |
| `name` | File name only. Location comes from your "Default location for new notes" setting. |
| `file` | Vault-absolute path **including the name**. Overrides `name`. |
| `path` | Globally absolute path. Overrides both `vault` and `file`. |
| `content` | The note's contents. |
| `clipboard` | Use the clipboard contents instead of `content`. |
| `silent` | Present ⇒ don't open the new note after creating it. |
| `append` | Present ⇒ append to the file if it already exists. |
| `overwrite` | Present ⇒ overwrite an existing file (ignored if `append` is set). |
| `paneType` | Where to open it in the UI (same as `open`). |
| `x-success` | x-callback-url success target (see Obsidian docs). |

**`append` vs `overwrite` vs neither:** with neither flag, opening the same
`file` again creates a numbered duplicate (`my note 1`). `append` adds to the
existing note; `overwrite` replaces it. For a meeting note you usually want to
create-then-open (no flags) or `append` so re-clicking doesn't clobber notes
you've written.

## `daily` — daily note

```
obsidian://daily?vault=my%20vault
```

Accepts the same parameters as `new`. Requires the Daily notes plugin.

## `unique` — unique note

```
obsidian://unique?vault=my%20vault
obsidian://unique?vault=my%20vault&content=Hello%20World
```

Parameters: `vault`, `paneType`, `content`, `clipboard`, `x-success`. Requires
the Unique note creator plugin.

## `search`

```
obsidian://search?vault=my%20vault
obsidian://search?vault=my%20vault&query=Obsidian
```

Parameters: `vault`, `query` (optional).

## `choose-vault`

```
obsidian://choose-vault
```

Opens the vault manager. No parameters.

## How this app uses it

The **Create meeting note** button on a calendar event builds an
`obsidian://new` URI and navigates to it, which hands off to the desktop
Obsidian app:

- `vault` — configured via `NEXT_PUBLIC_OBSIDIAN_VAULT` (currently
  `Obsidian-Vault`).
- `file` — `NEXT_PUBLIC_OBSIDIAN_MEETINGS_FOLDER` (currently
  `001-Home/Meetings/`) + `YYYY-MM-DD <event title>`, each path segment
  encoded.
- `content` — a templated note: the event title/date as a heading, an
  attendees list (calendar guests + locally attached contacts), and an empty
  Notes section.

Because the URI is followed by the browser, the button only works on a device
where the Obsidian desktop app is installed and the vault of that name exists.
Vault name and folder are env-configurable so they aren't hard-coded to one
machine.
