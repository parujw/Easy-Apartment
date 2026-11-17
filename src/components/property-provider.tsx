"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot, type Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { switchProperty } from "@/lib/ops";
import type { PlanId } from "@/lib/plans";

export type Property = {
  id: string; name: string; plan: PlanId; paidUntil: Timestamp | null; introUsed: boolean;
  promptpayId: string; accountName: string; phone: string; address: string; docPrefix: string;
  /** invoice header/footer and payment box — same fields as the V3 invoice */
  nameEn?: string; preparedBy?: string; payMethod?: string; accountNo?: string; payReference?: string; payNote?: string;
  /** LINE account tenants send meter slips / payment slips to */
  lineId?: string; lineUrl?: string;
  photo?: string; elecCostPerUnit?: number; waterCostPerUnit?: number;
  /** building defaults used for every new tenancy (owner can still agree a special price per tenant) */
  defaultElecRate?: number; defaultWaterRate?: number; defaultDueDay?: number;
  members?: Record<string, "owner" | "assistant" | "viewer">;
};

export type Role = "owner" | "assistant" | "viewer";
type Value = { uid: string; property: Property; role: Role; propertyIds: string[] };
const Ctx = createContext<Value | null>(null);

export function useProperty() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProperty outside PropertyProvider");
  return v;
}

/** Guards the app screens: signed-out users go to /login; loads the user's property live. */
export default function PropertyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [value, setValue] = useState<Value | null>(null);
  const [missing, setMissing] = useState<"" | "none" | "pending">("");
  const [others, setOthers] = useState<string[]>([]);

  useEffect(() => {
    let stopProperty = () => {};
    let stopInner = () => {};
    const stopAuth = onAuthStateChanged(auth(), async (user) => {
      stopProperty(); stopInner();
      if (!user) { router.replace("/login"); return; }
      stopProperty = onSnapshot(doc(db(), "users", user.uid), async (profile) => {
        const pid = profile.data()?.propertyId as string | undefined;
        const propertyIds = (profile.data()?.propertyIds as string[] | undefined) ?? (pid ? [pid] : []);
        setOthers(propertyIds.filter((id) => id !== pid));
        if (!pid) { setMissing("none"); return; }
        stopInner();
        const watch = () => onSnapshot(doc(db(), "properties", pid), (snap) => {
          if (!snap.exists()) { setMissing("none"); return; }
          const property = { id: snap.id, ...(snap.data() as Omit<Property, "id">) };
          const role = property.members?.[user.uid] ?? ((snap.data() as { ownerUid?: string }).ownerUid === user.uid ? "owner" : null);
          if (!role) { setMissing("pending"); return; }
          setMissing("");
          setValue({ uid: user.uid, property, role, propertyIds });
        }, () => {
          // Not a member yet (join request waiting): a denied listener stops, so look again shortly.
          setMissing("pending");
          const t = setTimeout(() => { stopInner = watch(); }, 5000);
          stopInner = () => clearTimeout(t);
        });
        stopInner = watch();
      });
    });
    return () => { stopAuth(); stopProperty(); stopInner(); };
  }, [router]);

  if (missing === "pending") return (
    <div className="space-y-3 p-4">
      <p>ส่งคำขอเข้าร่วมแล้ว รอเจ้าของหออนุมัติ แล้วหน้านี้จะเปิดให้อัตโนมัติ</p>
      {others.length > 0 && (
        <button className="min-h-12 rounded-xl px-4 font-semibold ring-1 ring-black/15" onClick={() => switchProperty(others[0])}>กลับไปอาคารเดิม</button>
      )}
    </div>
  );
  if (missing === "none") return <p className="p-4">ไม่พบข้อมูลหอพักของบัญชีนี้</p>;
  if (!value) return <p className="text-muted">กำลังโหลด…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
