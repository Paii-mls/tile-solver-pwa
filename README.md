# Tile Solver PWA (MVP)

เวอร์ชันทดสอบแบบ **client-only**: อัปโหลดสกรีนช็อต → แตะไพ่ที่ "กดได้" → ระบบแนะนำใบที่ควรกดต่อ

> ข้อจำกัด: MVP ยังไม่ detect ชั้น/การทับจากภาพอัตโนมัติ จึงให้ผู้ใช้แตะเฉพาะไพ่ที่กดได้ ณ ตอนนั้น

## Run (Local)

### วิธีง่ายสุด (Node)
```bash
npx serve .
```
แล้วเปิด URL ที่แสดงใน terminal

### หรือ Python
```bash
python -m http.server 8080
```
เปิด http://localhost:8080

## Install as PWA
- เปิดผ่าน Chrome บนมือถือ
- เมนู → **Add to Home screen**

## How to test quickly
1. เปิดเกม → ถ่าย/เซฟ screenshot
2. เปิด PWA → upload
3. ปรับ slider ให้กรอบพอดีไพ่
4. แตะไพ่ที่กดได้สัก 8–12 ใบ
5. ถ้าถาดมีของอยู่แล้ว กด “เพิ่มถาด” และแตะชนิดนั้นให้ครบตามจริง
6. กด “แนะนำ” แล้วกดในเกมตามใบที่ไฮไลต์

## Next improvements (Phase 2)
- Auto-detect tile bounding boxes (OpenCV.js)
- Auto-detect open tiles via overlap+layer
- Full solver (plan to clear whole board)
