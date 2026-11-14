// Carry-over: unpaid balances of earlier bills move into the next bill of the SAME lease,
// and the earlier bills are marked "carried" so the debt is counted in exactly one place.
// Bills of a previous tenant of the room are never carried onto the new tenant.

type CarryBill = { id: string; leaseId: string | null; period: string; status: string; total: number; paid: number };

export function carryOverBills<T extends CarryBill>(bills: T[], leaseId: string | null, beforePeriod: string): T[] {
  if (!leaseId) return [];
  return bills.filter((b) =>
    b.leaseId === leaseId && b.period < beforePeriod && (b.status === "unpaid" || b.status === "partial") && b.total - b.paid > 0);
}

export const carryAmount = (bills: CarryBill[]) =>
  Math.round(bills.reduce((s, b) => s + (b.total - b.paid), 0) * 100) / 100;

/** Revenue billed in a set of bills, without carried-over debt (that was billed before). */
export const billedRevenue = (bills: { items: { kind: string; amount: number }[] }[]) =>
  bills.reduce((s, b) => s + b.items.filter((i) => i.kind !== "prev_balance").reduce((x, i) => x + i.amount, 0), 0);
