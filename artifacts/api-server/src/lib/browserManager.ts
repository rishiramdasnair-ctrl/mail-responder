/// <reference lib="dom" />
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { isUrlSafe, resolveAndCheckUrl } from "./urlSafety";

export { isUrlSafe } from "./urlSafety";

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browserInstance;
}

export interface BrowserSession {
  page: Page;
  context: BrowserContext;
  close: () => Promise<void>;
}

export async function createBrowserSession(): Promise<BrowserSession> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  await context.route("**", async (route) => {
    const reqUrl = route.request().url();

    if (!isUrlSafe(reqUrl)) {
      route.abort("blockedbyclient");
      return;
    }

    let hostname: string;
    try {
      hostname = new URL(reqUrl).hostname;
    } catch {
      route.abort("blockedbyclient");
      return;
    }

    // Re-resolve on every request (no caching) to prevent DNS rebinding:
    // a domain could initially resolve to a public IP, then be rebound to
    // an internal one. Fresh DNS per request eliminates the rebinding window.
    const check = await resolveAndCheckUrl(`https://${hostname}/`);
    if (!check.safe) {
      route.abort("blockedbyclient");
      return;
    }

    route.continue();
  });

  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  return {
    page,
    context,
    close: async () => {
      try {
        await context.close();
      } catch {
        /* ignore cleanup errors */
      }
    },
  };
}

export async function getPageSnapshot(page: Page): Promise<string> {
  const url = page.url();
  try {
    const snapshot = await page.evaluate((): { text: string; interactive: string[] } => {
      const interactiveElements: string[] = [];
      const seen = new Set<string>();

      const addEl = (el: Element, type: string) => {
        const label =
          el.getAttribute("aria-label") ||
          el.getAttribute("placeholder") ||
          el.getAttribute("title") ||
          el.getAttribute("name") ||
          el.getAttribute("id") ||
          ((el as HTMLElement).innerText ?? "").trim().slice(0, 60) ||
          "";
        const key = `${type}:${label}`;
        if (!seen.has(key) && label) {
          seen.add(key);
          interactiveElements.push(`[${type}] ${label}`);
        }
      };

      document.querySelectorAll("button, [role='button']").forEach((el) => addEl(el, "button"));
      document.querySelectorAll("a[href]").forEach((el) => addEl(el, "link"));
      document.querySelectorAll("input, textarea, select").forEach((el) => addEl(el, "input"));

      const bodyText = (document.body as HTMLElement | null)?.innerText ?? "";
      const cleanText = bodyText
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .slice(0, 100)
        .join("\n");

      return {
        text: cleanText.slice(0, 3000),
        interactive: interactiveElements.slice(0, 40),
      };
    });

    const lines: string[] = [`Current URL: ${url}`, "", "=== Page Content ===", snapshot.text];
    if (snapshot.interactive.length > 0) {
      lines.push("", "=== Interactive Elements ===", ...snapshot.interactive);
    }
    return lines.join("\n");
  } catch {
    return `Current URL: ${url}\n(Could not extract page content)`;
  }
}

export interface DdgResult {
  title: string;
  href: string;
  snippet: string;
}

export async function extractDdgResults(page: Page): Promise<DdgResult[]> {
  return page.evaluate((): DdgResult[] => {
    const items: DdgResult[] = [];
    document.querySelectorAll(".result__body").forEach((el) => {
      const titleEl = el.querySelector(".result__title a");
      const snippetEl = el.querySelector(".result__snippet");
      const title = ((titleEl as HTMLElement | null)?.innerText ?? "").trim();
      const href = titleEl?.getAttribute("href") ?? "";
      const snippet = ((snippetEl as HTMLElement | null)?.innerText ?? "").trim();
      if (title && href) items.push({ title, href, snippet: snippet.slice(0, 150) });
    });
    return items.slice(0, 12);
  });
}
