// Thai mobile "0812345678" → E.164 "+66812345678" (the phone number is the username)
export function toE164(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (/^0\d{9}$/.test(d)) return "+66" + d.slice(1);
  if (/^66\d{9}$/.test(d)) return "+" + d;
  throw new Error("กรุณากรอกเบอร์มือถือ 10 หลัก");
}
