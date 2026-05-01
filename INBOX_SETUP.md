# 💬 Inbox Setup — ฟีเจอร์ตอบแชทเพจ

คู่มือเปิดใช้งานฟีเจอร์ตอบแชทลูกค้าจากทุกเพจในที่เดียว

> ระบบยิงแอดเดิมยังคงทำงานเหมือนเดิม ไม่มีอะไรเปลี่ยน

---

## 1) รัน SQL Migration ใน Supabase

เปิด **Supabase Dashboard → SQL Editor** แล้วรันไฟล์:

```
supabase/migration_inbox.sql
```

ตรวจสอบว่ามี 4 tables ใหม่: `conversations`, `inbox_messages`, `inbox_settings`, `quick_replies`

---

## 2) เพิ่ม Permissions ใน Facebook App

ไปที่ [developers.facebook.com](https://developers.facebook.com) → App ของคุณ → **App Review → Permissions and Features** → ขอ permissions เพิ่ม:

- ✅ `pages_messaging` — ส่งข้อความ
- ✅ `pages_messaging_subscriptions` — รับ webhook

> Permissions เหล่านี้ต้องผ่าน **App Review** ก่อนใช้กับลูกค้าทั่วไป
> ระหว่างพัฒนา: ใช้ได้เลยกับ admin/developer ของ App

---

## 3) เพิ่ม Environment Variables

เพิ่มในไฟล์ `.env.local` (และใน Vercel → Project Settings → Environment Variables):

```bash
# random string — ตั้งเองอะไรก็ได้ แต่ต้องตรงกับใน FB Webhook config (ขั้น 4)
FB_WEBHOOK_VERIFY_TOKEN=สุ่มมาเอง_เช่น_abc123xyz789
```

> `FACEBOOK_CLIENT_SECRET` ที่มีอยู่แล้วจะใช้ verify webhook signature อัตโนมัติ

---

## 4) ตั้งค่า Webhook ใน Facebook App

ไปที่ FB App Dashboard → **Messenger → Settings → Webhooks** → **Add Callback URL**

| Field | ค่า |
|-------|-----|
| Callback URL | `https://YOUR_DOMAIN.vercel.app/api/webhooks/messenger` |
| Verify Token | ค่าเดียวกับ `FB_WEBHOOK_VERIFY_TOKEN` ใน step 3 |
| Subscription Fields | ☑ `messages`, ☑ `messaging_postbacks`, ☑ `message_deliveries`, ☑ `message_reads` |

> **สำหรับ local dev:** ใช้ [ngrok](https://ngrok.com) → `ngrok http 3000` → เอา HTTPS URL มาใส่

---

## 5) Logout/Login ใหม่ครั้งเดียว

เพราะเพิ่ม Facebook permissions ใหม่ ต้อง re-authorize:
- กด "ออกจากระบบ" ใน app
- Login ด้วย Facebook ใหม่ → กด **"Edit Access"** → ตรวจสอบ permissions ใหม่ติ๊กครบ

---

## 6) เปิดใช้งาน Inbox

1. เข้า `/dashboard/inbox` (หรือกดเมนู **"กล่องข้อความ"** ใน sidebar)
2. กดปุ่ม **"Sync"** ครั้งแรก → ระบบจะดึงบทสนทนาจาก Facebook + subscribe webhook อัตโนมัติ
3. ลองส่งข้อความหาเพจจากบัญชีอื่น → ข้อความจะเด้งเข้ามาใน inbox

---

## ฟีเจอร์ที่ใช้ได้

### 📥 Inbox
- รวมทุกเพจในที่เดียว
- Filter: ทั้งหมด / ยังไม่อ่าน / ยังไม่จบ / ติดดาว / archive
- Search ลูกค้าตามชื่อ/ข้อความ
- Real-time poll ทุก 8 วินาที (+ webhook ผลักทันทีทาง DB)

### ✨ AI Assist (Claude Sonnet 4.6)
- กดปุ่ม **"AI ช่วยตอบ"** → AI ร่างคำตอบให้ 3 แบบ (สั้น/กลาง/ยาว)
- จัดหมวดหมู่อัตโนมัติ: สอบถาม / ราคา / สั่งซื้อ / ร้องเรียน / ช่วยเหลือ / สแปม
- วิเคราะห์ sentiment (😊/😐/😡) ของลูกค้า
- AI สรุปบทสนทนา 1 ประโยค
- คำสั่งพิเศษ: ตอบสั้น / ตอบละเอียด / อบอุ่น / ทางการ / ปิดการขาย

### 💬 ตอบกลับอัตโนมัติ (per page)
- เปิด/ปิด auto-reply ได้ราย page
- ตั้งเวลาทำการ (จ-อา) → นอกเวลาตอบข้อความเฉพาะ
- Throttle 1 ชม. — ไม่ตอบซ้ำลูกค้าคนเดิม

### 📚 Knowledge Base
- ใส่ข้อมูลร้าน/สินค้า/FAQ → AI ใช้อ้างอิงตอนตอบ

### ⚡ Quick Replies
- บันทึก template ตอบเร็ว เช่น `/ราคา`, `/ที่อยู่`, `/วิธีสั่งซื้อ`

---

## โครงสร้างไฟล์ใหม่

```
src/
├── lib/
│   ├── messenger.ts                              ← Send API + Webhook helpers
│   └── supabase.ts                               ← Centralized client
├── app/
│   ├── api/
│   │   ├── webhooks/messenger/route.ts           ← FB webhook receiver
│   │   └── inbox/
│   │       ├── conversations/route.ts            ← list conversations
│   │       ├── conversations/[id]/route.ts       ← detail + PATCH
│   │       ├── send/route.ts                     ← reply to customer
│   │       ├── sync/route.ts                     ← pull from FB + subscribe
│   │       ├── ai-suggest/route.ts               ← AI suggestions
│   │       ├── settings/route.ts                 ← per-page settings
│   │       └── quick-replies/route.ts            ← templates CRUD
│   └── dashboard/inbox/page.tsx                  ← UI 3 columns
supabase/
└── migration_inbox.sql                           ← schema migration
```

---

## ⚠️ ข้อจำกัด Facebook (ต้องรู้)

1. **24-hour messaging window** — ตอบลูกค้าได้ภายใน 24 ชม. นับจากข้อความล่าสุดของลูกค้า ถ้าเกินต้องใช้ `MESSAGE_TAG`
2. **Echo messages** — ข้อความที่ส่งจาก FB Page inbox จะเด้งกลับมาเป็น webhook (echo) ระบบกรองอัตโนมัติแล้ว
3. **Webhook ต้อง HTTPS** — ใช้ Vercel หรือ ngrok เท่านั้น
4. **App Review** — `pages_messaging` ต้องผ่าน review ก่อน go-live กับ user ทั่วไป

---

## Troubleshooting

**ไม่เห็นข้อความเข้ามา**
1. ตรวจ webhook subscription: FB App → Messenger → Webhooks ต้องมี Page ของคุณ + ติ๊ก fields ครบ
2. ตรวจ env: `FB_WEBHOOK_VERIFY_TOKEN` ตรงกับใน FB
3. ดู logs ใน Vercel → Function logs → `/api/webhooks/messenger`
4. ลองกดปุ่ม "Sync" ใน UI → จะ subscribe webhook ใหม่อัตโนมัติ

**ส่งข้อความไม่ได้ (error: 24h window)**
- ลูกค้ายังไม่เคยส่งข้อความหาเพจ หรือเลย 24 ชม. แล้ว
- ระบบยังไม่รองรับ Message Tags (อาจเพิ่ม Phase ถัดไป)

**AI ตอบไม่ตรง**
- เพิ่มข้อมูลใน **Knowledge Base** ใน Settings → ความรู้
- ปรับโทนใน Settings → AI
