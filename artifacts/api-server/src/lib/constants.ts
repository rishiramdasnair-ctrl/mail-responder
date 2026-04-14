export const CONSTANTS = {
  // AI Reply limits
  TRIAL_REPLIES: 50,
  MAX_AI_REPLY_LENGTH: 2000,

  // Rate limiting (ms)
  RATE_LIMIT_WINDOW_MS: 60_000,

  // Email
  MAX_EMAIL_BODY_SIZE: 1024 * 1024, // 1MB
  MAX_ATTACHMENTS: 20,
  EMAIL_FETCH_LIMIT: 100,
  PRIORITY_INBOX_COUNT: 5,

  // Agent
  MAX_BROWSER_STEPS: 10,
  MAX_AGENT_ITERATIONS: 20,
  MAX_AGENT_TOKENS: 2048,

  // Cache TTL (ms)
  LABEL_CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  CONTACT_CACHE_TTL: 30 * 60 * 1000, // 30 minutes
  DIGEST_CACHE_TTL: 60 * 60 * 1000, // 1 hour

  // Session
  SESSION_CODE_TTL_MS: 60_000, // 1 minute
  BROWSER_SESSION_CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  GMAIL_NOT_CONNECTED: "Gmail not connected",
  SESSION_EXPIRED: "Session expired",
  RATE_LIMITED: "Too many requests",
  INVALID_INPUT: "Invalid input",
} as const;
