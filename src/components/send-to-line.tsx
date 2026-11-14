"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR + LINE ID box at the bottom of every meter slip (same wording as V3). */
export default function SendToLine({ lineId, lineUrl }: { lineId?: string; lineUrl?: string }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (lineUrl) QRCode.toDataURL(lineUrl, { errorCorrectionLevel: "H", margin: 2, width: 396 }).then(setQr);
  }, [lineUrl]);
  if (!lineId && !lineUrl) return null;
  return (
    <div className="send">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt={`QR เพิ่มเพื่อนไลน์ ${lineId ?? ""}`} className="qr" />}
      <div className="send-body">
        <p className="send-title">ส่งกลับทางไลน์</p>
        <p>
          สแกน QR นี้ หรือค้นหาไอดี <strong className="line-id">{lineId}</strong> ในไลน์ แล้วกดเพิ่มเพื่อน
        </p>
        <p>
          แล้วถ่ายรูปใบนี้ <strong>พร้อมรูปหน้าปัดมิเตอร์</strong> ส่งมาในแชท —
          เขียนตัวเลขให้ครบทุกหลักตามที่เห็นบนหน้าปัด ถ้าเลขไม่ชัดเจ้าหน้าที่จะดูจากรูปให้
        </p>
      </div>
    </div>
  );
}
