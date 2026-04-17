-- ============================================
-- Migration: เพิ่มคอลัมน์ให้ตรงกับ Facebook Ads Manager
-- รันใน Supabase SQL Editor
-- ============================================

-- 1. เพิ่ม metrics ที่ขาด (messages, link_clicks) ลงใน ad_performance
ALTER TABLE ad_performance
  ADD COLUMN IF NOT EXISTS messages INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS calls INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS page_engagement INTEGER DEFAULT 0;

-- 2. เพิ่มฟิลด์สำหรับเก็บ FB status จริง (sync จาก Facebook)
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS fb_effective_status TEXT,
  ADD COLUMN IF NOT EXISTS fb_status_synced_at TIMESTAMPTZ;

-- 3. ขยาย status constraint ให้รองรับสถานะจาก Facebook ทั้งหมด
ALTER TABLE ad_campaigns DROP CONSTRAINT IF EXISTS ad_campaigns_status_check;
ALTER TABLE ad_campaigns ADD CONSTRAINT ad_campaigns_status_check CHECK (
  status IN ('draft','active','paused','completed','error','disapproved','pending_review','with_issues','archived','deleted')
);

-- 4. เพิ่ม index สำหรับ cron performance (ดึงเฉพาะที่ยังไม่หมดอายุ)
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_end_time
  ON ad_campaigns (status, end_time);

CREATE INDEX IF NOT EXISTS idx_ad_performance_campaign_fetched
  ON ad_performance (campaign_id, fetched_at DESC);
