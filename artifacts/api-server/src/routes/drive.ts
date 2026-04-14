import { Router } from "express";
import { requireAuth } from "../lib/requireAuth";
import { getReqUserId } from "../lib/getReqAuth";
import { google } from "googleapis";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Readable } from "stream";
import { maybeDecrypt } from "../lib/tokenCrypto";
import { getOAuth2ClientForUser } from "../lib/gmailClient";

const router = Router();

async function getDriveClient(userId: string) {
  const oauth2Client = await getOAuth2ClientForUser(userId);
  const auth = new google.auth.OAuth2();
  auth.setCredentials(oauth2Client.credentials);
  return {
    drive: google.drive({ version: "v3", auth }),
    gmail: google.gmail({ version: "v1", auth }),
  };
}

router.get("/drive/list", requireAuth, async (req, res): Promise<void> => {
  const userId = getReqUserId(req)!;
  const pageSize = Math.min(Number(req.query.pageSize) || 20, 50);
  const pageToken = req.query.pageToken as string | undefined;

  try {
    const { drive } = await getDriveClient(userId!);
    const resp = await drive.files.list({
      pageSize,
      pageToken,
      orderBy: "modifiedTime desc",
      fields:
        "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,owners)",
    });
    res.json({
      files: resp.data.files ?? [],
      nextPageToken: resp.data.nextPageToken,
    });
  } catch (err: unknown) {
    const msg =
      err instanceof Error ? err.message : "Failed to list Drive files";
    res.status(500).json({ error: msg });
  }
});

router.get("/drive/search", requireAuth, async (req, res): Promise<void> => {
  const userId = getReqUserId(req)!;
  const query = req.query.q as string;
  if (!query) {
    res.status(400).json({ error: "q is required" });
    return;
  }

  try {
    const { drive } = await getDriveClient(userId!);
    const resp = await drive.files.list({
      q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
      pageSize: 20,
      orderBy: "modifiedTime desc",
      fields:
        "files(id,name,mimeType,modifiedTime,webViewLink,iconLink,size,owners)",
    });
    res.json({ files: resp.data.files ?? [] });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to search Drive";
    res.status(500).json({ error: msg });
  }
});

router.get(
  "/drive/file/:fileId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = getReqUserId(req)!;
    try {
      const { drive } = await getDriveClient(userId!);
      const meta = await drive.files.get({
        fileId: req.params.fileId,
        fields:
          "id,name,mimeType,modifiedTime,webViewLink,description,size,owners",
      });

      const isGoogleDoc = meta.data.mimeType?.startsWith(
        "application/vnd.google-apps",
      );
      let text: string | null = null;
      if (isGoogleDoc) {
        try {
          const exported = await drive.files.export({
            fileId: req.params.fileId,
            mimeType: "text/plain",
          });
          text =
            typeof exported.data === "string"
              ? exported.data.slice(0, 8000)
              : null;
        } catch {
          /* not exportable */
        }
      }
      res.json({ file: meta.data, text });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to get file";
      res.status(500).json({ error: msg });
    }
  },
);

router.post("/drive/save", requireAuth, async (req, res): Promise<void> => {
  const userId = getReqUserId(req)!;
  const { messageId, attachmentId, filename, mimeType } = req.body as {
    messageId: string;
    attachmentId: string;
    filename: string;
    mimeType: string;
  };
  if (!messageId || !attachmentId || !filename) {
    res
      .status(400)
      .json({ error: "messageId, attachmentId, and filename are required" });
    return;
  }
  try {
    const { gmail, drive } = await getDriveClient(userId!);
    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    const data = attachment.data.data;
    if (!data) {
      res.status(404).json({ error: "Attachment data not found" });
      return;
    }

    const buffer = Buffer.from(data, "base64url");
    const driveFile = await drive.files.create({
      requestBody: {
        name: filename,
        mimeType: mimeType || "application/octet-stream",
      },
      media: {
        mimeType: mimeType || "application/octet-stream",
        body: Readable.from(buffer),
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
    const msg = err instanceof Error ? err.message : "Failed to save to Drive";
    req.log.error({ err: msg }, "[drive/save] error");
    res.status(500).json({ error: msg });
  }
});

export default router;
