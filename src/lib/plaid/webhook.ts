import { getConnectionById } from "@/db/queries/connections";
import type { AppDatabase } from "@/db/index";
import { db } from "@/db/index";
import type * as schema from "@/db/schema";
import { decrypt } from "@/lib/encryption";
import { getPlaidClient } from "@/lib/plaid";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";

type PlaidConnection = typeof schema.connections.$inferSelect;

export type PlaidWebhookUpdateResult =
  | { updated: true; webhook: string }
  | { updated: false; reason: "not_configured" | "missing_access_token" | "connection_not_found" };

export function buildPlaidWebhookUrl() {
  const explicitWebhookUrl = process.env.PLAID_WEBHOOK_URL;
  if (explicitWebhookUrl?.startsWith("https://")) {
    return explicitWebhookUrl;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl?.startsWith("https://")) {
    return undefined;
  }

  const webhookUrl = new URL("/api/plaid/webhook", siteUrl);
  const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;
  if (webhookSecret) {
    webhookUrl.searchParams.set("secret", webhookSecret);
  }

  return webhookUrl.toString();
}

function decryptConnectionAccessToken(connection: PlaidConnection) {
  if (!connection.accessToken) {
    return null;
  }

  return connection.isEncrypted ? decrypt(connection.accessToken) : connection.accessToken;
}

export async function updatePlaidItemWebhook({
  connection,
  requestId,
  source,
}: {
  connection: PlaidConnection;
  requestId?: string;
  source: "cron" | "manual";
}): Promise<PlaidWebhookUpdateResult> {
  const webhook = buildPlaidWebhookUrl();
  const logContext = {
    requestId,
    source,
    connectionId: connection.id,
    workspaceId: connection.workspaceId,
    institutionName: connection.institutionName,
    hasWebhookUrl: Boolean(webhook),
  };

  if (!webhook) {
    logWarn("plaid.webhook_update.not_configured", logContext);
    return { updated: false, reason: "not_configured" };
  }

  const accessToken = decryptConnectionAccessToken(connection);
  if (!accessToken) {
    logWarn("plaid.webhook_update.missing_access_token", logContext);
    return { updated: false, reason: "missing_access_token" };
  }

  try {
    const plaidClient = getPlaidClient();
    await plaidClient.itemWebhookUpdate({
      access_token: accessToken,
      webhook,
    });

    logInfo("plaid.webhook_update.success", logContext);
    return { updated: true, webhook };
  } catch (error) {
    logError("plaid.webhook_update.failed", error, logContext);
    throw error;
  }
}

export async function updatePlaidItemWebhookForConnection({
  database = db,
  connectionId,
  workspaceId,
  requestId,
  source,
}: {
  database?: AppDatabase;
  connectionId: number;
  workspaceId?: number;
  requestId?: string;
  source: "cron" | "manual";
}): Promise<PlaidWebhookUpdateResult> {
  const connection = await getConnectionById(database, connectionId, workspaceId);
  if (!connection) {
    logWarn("plaid.webhook_update.connection_not_found", {
      requestId,
      source,
      connectionId,
      workspaceId,
    });
    return { updated: false, reason: "connection_not_found" };
  }

  return updatePlaidItemWebhook({ connection, requestId, source });
}
