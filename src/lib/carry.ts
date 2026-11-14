// Carry-over: unpaid balances of earlier bills move into the next bill of the SAME lease,
// and the earlier bills are marked "carried" so the debt is counted in exactly one place.
// Bills of a previous tenant of the room are never carried onto the new tenant.

type CarryBill = { id: string; leaseId: string | null; period: string; status: string; total: number; paid: number };

export function carryOverBills<T extends CarryBill>(bills: T[], lease: string | Set<string> | null, beforePeriod: string): T[] {
  if (!lease) return [];
  const ids = typeof lease === "string" ? new Set([lease]) : lease;
  return bills.filter((b) =>
    b.leaseId !== null && ids.has(b.leaseId) && b.period < beforePeriod && (b.status === "unpaid" || b.status === "partial") && b.total - b.paid > 0);
}

/** All lease ids of one tenancy: follow transferredFrom back (room moves), like V3 tenancy.ts. */
export function tenancyLeaseIds(leases: { id: string; transferredFrom?: string }[], leaseId: string | null): Set<string> {
  const ids = new Set<string>();
  const byId = new Map(leases.map((l) => [l.id, l]));
  let cur = leaseId ? byId.get(leaseId) : undefined;
  if (leaseId) ids.add(leaseId);
  while (cur?.transferredFrom && !ids.has(cur.transferredFrom)) {
    ids.add(cur.transferredFrom);
    cur = byId.get(cur.transferredFrom);
  }
  return ids;
}

export const carryAmount = (bills: CarryBill[]) =>
  Math.round(bills.reduce((s, b) => s + (b.total - b.paid), 0) * 100) / 100;

/** Revenue billed in a set of bills, without carried-over debt (that was billed before). */
export const billedRevenue = (bills: { items: { kind: string; amount: number }[] }[]) =>
  bills.reduce((s, b) => s + b.items.filter((i) => i.kind !== "prev_balance").reduce((x, i) => x + i.amount, 0), 0);
