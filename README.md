# Easy Apartment

แอปบริหารห้องเช่ารายเดือน ห้องรายวัน/โรงแรม และ Airbnb แบบ subscription (เติมเงิน PromptPay)
เป็นโปรเจกต์แยกจากระบบวิไลเพลสโดยสิ้นเชิง: repo ใหม่ ฐานข้อมูล Supabase ใหม่ ไม่ใช้โค้ดหรือข้อมูลร่วมกัน

Stack: Next.js 16 (App Router) · Supabase (Postgres + Auth + RLS) · Tailwind CSS 4

## ติดตั้ง

1. สร้าง Supabase project ใหม่ (สำหรับ Easy Apartment เท่านั้น)
2. รัน `supabase/migrations/0001_init.sql` ใน SQL Editor (หรือ `supabase db push`)
3. Authentication → Providers → เปิด **Phone** (ใช้เบอร์โทรเป็น username)
   - ช่วงพัฒนา: ปิด "Confirm phone" ได้ ไม่ต้องตั้งค่า SMS
   - ก่อนเปิดขาย: ตั้งค่า SMS provider แล้วเปิด "Confirm phone" (ใช้ OTP กันการใช้สิทธิ์ 100 บาทซ้ำ)
4. คัดลอก `.env.example` เป็น `.env.local` แล้วใส่ URL และ anon key ของ project
5. `npm install` แล้ว `npm run dev`

## คำสั่ง

- `npm run dev` — เปิดเครื่องพัฒนา
- `npm test` — unit test (PromptPay QR, สูตรบิล, ราคา/การต่ออายุ)
- `npm run build` — build production

## สิ่งที่ทำแล้ว

- Schema ฐานข้อมูลครบตาม requirement: หลายหอพักในระบบเดียว แยกข้อมูลด้วย RLS,
  โหมดอ่านอย่างเดียวเมื่อหมดอายุ (ผ่อนผัน 3 วัน), กันจองห้องรายวันซ้อน, เลขเอกสารรันไม่ซ้ำ,
  ลูกค้าแก้ plan/วันหมดอายุเองไม่ได้, หน้าบิลสาธารณะผ่าน token
- สูตรบิลรายเดือน (มิเตอร์) และรายวัน (จำนวนคืน), QR PromptPay สร้างเองในระบบ, ราคา/การต่ออายุ
- หน้าแรกแสดงราคา, สมัคร/เข้าสู่ระบบด้วยเบอร์โทร, แท็บห้อง (สีตามสถานะการเงิน)

## ยังไม่ได้ทำ

จดมิเตอร์และออกบิลแบบชุด, รับชำระ, ผู้เช่า/สัญญา, การจองรายวัน, ค่าใช้จ่าย/งานซ่อม, ตั้งค่า,
ต่ออายุด้วย QR + ยืนยันอัตโนมัติ, LINE OA (ส่งบิล/เตือน/รับสลิป), ซิงก์ iCal, ย้ายข้อมูลวิไลเพลส
