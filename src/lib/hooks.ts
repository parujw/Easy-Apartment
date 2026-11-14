"use client";

import { useEffect, useState } from "react";
import { onSnapshot, type Query } from "firebase/firestore";

/** Live list of documents for a query. Pass a stable key so the listener re-subscribes only when it changes. */
export function useLive<T extends { id: string }>(q: Query | null, key: string): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    if (!q) return;
    return onSnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<T, "id">) }) as T)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return rows;
}
