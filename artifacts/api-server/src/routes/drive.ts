import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getAuth } from "@clerk/express";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { usersTable, connectorsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { Readable } from "stream";

const router = Router();

async function getGoogleClientForUser(userId: string) {
  const [user] = await db
    .select({
      googleAccessToken: usersTable.googleAccessToken,
      googleRefreshToken: usersTable.googleRefreshToken,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user?.googleAccessToken) {
    throw new Error("No Google token for user");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google credentials not configured");

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken ?? undefined,
  });
  return auth;
}

router.post("/drive/save", requireAuth, async (req, res) => {
  const authInfo = getAuth(req);
  const userId = authInfo.userId!;

  const { messageId, attachmentId, filename, mimeType } = req.body as {
    messageId: string;
    attachmentId: string;
    filename: string;
    mimeType: string;
  };

  if (!messageId || !attachmentId || !filename) {
    return res.status(400).json({ error: "messageId, attachmentId, and filename are required" });
  }

  const [driveConnector] = await db
    .select({ id: connectorsTable.id })
    .from(connectorsTable)
    .where(and(
      eq(connectorsTable.userId, userId),
      eq(connectorsTable.connectorId, "google-drive"),
      eq(connectorsTable.status, "connected"),
    ))
    .limit(1);

  if (!driveConnector) {
    return res.status(403).json({ error: "Google Drive is not connected. Please connect it in Connectors settings." });
  }

  try {
    const authClient = await getGoogleClientForUser(userId);
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const drive = google.drive({ version: "v3", auth: authClient });

    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });

    const data = attachment.data.data;
    if (!data) {
      return res.status(404).json({ error: "Attachment data not found" });
    }

    const buffer = Buffer.from(data, "base64url");
    const stream = Readable.from(buffer);

    const driveFile = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: mimeType || "application/octet-stream",
      },
      media: {
        mimeType: mimeType || "application/octet-stream",
        body: stream,
      },
      fields: "id,name,webViewLink",
    });

    res.json({
      success: true,
      file: {
        id: driveFile.data.id,
        name: driveFile.data.name,
        url: driveFile.data.webViewLink,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save to Drive";
    console.error("[drive/save] error:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
