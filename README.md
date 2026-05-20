# Tile Solver PWA (MVP v0.2)

เวอร์ชันทดสอบแบบ **client-only**:
- อัปโหลดสกรีนช็อต หรือ **วางรูปจากคลิปบอร์ด (iOS)**
- แตะไพ่ที่ "กดได้"
- ระบบแนะนำใบที่ควรกดต่อ

> ข้อจำกัด: MVP ยังไม่ detect ชั้น/การทับจากภาพอัตโนมัติ จึงให้ผู้ใช้แตะเฉพาะไพ่ที่กดได้ ณ ตอนนั้น

## Run (Local)

### Node
```bash
npx serve .
```

### Python
```bash
python -m http.server 8080
```

## Install as PWA
- เปิดผ่าน Chrome/Safari บนมือถือ (ต้องเป็น HTTPS หรือ localhost)
- เมนู → **Add to Home screen**

## Paste image on iOS
1. คัดลอกรูป (เช่น เปิดรูป screenshot แล้ว Share/Copy)
2. เปิดเว็บ → กดปุ่ม **วางรูปจากคลิปบอร์ด (iOS)**
3. ถ้า iOS ไม่อนุญาตให้อ่านคลิปบอร์ดตรง ๆ จะมีช่องข้อความโผล่ขึ้นมา
4. แตะค้างในช่องนั้น แล้วเลือก **Paste**

## Next improvements (Phase 2)
- Auto-detect tile bounding boxes (OpenCV.js)
- Auto-detect open tiles via overlap+layer
- Full solver (plan to clear whole board)
