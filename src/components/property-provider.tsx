"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot, type Timestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { PlanId } from "@/lib/plans";

export type Property = {
  id: string; name: string; plan: PlanId; paidUntil: Timestamp | null; introUsed: boolean;
  promptpayId: string; accountName: string; phone: string; address: string; docPrefix: string;
};

const Ctx = createContext<{ uid: string; property: Property } | null>(null);

export function useProperty() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProperty outside PropertyProvider");
  return v;
}

/** Guards the app screens: signed-out users go to /login; loads the user's property live. */
export default function PropertyProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [value, setValue] = useState<{ uid: string; property: Property } | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let stopProperty = () => {};
    const stopAuth = onAuthStateChanged(auth(), async (user) => {
      stopProperty();
      if (!user) { router.replace("/login"); return; }
      const profile = await getDoc(doc(db(), "users", user.uid));
      const pid = profile.data()?.propertyId as string | undefined;
      if (!pid) { setMissing(true); return; }
      stopProperty = onSnapshot(doc(db(), "properties", pid), (snap) => {
        if (snap.exists()) setValue({ uid: user.uid, property: { id: snap.id, ...(snap.data() as Omit<Property, "id">) } });
      });
    });
    return () => { stopAuth(); stopProperty(); };
  }, [router]);

  if (missing) return <p>ไม่พบข้อมูลหอพักของบัญชีนี้</p>;
  if (!value) return <p className="text-muted">กำลังโหลด…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
