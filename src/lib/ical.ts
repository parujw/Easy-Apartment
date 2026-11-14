// Minimal iCal (RFC 5545) reader for Airbnb / Booking.com / Agoda reservation feeds.

export type IcalEvent = { uid: string; start: string; end: string; summary: string };

const ALLOWED_DOMAINS = ["airbnb.com", "airbnb.co.th", "airbnb.co.uk", "airbnb.com.au", "airbnb.com.sg", "booking.com", "agoda.com"];

/** Exact domain or a subdomain of it — "airbnb.evil.com" is rejected. */
export function allowedCalendarUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.port) return null;
  const host = url.hostname.toLowerCase();
  return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith("." + d)) ? url : null;
}

const toIso = (line: string) => {
  const d = line.replace(/^.*:/, "").slice(0, 8); // DTSTART;VALUE=DATE:20261201 → 2026-12-01
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
};

export function parseIcal(text: string): IcalEvent[] {
  const events: IcalEvent[] = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => block.match(new RegExp(`^${k}[;:][^\\r\\n]*`, "m"))?.[0]?.trim() ?? "";
    const start = get("DTSTART"), end = get("DTEND");
    if (!start || !end) continue;
    const summary = get("SUMMARY").replace(/^SUMMARY[^:]*:/, "");
    events.push({
      uid: get("UID").replace(/^UID[^:]*:/, ""), start: toIso(start), end: toIso(end),
      summary: /not available|blocked/i.test(summary) ? "ปิดห้อง (Airbnb)" : summary || "Airbnb",
    });
  }
  return events.filter((e) => e.uid && /^\d{4}-\d{2}-\d{2}$/.test(e.start) && e.end > e.start);
}
