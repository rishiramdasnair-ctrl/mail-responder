import { db } from "@workspace/db";
import { usersTable, gmailAccountsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { maybeEncrypt, maybeDecrypt } from "./tokenCrypto";

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
}

export interface AccountLinkResult {
  userId: string;
  email: string;
  isNewAccount: boolean;
  isPrimary: boolean;
}

export async function linkGoogleAccount(
  userId: string,
  email: string,
  tokens: GoogleTokens,
): Promise<AccountLinkResult> {
  const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  return db.transaction(async (tx) => {
    const existingUser = await tx
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (existingUser.length === 0) {
      await tx.insert(usersTable).values({
        id: userId,
        email,
        googleEmail: email,
        googleAccessToken: maybeEncrypt(tokens.access_token) ?? null,
        googleRefreshToken: tokens.refresh_token
          ? (maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token)
          : null,
        googleTokenExpiresAt: expiresAt,
      });
    } else {
      await tx
        .update(usersTable)
        .set({
          googleAccessToken: maybeEncrypt(tokens.access_token) ?? null,
          googleRefreshToken: tokens.refresh_token
            ? (maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token)
            : null,
          googleTokenExpiresAt: expiresAt,
          googleEmail: email,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, userId));
    }

    const existingAccounts = await tx
      .select({ id: gmailAccountsTable.id })
      .from(gmailAccountsTable)
      .where(eq(gmailAccountsTable.userId, userId));

    const isFirstAccount = existingAccounts.length === 0;

    const existingRow = await tx
      .select()
      .from(gmailAccountsTable)
      .where(
        and(
          eq(gmailAccountsTable.userId, userId),
          eq(gmailAccountsTable.email, email),
        ),
      )
      .limit(1);

    const shouldBePrimary =
      isFirstAccount || (existingRow.length > 0 && existingRow[0].isPrimary);
    let isNewAccount = false;

    if (existingRow.length > 0) {
      await tx
        .update(gmailAccountsTable)
        .set({
          accessToken: maybeEncrypt(tokens.access_token) ?? null,
          refreshToken: tokens.refresh_token
            ? (maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token)
            : existingRow[0].refreshToken,
          tokenExpiresAt: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(gmailAccountsTable.id, existingRow[0].id));
    } else {
      await tx.insert(gmailAccountsTable).values({
        userId,
        email,
        accessToken: maybeEncrypt(tokens.access_token) ?? null,
        refreshToken: tokens.refresh_token
          ? (maybeEncrypt(tokens.refresh_token) ?? tokens.refresh_token)
          : "",
        tokenExpiresAt: expiresAt,
        isPrimary: shouldBePrimary,
      });
      isNewAccount = true;
    }

    return {
      userId,
      email,
      isNewAccount,
      isPrimary: shouldBePrimary,
    };
  });
}
