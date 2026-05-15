-- ============================================
-- FB Ads AI Manager — Team / Roles Migration
-- รัน SQL นี้ใน Supabase SQL Editor (เพิ่มต่อจาก migration_inbox.sql)
-- Backward-compatible: existing single-user accounts ยังทำงานเดิม
-- รันซ้ำได้ (idempotent ทุกขั้น)
-- ============================================

-- ────────────────────────────────────────────
-- 1) page_members — สิทธิ์ของแต่ละ user ในแต่ละเพจ
--    1 row = 1 user-page-role
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES connected_pages(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','agent')),
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_page_members_user ON page_members(user_id);
CREATE INDEX IF NOT EXISTS idx_page_members_page ON page_members(page_id);
CREATE INDEX IF NOT EXISTS idx_page_members_user_role ON page_members(user_id, role);

-- ────────────────────────────────────────────
-- 2) team_invitations — token-based invite link
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,                   -- 64-char hex random
  role TEXT NOT NULL CHECK (role IN ('agent')), -- เริ่มอนุญาตแค่ agent
  page_ids UUID[] NOT NULL DEFAULT '{}',        -- connected_pages.id ที่จะให้สิทธิ์
  note TEXT,                                    -- ระบุชื่อ/หมายเหตุ (เผื่อ owner)
  expires_at TIMESTAMPTZ NOT NULL,              -- default 7-day ใน app
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON team_invitations(token);
CREATE INDEX IF NOT EXISTS idx_invites_owner ON team_invitations(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_invites_pending ON team_invitations(owner_user_id, accepted_at, revoked_at)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ────────────────────────────────────────────
-- 3) Backfill — ทุก connected_pages.user_id ปัจจุบัน = owner
-- ────────────────────────────────────────────
INSERT INTO page_members (user_id, page_id, role, invited_by, joined_at)
SELECT user_id, id, 'owner', user_id, COALESCE(created_at, NOW())
FROM connected_pages
WHERE user_id IS NOT NULL
ON CONFLICT (user_id, page_id) DO NOTHING;

-- ────────────────────────────────────────────
-- 4) Trigger — เมื่อ INSERT connected_pages ใหม่ ให้ auto-create owner row
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ensure_page_owner_member()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO page_members (user_id, page_id, role, invited_by)
    VALUES (NEW.user_id, NEW.id, 'owner', NEW.user_id)
    ON CONFLICT (user_id, page_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pages_owner_member ON connected_pages;
CREATE TRIGGER trg_pages_owner_member
  AFTER INSERT ON connected_pages
  FOR EACH ROW EXECUTE FUNCTION ensure_page_owner_member();

-- ────────────────────────────────────────────
-- 5) RLS — page_members, team_invitations
-- ────────────────────────────────────────────
ALTER TABLE page_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members_visibility" ON page_members;
CREATE POLICY "members_visibility" ON page_members FOR SELECT USING (
  user_id = auth.uid()::UUID
  OR page_id IN (
    SELECT pm.page_id FROM page_members pm
    WHERE pm.user_id = auth.uid()::UUID AND pm.role = 'owner'
  )
);

DROP POLICY IF EXISTS "invites_owner" ON team_invitations;
CREATE POLICY "invites_owner" ON team_invitations FOR ALL USING (
  owner_user_id = auth.uid()::UUID
);

-- ────────────────────────────────────────────
-- 6) RLS rewrite — page-scoped tables ให้รองรับ multi-user
--    หมายเหตุ: app ใช้ service role อยู่แล้ว → policy นี้เป็น defense-in-depth
-- ────────────────────────────────────────────

-- connected_pages: ใครเป็น member ของเพจก็ดูได้, owner เท่านั้นที่แก้/ลบ
DROP POLICY IF EXISTS "pages_own_data" ON connected_pages;
DROP POLICY IF EXISTS "pages_member_select" ON connected_pages;
DROP POLICY IF EXISTS "pages_owner_insert" ON connected_pages;
DROP POLICY IF EXISTS "pages_owner_update" ON connected_pages;
DROP POLICY IF EXISTS "pages_owner_delete" ON connected_pages;

CREATE POLICY "pages_member_select" ON connected_pages FOR SELECT USING (
  id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID)
);
CREATE POLICY "pages_owner_insert" ON connected_pages FOR INSERT WITH CHECK (
  user_id = auth.uid()::UUID
);
CREATE POLICY "pages_owner_update" ON connected_pages FOR UPDATE USING (
  id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID AND role = 'owner')
);
CREATE POLICY "pages_owner_delete" ON connected_pages FOR DELETE USING (
  id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID AND role = 'owner')
);

-- conversations: page member เข้าถึงได้
DROP POLICY IF EXISTS "conv_own_data" ON conversations;
DROP POLICY IF EXISTS "conv_member_access" ON conversations;
CREATE POLICY "conv_member_access" ON conversations FOR ALL USING (
  page_id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID)
);

-- inbox_messages: ผ่าน conversation
DROP POLICY IF EXISTS "msg_own_data" ON inbox_messages;
DROP POLICY IF EXISTS "msg_member_access" ON inbox_messages;
CREATE POLICY "msg_member_access" ON inbox_messages FOR ALL USING (
  conversation_id IN (
    SELECT c.id FROM conversations c
    WHERE c.page_id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID)
  )
);

-- inbox_settings: page member อ่านได้, owner-only แก้ (จะบังคับใน app layer)
DROP POLICY IF EXISTS "settings_own" ON inbox_settings;
DROP POLICY IF EXISTS "settings_member_access" ON inbox_settings;
CREATE POLICY "settings_member_access" ON inbox_settings FOR ALL USING (
  page_id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID)
);

-- quick_replies: page member เห็นของเพจที่เข้าถึงได้
DROP POLICY IF EXISTS "qr_own" ON quick_replies;
DROP POLICY IF EXISTS "qr_member_access" ON quick_replies;
CREATE POLICY "qr_member_access" ON quick_replies FOR ALL USING (
  page_id IN (SELECT page_id FROM page_members WHERE user_id = auth.uid()::UUID)
  OR (page_id IS NULL AND user_id IN (
    SELECT pm_owner.user_id FROM page_members pm_owner
    JOIN page_members pm_me ON pm_owner.page_id = pm_me.page_id
    WHERE pm_me.user_id = auth.uid()::UUID AND pm_owner.role = 'owner'
  ))
);

-- ad_campaigns / ad_performance / ai_analyses / ab_test_groups / notifications: owner-only
-- นโยบายเดิม (user_id = auth.uid()) ใช้งานได้เลย — agent's auth.uid() ไม่ตรงกับ owner's user_id

-- ────────────────────────────────────────────
-- 7) Realtime publication (idempotent)
-- ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'page_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE page_members;
  END IF;
END $$;
