# Easy Apartment

แอปบริหารห้องเช่ารายเดือน ห้องรายวัน/โรงแรม และ Airbnb แบบ subscription (เติมเงิน PromptPay)
เป็นโปรเจกต์แยกจากระบบวิไลเพลสโดยสิ้นเชิง: repo ใหม่ ฐานข้อมูล Supabase ใหม่ ไม่ใช้โค้ดหรือข้อมูลร่วมกัน

Stack: Next.js 16 (App Router) · Firebase (Auth + Firestore) · Tailwind CSS 4
Firebase project: `easy-apartment`

## ติดตั้ง

1. Firebase console → Authentication → Sign-in method → เปิด **Email/Password**
   (ระบบใช้เบอร์โทรเป็น username โดยแปลงเป็นอีเมลภายใน เช่น `66812345678@phone.easy-apartment.app`)
2. Firebase console → Firestore Database → สร้างฐานข้อมูล (region `asia-southeast1` ใกล้ไทยที่สุด)
3. ค่า config ของ Web app ใส่ไว้ใน `src/lib/firebase.ts` แล้ว (เป็นค่าสาธารณะ ข้อมูลถูกป้องกันด้วย `firestore.rules`)
4. Deploy security rules: `npx firebase login` แล้ว `npx firebase deploy --only firestore`
5. `npm install` แล้ว `npm run dev`

พัฒนาในเครื่องโดยไม่แตะข้อมูลจริง: คัดลอก `.env.example` เป็น `.env.local` แล้วรัน `npx firebase emulators:start --only auth,firestore --project demo-easy-apartment`

## คำสั่ง

- `npm run dev` — เปิดเครื่องพัฒนา
- `npm test` — unit test (PromptPay QR, สูตรบิล, ราคา/การต่ออายุ)
- `npm run test:rules` — ทดสอบ Firestore security rules บน emulator (ต้องมี Java)
- `npm run build` — build production

## ฟีเจอร์

- **ห้อง** (แท็บ 1): กริดห้องตามชั้น สีตามสถานะเงิน (เกินกำหนด/รอจ่าย/จ่ายแล้ว/ว่าง/ทำความสะอาด),
  แตะห้องเพื่อดูทุกอย่างในแผ่นเดียว: บิลค้าง + รับชำระ, ส่งลิงก์บิล, ผู้เช่า/สัญญา (เพิ่ม แก้ ย้ายออก),
  ออกบิลเอง (รายสัปดาห์/กำหนดเอง), แก้ไขห้อง
- **ห้องรายวัน/Airbnb**: จอง (กันจองซ้อน), ออกบิลตามจำนวนคืน, เช็คอิน/เช็คเอาท์ → ทำความสะอาด → ว่าง,
  ซิงก์ปฏิทิน Airbnb ผ่านลิงก์ iCal
- **ออกบิล** (แท็บ 2): จดมิเตอร์ไฟ/น้ำทุกห้องในหน้าเดียว ดึงเลขครั้งก่อนให้เอง แล้วออกบิลทุกห้องในปุ่มเดียว
  พร้อมปุ่มส่ง/คัดลอกลิงก์บิลทุกห้อง
- **ลิงก์บิล** `/b/<token>`: ผู้เช่าเปิดได้โดยไม่ต้องล็อกอิน มี QR PromptPay ฝังยอดคงเหลือ, กลายเป็นใบเสร็จเมื่อจ่ายครบ, พิมพ์/บันทึก PDF ได้
- **เงิน & อื่นๆ** (แท็บ 3): สรุปรายเดือน (ออกบิล/รับเงิน/ค่าใช้จ่าย/ค้างรับ) + ดาวน์โหลด CSV,
  งานซ่อม (ปิดงานพร้อมค่าซ่อม = บันทึกค่าใช้จ่ายให้เอง), เพิ่มห้องแบบช่วง (เช่น 101-110),
  ตั้งค่าหอพัก/PromptPay, แพ็กเกจ, เปลี่ยนรหัสผ่าน
- ปุ่ม **+** ทุกหน้า: บันทึกค่าใช้จ่าย / แจ้งซ่อม
- โหมดอ่านอย่างเดียวเมื่อหมดอายุ (rules บังคับ + แถบแจ้งเตือน)

## ยังไม่ได้ทำ (ต้องมีบัญชี/คีย์ภายนอก)

- **LINE OA**: ส่งบิล/เตือน/รับสลิปอัตโนมัติ — ต้องมี LINE Official Account + Messaging API channel
  (ตอนนี้ใช้ปุ่ม “ส่งบิล” ซึ่งเปิดเมนูแชร์ของมือถือ เลือก LINE ได้)
- **ต่ออายุอัตโนมัติด้วย QR**: ต้องมีบัญชี payment gateway (เช่น Opn/Omise) และ Firebase service account
  สำหรับให้ server เขียนวันหมดอายุ (rules ไม่ให้ลูกค้าเขียนเอง)
- หน้าแอดมินจัดการลูกค้า, ยืนยันเบอร์ด้วย OTP, ตรวจสลิปอัตโนมัติ
