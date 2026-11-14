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
