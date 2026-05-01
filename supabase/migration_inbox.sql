-- ============================================
-- FB Ads AI Manager — Inbox Feature Migration
-- รัน SQL นี้ใน Supabase SQL Editor (เพิ่มต่อจาก schema.sql เดิม)
-- ไม่กระทบ tables เดิม (ad_campaigns ฯลฯ)
-- ============================================

-- ────────────────────────────────────────────
-- 1) conversations — 1 row ต่อ 1 บทสนทนา (per page + customer)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  page_id UUID REFERENCES connected_pages(id) ON DELETE CASCADE,

  -- Facebook IDs
  fb_page_id TEXT NOT NULL,                  -- Page ID (ตรงกับ connected_pages.page_id)
  fb_conversation_id TEXT,                   -- t_xxxxxxx (จาก /conversations API) — nullable เพราะ webhook ไม่ส่งมา
  fb_psid TEXT NOT NULL,                     -- Page-scoped User ID ของลูกค้า

  -- Customer info
  customer_name TEXT,
  customer_picture TEXT,

  -- Last message (denormalized เพื่อ list เร็ว)
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_sender TEXT CHECK (last_sender IN ('customer','page','system')),

  -- Counters
  unread_count INTEGER DEFAULT 0,

  -- AI metadata
  ai_category TEXT,                          -- 'inquiry','price','order','complaint','support','spam','other'
  ai_sentiment TEXT,                         -- 'positive','neutral','negative'
  ai_summary TEXT,                           -- AI สรุปบทสนทนา

  -- Status
  is_archived BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  is_starred BOOLEAN DEFAULT FALSE,
  tags TEXT[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(fb_page_id, fb_psid)
);

-- ────────────────────────────────────────────
-- 2) inbox_messages — ทุกข้อความ (in/out)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  -- Facebook IDs (สำหรับ dedupe)
  fb_message_id TEXT UNIQUE,                 -- mid.xxx จาก FB
  fb_sender_id TEXT NOT NULL,                -- PSID ของผู้ส่ง (ลูกค้า) หรือ Page ID (เพจ)

  -- Direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  -- inbound = customer → page, outbound = page → customer

  -- Content
  message_text TEXT,
  attachments JSONB DEFAULT '[]',            -- [{type:'image'|'video'|'file', url:'...'}]

  -- Sender meta
  sent_by TEXT,                              -- 'customer' | 'page_user' | 'page_auto' | 'page_ai'
  sent_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Status
  is_read BOOLEAN DEFAULT FALSE,
  delivery_status TEXT DEFAULT 'sent',       -- 'sending','sent','delivered','read','failed'
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- 3) inbox_settings — per-page settings
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inbox_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  page_id UUID REFERENCES connected_pages(id) ON DELETE CASCADE,

  -- AI Assistant
  ai_assist_enabled BOOLEAN DEFAULT TRUE,    -- โชว์ปุ่ม "✨ AI ช่วยตอบ"
  ai_auto_categorize BOOLEAN DEFAULT TRUE,   -- จัดหมวดหมู่อัตโนมัติ
  ai_tone TEXT DEFAULT 'friendly',           -- 'friendly','professional','casual'

  -- Auto-reply
  auto_reply_enabled BOOLEAN DEFAULT FALSE,
  auto_reply_message TEXT DEFAULT 'ขอบคุณที่ติดต่อเรา ทีมงานจะรีบตอบกลับโดยเร็วที่สุดค่ะ 🙏',

  -- Business hours (ใช้ + auto-reply นอกเวลา)
  business_hours_enabled BOOLEAN DEFAULT FALSE,
  business_hours JSONB DEFAULT '{"mon":{"start":"09:00","end":"18:00","off":false},"tue":{"start":"09:00","end":"18:00","off":false},"wed":{"start":"09:00","end":"18:00","off":false},"thu":{"start":"09:00","end":"18:00","off":false},"fri":{"start":"09:00","end":"18:00","off":false},"sat":{"start":"09:00","end":"18:00","off":true},"sun":{"start":"09:00","end":"18:00","off":true}}',
  off_hours_message TEXT DEFAULT 'ขณะนี้นอกเวลาทำการ ทีมงานจะติดต่อกลับในเวลาทำการนะคะ ⏰',

  -- Knowledge base for AI (ข้อมูลร้าน/สินค้า/FAQ)
  knowledge_base TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, page_id)
);

-- ────────────────────────────────────────────
-- 4) quick_replies — template คำตอบเร็ว
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  page_id UUID REFERENCES connected_pages(id) ON DELETE CASCADE,  -- nullable = ใช้ทุกเพจ

  shortcut TEXT NOT NULL,                    -- เช่น "/ราคา"
  title TEXT NOT NULL,                       -- ชื่อแสดง
  message TEXT NOT NULL,                     -- ข้อความเต็ม

  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_page ON conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_conv_fb_page ON conversations(fb_page_id);
CREATE INDEX IF NOT EXISTS idx_conv_psid ON conversations(fb_psid);
CREATE INDEX IF NOT EXISTS idx_conv_last_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_unread ON conversations(unread_count) WHERE unread_count > 0;

CREATE INDEX IF NOT EXISTS idx_msg_conv ON inbox_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_fb_id ON inbox_messages(fb_message_id);

CREATE INDEX IF NOT EXISTS idx_settings_user_page ON inbox_settings(user_id, page_id);
CREATE INDEX IF NOT EXISTS idx_qr_user ON quick_replies(user_id);

-- ────────────────────────────────────────────
-- Row Level Security
-- ────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conv_own_data" ON conversations FOR ALL USING (user_id = auth.uid()::UUID);
CREATE POLICY "msg_own_data" ON inbox_messages FOR ALL
  USING (conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid()::UUID));
CREATE POLICY "settings_own" ON inbox_settings FOR ALL USING (user_id = auth.uid()::UUID);
CREATE POLICY "qr_own" ON quick_replies FOR ALL USING (user_id = auth.uid()::UUID);

-- ────────────────────────────────────────────
-- Updated_at triggers
-- ────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_conv_updated ON conversations;
CREATE TRIGGER trg_conv_updated BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated ON inbox_settings;
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON inbox_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ────────────────────────────────────────────
-- Realtime: enable broadcast on these tables
-- ────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE inbox_messages;
