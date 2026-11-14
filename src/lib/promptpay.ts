// PromptPay QR payload (EMVCo / Thai QR standard), generated locally —
// no external service, so the owner's PromptPay ID never leaves our server.

function field(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

export function crc16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Normalise a PromptPay ID: mobile (10 digits), national/tax ID (13) or e-wallet (15). */
function target(id: string): { tag: string; value: string } {
  const digits = id.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return { tag: "01", value: ("0066" + digits.slice(1)).padStart(13, "0") };
  }
  if (digits.length === 13) return { tag: "02", value: digits };
  if (digits.length === 15) return { tag: "03", value: digits };
  throw new Error("PromptPay ID ต้องเป็นเบอร์มือถือ 10 หลัก, เลขบัตร/ผู้เสียภาษี 13 หลัก หรือ e-Wallet 15 หลัก");
}

export function promptPayPayload(id: string, amount?: number): string {
  const t = target(id);
  const merchant = field("00", "A000000677010111") + field(t.tag, t.value);
  let payload =
    field("00", "01") +
    field("01", amount ? "12" : "11") +
    field("29", merchant) +
    field("58", "TH") +
    field("53", "764");
  if (amount) payload += field("54", amount.toFixed(2));
  payload += "6304";
  return payload + crc16(payload);
}
