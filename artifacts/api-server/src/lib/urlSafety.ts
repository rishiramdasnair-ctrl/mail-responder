import { isIP } from "net";
import { lookup } from "dns/promises";

const PRIVATE_IP_RANGES: RegExp[] = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "instance-data",
  "metadata",
]);

export function isIpPrivate(ip: string): boolean {
  for (const re of PRIVATE_IP_RANGES) {
    if (re.test(ip)) return true;
  }
  return false;
}

export function isHostnameSafe(hostname: string): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(h)) return false;
  if (h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (isIP(h) !== 0 && isIpPrivate(h)) return false;
  return true;
}

export function isUrlSafe(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    return isHostnameSafe(parsed.hostname);
  } catch {
    return false;
  }
}

export async function resolveAndCheckUrl(rawUrl: string): Promise<{ safe: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: "Invalid URL format." };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, reason: `URL scheme "${parsed.protocol}" is not allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");

  if (!isHostnameSafe(hostname)) {
    return { safe: false, reason: `Browsing "${hostname}" is not permitted.` };
  }

  if (isIP(hostname) === 0) {
    try {
      const results = await lookup(hostname, { all: true });
      for (const r of results) {
        if (isIpPrivate(r.address)) {
          return { safe: false, reason: `"${hostname}" resolves to a private IP address (${r.address}) which is not permitted.` };
        }
      }
    } catch {
      return { safe: false, reason: `Could not resolve hostname "${hostname}".` };
    }
  }

  return { safe: true };
}
