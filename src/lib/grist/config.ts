// Connection settings for the external Grist CRM (a self-hosted instance on
// the LAN). Deliberately env-only: the Settings page displays this read-only
// as a reminder of how the integration is wired, and changes happen in .env.

export interface GristConfig {
  baseUrl: string;
  apiKey: string;
  docId: string;
  connectionsTable: string;
  companiesTable: string;
}

/** Full config, or null when required pieces (URL, key, doc id) are missing. */
export function getGristConfig(): GristConfig | null {
  const baseUrl = process.env.GRIST_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.GRIST_API_KEY;
  const docId = process.env.GRIST_DOC_ID;
  if (!baseUrl || !apiKey || !docId) return null;
  return {
    baseUrl,
    apiKey,
    docId,
    connectionsTable: process.env.GRIST_CONNECTIONS_TABLE || "Connections",
    companiesTable: process.env.GRIST_COMPANIES_TABLE || "Companies",
  };
}

/** Display-safe connection info for the Settings page (never the key). */
export function getGristPublicInfo() {
  return {
    baseUrl: process.env.GRIST_BASE_URL?.replace(/\/+$/, "") || null,
    docId: process.env.GRIST_DOC_ID || null,
    connectionsTable: process.env.GRIST_CONNECTIONS_TABLE || "Connections",
    companiesTable: process.env.GRIST_COMPANIES_TABLE || "Companies",
    apiKeySet: !!process.env.GRIST_API_KEY,
    configured: !!getGristConfig(),
  };
}
