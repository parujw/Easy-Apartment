import { supabaseServer } from "@/lib/supabase/server";
import { daysLeft } from "@/lib/plans";

export const todayBkk = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

/** The signed-in user's property (MVP: one account = one property). */
export async function currentProperty() {
  const sb = await supabaseServer();
  const { data, error } = await sb
    .from("properties")
    .select("id, name, plan, paid_until, intro_used")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data, daysLeft: daysLeft(data.paid_until, todayBkk()) };
}
