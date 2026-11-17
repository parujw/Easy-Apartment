// Renders one of our own print pages to a real PDF on the server, so "พิมพ์" works everywhere:
// inside LINE, home-screen apps and any browser (they can't all print, but every phone opens a PDF).
import type { Browser } from "puppeteer-core";

let shared: Promise<Browser> | null = null;

async function browser(): Promise<Browser> {
  const puppeteer = (await import("puppeteer-core")).default;
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  // local development: any Chrome/Chromium on the machine
  const executablePath = process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1243/chrome-linux64/chrome";
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
}

/** url must be one of our print pages; `ready` is a CSS selector that appears once its data has loaded. */
export async function renderPdf(url: string, ready: string): Promise<Uint8Array> {
  shared ??= browser();
  let b: Browser;
  try { b = await shared; if (!b.connected) throw new Error("closed"); } catch { shared = browser(); b = await shared; }
  const page = await b.newPage();
  try {
    await page.emulateMediaType("print");
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 }); // Firestore keeps a connection open: never "idle"
    await page.waitForSelector(ready, { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await new Promise((r) => setTimeout(r, 400)); // QR image settles
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await page.close().catch(() => {});
  }
}
