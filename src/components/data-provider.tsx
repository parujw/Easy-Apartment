"use client";

import { createContext, useContext, useMemo } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useLive } from "@/lib/hooks";
import { addDays, todayBkk } from "@/lib/dates";
import { useProperty } from "@/components/property-provider";
import type { Bill, Booking, Lease, Room, Tenant } from "@/lib/model";

type Data = {
  rooms: Room[]; tenants: Map<string, Tenant>; leases: Lease[];
  activeLease: Map<string, Lease>; bills: Bill[]; openBills: Bill[]; bookings: Booking[];
};
const Ctx = createContext<Data | null>(null);

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}

/** One set of live listeners shared by every tab. */
export default function DataProvider({ children }: { children: React.ReactNode }) {
  const { property } = useProperty();
  const pid = property.id;
  const c = (name: string) => collection(db(), "properties", pid, name);
  const since = addDays(todayBkk(), -120);

  const rooms = useLive<Room>(c("rooms"), `${pid}/rooms`);
  const tenants = useLive<Tenant>(c("tenants"), `${pid}/tenants`);
  const leases = useLive<Lease>(c("leases"), `${pid}/leases`);
  const openBills = useLive<Bill>(query(c("bills"), where("status", "in", ["unpaid", "partial"])), `${pid}/bills/open`);
  const recentBills = useLive<Bill>(query(c("bills"), where("issueDate", ">=", since)), `${pid}/bills/${since}`);
  const bookings = useLive<Booking>(query(c("bookings"), where("checkOut", ">=", addDays(todayBkk(), -30))), `${pid}/bookings`);

  const value = useMemo<Data>(() => {
    const byId = new Map<string, Bill>();
    for (const b of [...recentBills, ...openBills]) byId.set(b.id, b);
    return {
      rooms: [...rooms].sort((a, b) => a.number.localeCompare(b.number, "th", { numeric: true })),
      tenants: new Map(tenants.map((t) => [t.id, t])),
      leases,
      activeLease: new Map(leases.filter((l) => l.status === "active").map((l) => [l.roomId, l])),
      bills: [...byId.values()].filter((b) => b.status !== "void").sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.billNo.localeCompare(a.billNo)),
      openBills: openBills.filter((b) => b.status !== "void"),
      bookings: bookings.filter((b) => b.status !== "cancelled").sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    };
  }, [rooms, tenants, leases, openBills, recentBills, bookings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
