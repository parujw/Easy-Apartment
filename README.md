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

## สิ่งที่ทำแล้ว

- โครงสร้าง Firestore + security rules: หลายหอพักในระบบเดียว แยกข้อมูลกัน,
  โหมดอ่านอย่างเดียวเมื่อหมดอายุ (ผ่อนผัน 3 วัน), กันจองห้องรายวันซ้อน (1 เอกสารต่อคืน),
  เลขเอกสารรันทีละ 1, ลูกค้าแก้ plan/วันหมดอายุเองไม่ได้, ค่าต่ออายุเขียนได้จาก server เท่านั้น,
  หน้าบิลสาธารณะเปิดด้วย token
- สูตรบิลรายเดือน (มิเตอร์) และรายวัน (จำนวนคืน), QR PromptPay สร้างเองในระบบ, ราคา/การต่ออายุ
- หน้าแรกแสดงราคา, สมัคร/เข้าสู่ระบบด้วยเบอร์โทร, แท็บห้อง (สีตามสถานะการเงิน)

## ยังไม่ได้ทำ

จดมิเตอร์และออกบิลแบบชุด, รับชำระ, ผู้เช่า/สัญญา, การจองรายวัน, ค่าใช้จ่าย/งานซ่อม, ตั้งค่า,
ต่ออายุด้วย QR + ยืนยันอัตโนมัติ (ต้องใช้ server ที่มี Firebase Admin), ยืนยันเบอร์ด้วย OTP, LINE OA (ส่งบิล/เตือน/รับสลิป), ซิงก์ iCal, ย้ายข้อมูลวิไลเพลส
