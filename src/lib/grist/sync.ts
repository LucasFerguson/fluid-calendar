import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { GristConfig } from "./config";

const LOG_SOURCE = "GristSync";

// One-way pull from the Grist CRM's Connections table into the ContactProfile
// overlay. Profile photos are downloaded onto this server (data/contact-photos)
// and served from /api/contact-photos/:file, so nothing in the UI ever
// hot-links the Grist instance (which may not serve images publicly at all).
//
// Grist owns: name, company, title (position), photoUrl. Notes are only copied
// when Grist has text, so locally written notes aren't wiped by an empty CRM
// field. Records without an email are skipped (email is the join key).

const PHOTO_DIR = path.join(process.cwd(), "data", "contact-photos");
const STATUS_FILE = path.join(process.cwd(), "data", "grist-sync-status.json");

export interface GristSyncSummary {
  lastSyncAt: string;
  synced: number;
  skippedNoEmail: number;
  photosDownloaded: number;
  errors: string[];
}

interface GristRecord {
  id: number;
  fields: Record<string, unknown>;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Grist encodes attachment/reference-list cells as ["L", id, id, ...]. */
function firstAttachmentId(v: unknown): number | null {
  if (Array.isArray(v) && v[0] === "L" && typeof v[1] === "number") {
    return v[1];
  }
  return null;
}

async function fetchRecords(
  config: GristConfig,
  table: string
): Promise<GristRecord[]> {
  const res = await fetch(
    `${config.baseUrl}/api/docs/${config.docId}/tables/${encodeURIComponent(table)}/records`,
    { headers: { Authorization: `Bearer ${config.apiKey}` } }
  );
  if (!res.ok) {
    throw new Error(`Grist ${table} fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { records?: GristRecord[] };
  return body.records ?? [];
}

/** Download a photo to PHOTO_DIR; returns the app-relative URL to serve it. */
async function downloadPhoto(
  config: GristConfig,
  email: string,
  source: { url: string } | { attachmentId: number }
): Promise<string> {
  const target =
    "url" in source
      ? source.url
      : `${config.baseUrl}/api/docs/${config.docId}/attachments/${source.attachmentId}/download`;
  // Only send our Grist key to the Grist server itself.
  const headers: Record<string, string> = target.startsWith(config.baseUrl)
    ? { Authorization: `Bearer ${config.apiKey}` }
    : {};
  const res = await fetch(target, { headers });
  if (!res.ok) {
    throw new Error(`photo fetch HTTP ${res.status}`);
  }
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  const ext = EXT_BY_TYPE[type] ?? "jpg";
  const name = `${createHash("sha1").update(email).digest("hex")}.${ext}`;
  await writeFile(
    path.join(PHOTO_DIR, name),
    Buffer.from(await res.arrayBuffer())
  );
  return `/api/contact-photos/${name}`;
}

export async function readGristSyncStatus(): Promise<GristSyncSummary | null> {
  try {
    return JSON.parse(await readFile(STATUS_FILE, "utf8"));
  } catch {
    return null;
  }
}

export async function runGristSync(
  config: GristConfig,
  userId: string
): Promise<GristSyncSummary> {
  await mkdir(PHOTO_DIR, { recursive: true });

  const [connections, companies] = await Promise.all([
    fetchRecords(config, config.connectionsTable),
    fetchRecords(config, config.companiesTable).catch((error) => {
      // Companies are only needed to resolve company_ref; a missing table
      // shouldn't sink the whole sync.
      logger.warn(
        "Grist companies fetch failed; company_ref won't resolve",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return [] as GristRecord[];
    }),
  ]);

  const companyNameById = new Map<number, string>();
  for (const c of companies) {
    const name = str(c.fields.name);
    if (name) companyNameById.set(c.id, name);
  }

  const summary: GristSyncSummary = {
    lastSyncAt: new Date().toISOString(),
    synced: 0,
    skippedNoEmail: 0,
    photosDownloaded: 0,
    errors: [],
  };

  for (const rec of connections) {
    const email = str(rec.fields.email)?.toLowerCase();
    if (!email || !email.includes("@")) {
      summary.skippedNoEmail++;
      continue;
    }

    const first = str(rec.fields.first_name);
    const last = str(rec.fields.last_name);
    const name =
      str(rec.fields.name) ?? str([first, last].filter(Boolean).join(" "));
    const companyRef = rec.fields.company_ref;
    const company =
      str(rec.fields.company) ??
      (typeof companyRef === "number"
        ? (companyNameById.get(companyRef) ?? null)
        : null);
    const title = str(rec.fields.position);
    const notes = str(rec.fields.Notes);

    let photoUrl: string | undefined;
    const externalPhoto = str(rec.fields.photo_url);
    const attachmentId = firstAttachmentId(rec.fields.photo);
    if (externalPhoto || attachmentId) {
      try {
        photoUrl = await downloadPhoto(
          config,
          email,
          externalPhoto ? { url: externalPhoto } : { attachmentId: attachmentId! }
        );
        summary.photosDownloaded++;
      } catch (error) {
        // Keep any previously downloaded photo; just report the failure.
        summary.errors.push(
          `${email}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const fields = {
      name,
      company,
      title,
      ...(notes ? { notes } : {}),
      ...(photoUrl ? { photoUrl } : {}),
    };
    await prisma.contactProfile.upsert({
      where: { userId_email: { userId, email } },
      create: { userId, email, ...fields },
      update: fields,
    });
    summary.synced++;
  }

  await writeFile(STATUS_FILE, JSON.stringify(summary, null, 2));
  logger.info(
    "Grist sync complete",
    {
      synced: summary.synced,
      photos: summary.photosDownloaded,
      skipped: summary.skippedNoEmail,
      errors: summary.errors.length,
    },
    LOG_SOURCE
  );
  return summary;
}
