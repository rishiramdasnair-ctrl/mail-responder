/**
 * One-time migration script: encrypts any plaintext OAuth tokens in the DB.
 *
 * Safe to run multiple times — already-encrypted values (prefixed with "enc:")
 * are skipped. Run with:
 *   pnpm --filter @workspace/api-server tsx src/scripts/encryptExistingTokens.ts
 */

import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  gmailAccountsTable,
  connectorsTable,
} from "@workspace/db/schema";
import { maybeEncrypt, encryptConnectorConfig, isEncryptionAvailable } from "../lib/tokenCrypto";

if (!isEncryptionAvailable()) {
  console.error("ERROR: TOKEN_ENCRYPTION_KEY env var is not set. Aborting.");
  process.exit(1);
}

async function encryptUsersTableTokens() {
  const rows = await db.select({
    id: usersTable.id,
    googleAccessToken: usersTable.googleAccessToken,
    googleRefreshToken: usersTable.googleRefreshToken,
  }).from(usersTable);

  let updated = 0;
  for (const row of rows) {
    const needsUpdate =
      (row.googleAccessToken && !row.googleAccessToken.startsWith("enc:")) ||
      (row.googleRefreshToken && !row.googleRefreshToken.startsWith("enc:"));

    if (!needsUpdate) continue;

    await db.update(usersTable)
      .set({
        googleAccessToken: maybeEncrypt(row.googleAccessToken) ?? null,
        googleRefreshToken: maybeEncrypt(row.googleRefreshToken) ?? null,
      })
      .where(eq(usersTable.id, row.id));
    updated++;
  }
  console.log(`users table: ${updated}/${rows.length} rows encrypted`);
}

async function encryptGmailAccountTokens() {
  const rows = await db.select({
    id: gmailAccountsTable.id,
    accessToken: gmailAccountsTable.accessToken,
    refreshToken: gmailAccountsTable.refreshToken,
  }).from(gmailAccountsTable);

  let updated = 0;
  for (const row of rows) {
    const needsUpdate =
      (row.accessToken && !row.accessToken.startsWith("enc:")) ||
      (row.refreshToken && !row.refreshToken.startsWith("enc:"));

    if (!needsUpdate) continue;

    await db.update(gmailAccountsTable)
      .set({
        accessToken: maybeEncrypt(row.accessToken) ?? null,
        refreshToken: maybeEncrypt(row.refreshToken) ?? row.refreshToken,
      })
      .where(eq(gmailAccountsTable.id, row.id));
    updated++;
  }
  console.log(`gmail_accounts table: ${updated}/${rows.length} rows encrypted`);
}

async function encryptConnectorTokens() {
  const rows = await db.select({
    id: connectorsTable.id,
    config: connectorsTable.config,
  }).from(connectorsTable);

  let updated = 0;
  for (const row of rows) {
    const cfg = row.config as Record<string, unknown>;
    if (!cfg) continue;

    const tokenFields = ["accessToken", "refreshToken", "token", "access_token", "refresh_token"];
    const hasPlaintext = tokenFields.some(
      (f) => typeof cfg[f] === "string" && cfg[f] && !(cfg[f] as string).startsWith("enc:")
    );

    if (!hasPlaintext) continue;

    const encrypted = encryptConnectorConfig(cfg);
    await db.update(connectorsTable)
      .set({ config: encrypted })
      .where(eq(connectorsTable.id, row.id));
    updated++;
  }
  console.log(`connectors table: ${updated}/${rows.length} rows encrypted`);
}

(async () => {
  console.log("Starting token encryption migration...");
  try {
    await encryptUsersTableTokens();
    await encryptGmailAccountTokens();
    await encryptConnectorTokens();
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();
