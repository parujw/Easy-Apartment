import { test } from "node:test";
import assert from "node:assert/strict";
import { promptPayPayload, crc16 } from "./promptpay.ts";
import { meterBill, nightlyBill, total, nights } from "./billing.ts";
import { quote, extend, suggestPlan } from "./plans.ts";

test("CRC-16/CCITT-FALSE matches the standard check value", () => {
  assert.equal(crc16("123456789"), "29B1");
});

test("PromptPay payload for a mobile number has the EMVCo fields and a valid CRC", () => {
  const p = promptPayPayload("081-234-5678");
  assert.equal(p.slice(0, -4), "00020101021129370016A000000677010111011300668123456785802TH53037646304");
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});

test("PromptPay accepts a 13-digit national ID", () => {
  assert.match(promptPayPayload("1234567890123"), /02131234567890123/);
});

test("PromptPay payload with amount is dynamic and carries the amount", () => {
  const p = promptPayPayload("0812345678", 4250);
  assert.match(p, /^000201010212/);
  assert.match(p, /54074250\.00/);
});

test("monthly meter bill reproduces the original formula", () => {
  const items = meterBill({
    rent: 3500, elecPrev: 1200, elecCurr: 1310, elecRate: 8,
    waterPrev: 50, waterCurr: 56, waterRate: 20, ac: 500, prevBalance: 200, discount: 100,
  });
  // 3500 + 110*8 + 6*20 + 500 + 200 - 100
  assert.equal(total(items), 5100);
});

test("meter going backwards is rejected", () => {
  assert.throws(() => meterBill({ rent: 0, elecPrev: 10, elecCurr: 5, elecRate: 8, waterPrev: 0, waterCurr: 0, waterRate: 20 }));
});

test("nightly bill counts nights across month end", () => {
  assert.equal(nights("2026-11-29", "2026-12-02"), 3);
  assert.equal(total(nightlyBill({ checkIn: "2026-11-29", checkOut: "2026-12-02", nightlyRate: 650 })), 1950);
});

test("pricing, intro once, and early renewal extends from expiry", () => {
  assert.deepEqual(quote("starter", "intro", false), { plan: "pro", days: 30, amount: 100 });
  assert.throws(() => quote("pro", "intro", true));
  assert.equal(quote("pro", "year", true).amount, 9790);
  assert.equal(extend("2026-11-20", "2026-11-14", 30), "2026-12-20");
  assert.equal(extend("2026-11-01", "2026-11-14", 30), "2026-12-14");
  assert.equal(extend(null, "2026-11-14", 30), "2026-12-14");
  assert.equal(suggestPlan(17, false), "starter");
  assert.equal(suggestPlan(17, true), "pro");
  assert.equal(suggestPlan(150, false), "business");
});

import { allowedCalendarUrl, parseIcal } from "./ical.ts";

test("iCal URL allow-list matches exact domains only", () => {
  assert.ok(allowedCalendarUrl("https://www.airbnb.com/calendar/ical/123.ics?s=abc"));
  assert.ok(allowedCalendarUrl("https://admin.booking.com/hotel/ical/x.ics"));
  assert.equal(allowedCalendarUrl("https://airbnb.evil.com/x.ics"), null);
  assert.equal(allowedCalendarUrl("https://evilairbnb.com/x.ics"), null);
  assert.equal(allowedCalendarUrl("http://www.airbnb.com/x.ics"), null);
  assert.equal(allowedCalendarUrl("https://www.airbnb.com:8443/x.ics"), null);
  assert.equal(allowedCalendarUrl("not a url"), null);
});

test("Airbnb iCal feed is parsed into date ranges", () => {
  const feed = [
    "BEGIN:VCALENDAR", "BEGIN:VEVENT", "DTEND;VALUE=DATE:20261205", "DTSTART;VALUE=DATE:20261201",
    "UID:1418fb94e984-abc@airbnb.com", "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/\r\n reservations/details/HMXYZ",
    "SUMMARY:Reserved", "END:VEVENT", "BEGIN:VEVENT", "DTEND;VALUE=DATE:20261220", "DTSTART;VALUE=DATE:20261218",
    "UID:x2@airbnb.com", "SUMMARY:Airbnb (Not available)", "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  assert.deepEqual(parseIcal(feed), [
    { uid: "1418fb94e984-abc@airbnb.com", start: "2026-12-01", end: "2026-12-05", summary: "Reserved" },
    { uid: "x2@airbnb.com", start: "2026-12-18", end: "2026-12-20", summary: "ปิดห้อง (Airbnb)" },
  ]);
});

import { parseRoomNumbers } from "./rooms.ts";
import { dueDateFor, monthRange } from "./dates.ts";

test("room number ranges expand", () => {
  assert.deepEqual(parseRoomNumbers("101-103, 201 202"), ["101", "102", "103", "201", "202"]);
  assert.deepEqual(parseRoomNumbers("A1, 101-101"), ["A1", "101"]);
});

test("due date and month range", () => {
  assert.equal(dueDateFor("2026-11-01", 5), "2026-11-05");
  assert.equal(dueDateFor("2026-11-14", 5), "2026-12-05");
  assert.equal(dueDateFor("2026-12-20", 5), "2027-01-05");
  assert.deepEqual(monthRange("2027-02"), { start: "2027-02-01", end: "2027-02-28" });
});
