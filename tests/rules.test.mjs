// Firestore security-rule tests. Run with: npm run test:rules (starts the emulator).
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, writeBatch, Timestamp, serverTimestamp } from "firebase/firestore";

let env;
const A = "userA", B = "userB", PID = "propA";
const days = (n) => Timestamp.fromMillis(Date.now() + n * 86_400_000);

const newProperty = (uid) => ({
  name: "Hotel", phone: "", address: "", promptpayId: "", accountName: "", docPrefix: "EA",
  plan: "pro", paidUntil: null, introUsed: false, ownerUid: uid, members: { [uid]: "owner" },
  createdAt: serverTimestamp(),
});

async function seed(paidUntil) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "properties", PID), { ...newProperty(A), createdAt: Timestamp.now(), paidUntil });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-easy-apartment",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const db = (uid) => env.authenticatedContext(uid).firestore();

test("sign-up creates a property only as its sole owner with no paid time", async () => {
  await assertSucceeds(setDoc(doc(db(A), "properties", "p1"), newProperty(A)));
  await assertFails(setDoc(doc(db(A), "properties", "p2"), { ...newProperty(A), paidUntil: days(365) }));
  await assertFails(setDoc(doc(db(A), "properties", "p3"), { ...newProperty(A), members: { [A]: "owner", [B]: "owner" } }));
  await assertFails(setDoc(doc(db(B), "properties", "p4"), newProperty(A)));
});

test("owner edits branding but cannot extend the subscription", async () => {
  await seed(days(30));
  await assertSucceeds(updateDoc(doc(db(A), "properties", PID), { name: "Hotel 2" }));
  await assertFails(updateDoc(doc(db(A), "properties", PID), { paidUntil: days(999) }));
  await assertFails(updateDoc(doc(db(A), "properties", PID), { plan: "business" }));
});

test("another account cannot read or write the property", async () => {
  await seed(days(30));
  await assertFails(getDoc(doc(db(B), "properties", PID)));
  await assertFails(getDoc(doc(db(B), "properties", PID, "rooms", "r1")));
  await assertFails(setDoc(doc(db(B), "properties", PID, "rooms", "r1"), { number: "101" }));
});

test("unpaid or expired (past 3-day grace) is read-only; within grace still writable", async () => {
  await seed(null);
  await assertFails(setDoc(doc(db(A), "properties", PID, "rooms", "r1"), { number: "101" }));
  await seed(days(-5));
  await assertFails(setDoc(doc(db(A), "properties", PID, "rooms", "r1"), { number: "101" }));
  await assertSucceeds(getDoc(doc(db(A), "properties", PID, "rooms", "r1")));
  await seed(days(-2));
  await assertSucceeds(setDoc(doc(db(A), "properties", PID, "rooms", "r1"), { number: "101" }));
});

test("a booked night cannot be taken twice", async () => {
  await seed(days(30));
  const d = db(A);
  const book = (id, nights) => {
    const b = writeBatch(d);
    b.set(doc(d, "properties", PID, "bookings", id), { roomId: "r1" });
    for (const n of nights) b.set(doc(d, "properties", PID, "roomNights", `r1_${n}`), { bookingId: id });
    return b.commit();
  };
  await assertSucceeds(book("b1", ["2026-12-01", "2026-12-02"]));
  await assertFails(book("b2", ["2026-12-02", "2026-12-03"]));
  await assertSucceeds(book("b3", ["2026-12-03", "2026-12-04"]));
});

test("running numbers only go up by one", async () => {
  await seed(days(30));
  const c = doc(db(A), "properties", PID, "counters", "bill_202611");
  await assertSucceeds(setDoc(c, { value: 1 }));
  await assertSucceeds(updateDoc(c, { value: 2 }));
  await assertFails(updateDoc(c, { value: 10 }));
});

test("public bill: anyone with the token can get it, nobody can list", async () => {
  await seed(days(30));
  const token = "t".repeat(32);
  await assertSucceeds(setDoc(doc(db(A), "publicBills", token), { propertyId: PID, total: 100 }));
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, "publicBills", token)));
  await assertFails(setDoc(doc(db(B), "publicBills", "x".repeat(32)), { propertyId: PID, total: 1 }));
});

test("subscription top-ups are server-only", async () => {
  await seed(days(30));
  await assertFails(setDoc(doc(db(A), "properties", PID, "topups", "t1"), { amount: 890, status: "paid" }));
});

test("owner can edit invoice/LINE fields but still not the subscription", async () => {
  await seed(days(30));
  await assertSucceeds(updateDoc(doc(db(A), "properties", PID), { nameEn: "WILAI PLACE", accountNo: "xxx", lineId: "@x", payNote: "n" }));
  await assertFails(updateDoc(doc(db(A), "properties", PID), { nameEn: "X", paidUntil: days(999) }));
  await assertFails(updateDoc(doc(db(B), "properties", PID), { nameEn: "hijack" }));
});
