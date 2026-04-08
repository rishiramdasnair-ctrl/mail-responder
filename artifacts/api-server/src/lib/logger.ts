import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers['set-cookie']",
      "*.accessToken",
      "*.refreshToken",
      "*.access_token",
      "*.refresh_token",
      "*.googleAccessToken",
      "*.googleRefreshToken",
      "*.token",
      "*.body",
      "*.emailBody",
      "*.config.accessToken",
      "*.config.refreshToken",
      "*.config.token",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
