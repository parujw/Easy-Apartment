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

import { carryOverBills, carryAmount, billedRevenue } from "./carry.ts";

test("carry-over takes only this lease's earlier unpaid balances", () => {
  const bills = [
    { id: "a", leaseId: "L1", period: "2026-10", status: "partial", total: 4000, paid: 2600 },
    { id: "b", leaseId: "L1", period: "2026-09", status: "unpaid", total: 500, paid: 0 },
    { id: "c", leaseId: "L1", period: "2026-11", status: "unpaid", total: 4000, paid: 0 }, // same period: not earlier
    { id: "d", leaseId: "L0", period: "2026-10", status: "unpaid", total: 9000, paid: 0 }, // previous tenant
    { id: "e", leaseId: "L1", period: "2026-08", status: "paid", total: 4000, paid: 4000 },
    { id: "f", leaseId: "L1", period: "2026-08", status: "carried", total: 300, paid: 0 },
  ];
  const got = carryOverBills(bills, "L1", "2026-11");
  assert.deepEqual(got.map((b) => b.id), ["a", "b"]);
  assert.equal(carryAmount(got), 1900);
  assert.deepEqual(carryOverBills(bills, null, "2026-11"), []);
});

test("billed revenue excludes carried-over debt", () => {
  assert.equal(billedRevenue([{ items: [{ kind: "rent", amount: 3500 }, { kind: "prev_balance", amount: 1400 }, { kind: "discount", amount: -100 }] }]), 3400);
});

import { meterUnits } from "./billing.ts";
import { dueDateAfterPeriod } from "./dates.ts";

test("meter rollover counts the wrap, implausible jumps are rejected", () => {
  assert.equal(meterUnits(7986, 8059), 73);
  assert.equal(meterUnits(99990, 20), 30);
  assert.throws(() => meterUnits(500, 400));
});

test("due date is the due day of the month after the billing month (as V3)", () => {
  assert.equal(dueDateAfterPeriod("2026-11", 5), "2026-12-05");
  assert.equal(dueDateAfterPeriod("2026-12", 5), "2027-01-05");
  assert.equal(dueDateAfterPeriod("2027-01", 31), "2027-02-28");
});

import { tenancyLeaseIds } from "./carry.ts";
import { aging, buildAlerts, collectionByPeriod, forecast, periodsBack, reminderDraft, revenueMix, utilityMargin, vacancyDraft } from "./insights.ts";

const bill = (o: Record<string, unknown>) => ({ id: "x", roomId: "r1", roomNumber: "101", tenantName: "สมศรี", period: "2026-10", dueDate: "2026-11-05",
  items: [{ kind: "rent", amount: 3500, qty: 1 }, { kind: "elec", amount: 400, qty: 50 }], total: 3900, paid: 0, status: "unpaid", ...o });

test("tenancy follows room transfers back", () => {
  const leases = [{ id: "L1" }, { id: "L2", transferredFrom: "L1" }, { id: "L3", transferredFrom: "L2" }, { id: "X" }];
  assert.deepEqual([...tenancyLeaseIds(leases, "L3")].sort(), ["L1", "L2", "L3"]);
  assert.deepEqual([...tenancyLeaseIds(leases, "X")], ["X"]);
});

test("collection rate, aging, revenue mix and utility margin", () => {
  const bills = [bill({ id: "a", paid: 3900, status: "paid" }), bill({ id: "b", roomId: "r2", paid: 1000, status: "partial" }),
    bill({ id: "c", period: "2026-11", items: [{ kind: "rent", amount: 3500, qty: 1 }, { kind: "prev_balance", amount: 2900, qty: 1 }], total: 6400, dueDate: "2026-12-05" })];
  const [oct] = collectionByPeriod(bills, ["2026-10"]);
  assert.equal(oct.billed, 7800); assert.equal(oct.collected, 4900);
  const ag = aging(bills, new Date("2026-11-20T12:00:00"));
  assert.equal(ag["1-30"], 2900); assert.equal(ag.not_due, 6400);
  assert.deepEqual(revenueMix(bills, ["2026-10", "2026-11"]).map((x) => x.kind), ["rent", "elec"]);
  const u = utilityMargin(bills, "2026-10", 4.7, 15);
  assert.equal(u.elecUnits, 100); assert.equal(u.elecBilled, 800); assert.equal(u.elecCost, 470);
});

test("forecast counts running leases and vacant potential", () => {
  const f = forecast([{ id: "l", roomId: "r1", tenantId: "t", status: "active", endDate: null, rent: 3500, acFee: 500, internet: 0, parking: 0 }],
    [{ id: "r1", number: "101", kind: "monthly", status: "occupied", rentMonthly: 3500 }, { id: "r2", number: "102", kind: "monthly", status: "vacant", rentMonthly: 4000 }]);
  assert.equal(f.monthly, 4000); assert.equal(f.rows[0].current, 48000); assert.equal(f.rows[4].full, 480000);
});

test("alerts: overdue first, lease ending, billing not done, vacancy", () => {
  const a = buildAlerts({ bills: [bill({ dueDate: "2026-09-01" })], today: "2026-11-26", billedThisPeriod: 0, monthlyLeases: 2, daysLeft: null,
    leases: [{ id: "l", roomId: "r1", tenantId: "t", status: "active", endDate: "2026-12-10", rent: 0, acFee: 0, internet: 0, parking: 0 }],
    rooms: [{ id: "r1", number: "101", kind: "monthly", status: "occupied", rentMonthly: 0 }, { id: "r2", number: "102", kind: "monthly", status: "vacant", rentMonthly: 0 }],
    maintenance: [{ id: "m", roomNumber: "101", problem: "แอร์", status: "open", createdOn: "2026-11-01" }] });
  assert.equal(a[0].level, "urgent"); assert.match(a[0].title, /ห้อง 101 ค้าง/);
  assert.ok(a.some((x) => x.key === "billing")); assert.ok(a.some((x) => x.key === "vacant")); assert.ok(a.some((x) => x.key === "maint-m"));
});

test("drafts", () => {
  assert.equal(reminderDraft({ roomNumber: "101", tenantName: "คุณ สมศรี", period: "2026-10", dueDate: "2026-11-05", balance: 2900 }, 3, { name: "วิไลเพลส" }).tone, "gentle");
  assert.equal(reminderDraft({ roomNumber: "101", tenantName: "", period: "2026-10", dueDate: "2026-11-05", balance: 2900 }, 45, { name: "ว" }).tone, "formal");
  assert.match(vacancyDraft({ number: "102", floor: "1", rentMonthly: 4000, deposit: 0 }, { name: "ว", address: "", phone: "+66625055446", lineId: "@x" }), /0625055446 · LINE @x/);
  assert.deepEqual(periodsBack("2027-01", 3), ["2026-11", "2026-12", "2027-01"]);
});

import { parseImport } from "./import.ts";
test("excel import parses rooms, tenants and meters; reports bad lines", () => {
  const { rows, errors } = parseImport([
    ["101", "1", "รายเดือน", "3,500", 0, 7000, "สมชาย", "081-234-5678", "2026-01-01", 8, 18, 5, 1234, 456],
    ["102", "", "", 3500, "", "", "", "", "", "", "", "", "", ""],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["101", "1", "รายเดือน", 1, 0, 0],
    ["201", "2", "โรงแรม", 1, 0, 0],
    ["202", "2", "รายวัน", 0, 600, 0, "นาย ก"],
    ["301", "3", "รายเดือน", 1, 0, 0, "", "", "", "", "", "", 5, ""],
    ["999", "9", "รายเดือน", 1, 0, 0],
  ], ["999"]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].tenant, { fullName: "สมชาย", phone: "0812345678", startDate: "2026-01-01", elecRate: 8, waterRate: 18, dueDay: 5 });
  assert.equal(rows[0].rentMonthly, 3500);
  assert.deepEqual(rows[0].meter, { elec: 1234, water: 456 });
  assert.equal(rows[1].kind, "monthly");
  assert.equal(rows[1].floor, "1");
  assert.equal(errors.length, 5);
  assert.match(errors[0], /แถว 5: ห้อง 101 ซ้ำ/);
});

import { createHmac } from "node:crypto";
import { validLineSignature, reminderKind, billText } from "./line.ts";
test("LINE signature, reminder days and bill text", () => {
  const body = '{"events":[]}';
  const sig = createHmac("sha256", "s3cret").update(body).digest("base64");
  assert.equal(validLineSignature(body, sig, "s3cret"), true);
  assert.equal(validLineSignature(body, sig, "other"), false);
  assert.equal(validLineSignature(body, null, "s3cret"), false);
  assert.equal(reminderKind("2026-11-10", "2026-11-07"), "due_soon");
  assert.equal(reminderKind("2026-11-10", "2026-11-11"), "overdue");
  assert.equal(reminderKind("2026-11-10", "2026-11-17"), "overdue");
  assert.equal(reminderKind("2026-11-10", "2026-11-12"), null);
  const t = billText({ roomNumber: "101", period: "2026-10", total: 4200, paid: 200, dueDate: "2026-11-05", publicToken: "abc" }, "วิไล", "https://x.app");
  assert.match(t, /ยอดชำระ 4,000 บาท/);
  assert.match(t, /5 พ\.ย\. 69/);
  assert.match(t, /https:\/\/x\.app\/b\/abc/);
});

import { parseMeterLabel, meterItem, amountItem } from "./billing.ts";
test("bill editor helpers: meter labels and rebuilt lines", () => {
  assert.deepEqual(parseMeterLabel("ค่าไฟ (1181 → 1381)"), { base: "ค่าไฟ", prev: 1181, curr: 1381 });
  assert.deepEqual(parseMeterLabel("ค่าน้ำ (12->16)"), { base: "ค่าน้ำ", prev: 12, curr: 16 });
  assert.equal(parseMeterLabel("ค่าไฟ"), null);
  assert.deepEqual(meterItem("elec", "ค่าไฟ", 1181, 1391, 8), { kind: "elec", label: "ค่าไฟ (1181 → 1391)", qty: 210, unitPrice: 8, amount: 1680 });
  assert.equal(meterItem("water", "ค่าน้ำ", 99990, 20, 18).qty, 30);
  assert.throws(() => meterItem("elec", "ค่าไฟ", 500, 400, 8), /เลขหลังน้อยกว่าเลขก่อน/);
  assert.equal(amountItem("discount", "ส่วนลด", 1, 200).amount, -200);
  assert.equal(amountItem("rent", "ค่าเช่าห้อง", 1, 3200.5).amount, 3200.5);
});

import { roomState, readingsFor } from "./room-state.ts";
test("room state: one answer for grid, picker and sheet", () => {
  const room = { id: "r1", kind: "monthly", status: "occupied" };
  const ctx = { hasLease: true, reserved: false, bookings: [], period: "2026-11", today: "2026-11-17" };
  const bill = (o: object) => ({ id: "b", roomId: "r1", period: "2026-11", dueDate: "2026-12-05", total: 4000, paid: 0, status: "unpaid", leaseId: "l1", ...o });
  assert.equal(roomState(room, { ...ctx, bills: [] }).key, "todo");
  assert.equal(roomState(room, { ...ctx, bills: [bill({})] }).key, "due");
  assert.equal(roomState(room, { ...ctx, bills: [bill({ status: "paid", paid: 4000 })] }).key, "paid");
  const late = roomState(room, { ...ctx, bills: [bill({ period: "2026-10", dueDate: "2026-11-05" })] });
  assert.equal(late.key, "late"); assert.equal(late.lateDays, 12); assert.equal(late.owed, 4000);
  assert.equal(roomState(room, { ...ctx, hasLease: false, bills: [] }).key, "vacant");
  assert.equal(roomState({ ...room, kind: "daily" }, { ...ctx, hasLease: false, bills: [], bookings: [{ roomId: "r1", status: "checked_in", checkIn: "2026-11-16", checkOut: "2026-11-18" }] }).key, "staying");
  const rs = [{ roomId: "r1", readOn: "2026-10-31", period: "2026-10", elec: 1 }, { roomId: "r1", readOn: "2026-11-30", elec: 2 }, { roomId: "r2", readOn: "2026-10-01", elec: 9 }];
  const { prev, saved } = readingsFor(rs, "r1", "2026-11");
  assert.equal(prev?.elec, 1); assert.equal(saved?.elec, 2);
});
