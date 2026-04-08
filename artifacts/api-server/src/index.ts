import app from "./app";
import { logger } from "./lib/logger";
import { startScheduledEmailSender } from "./lib/scheduledEmailSender";
import { startGmailWatcher } from "./lib/gmailWatcher";

if (!process.env.TOKEN_ENCRYPTION_KEY) {
  logger.error("FATAL: TOKEN_ENCRYPTION_KEY environment variable is required. Set it in Replit Secrets before starting the server.");
  process.exit(1);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startScheduledEmailSender();
  startGmailWatcher();
});
