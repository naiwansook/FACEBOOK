'use client'
import { useEffect, useState, useRef, ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Bell, Plus, ChevronRight, TrendingUp, Activity, Target, LogOut, X, ArrowLeft, Zap, DollarSign, Eye, MousePointer, Users, BarChart3, Percent, Power, RefreshCw } from 'lucide-react'

// ─── Design Tokens ─────────────────────────────────────────────
const BG = '#eef2ff', SURFACE = '#ffffff', SURFACE2 = '#f5f7ff'
const BORDER = 'rgba(99,102,241,0.13)', BORDER2 = 'rgba(99,102,241,0.22)'
const TEXT = '#1a1f3c', MUTED = '#6b7280'
const PRIMARY = '#4338ca', PRIMARY_LIGHT = '#eef2ff'
const GREEN = '#059669', GREEN_L = '#d1fae5'
const RED = '#dc2626', RED_L = '#fee2e2'
const YELLOW = '#d97706', YELLOW_L = '#fef3c7'
const CYAN = '#0891b2', CYAN_L = '#cffafe'
const SHADOW_SM = '0 2px 8px rgba(99,102,241,0.08), 0 1px 3px rgba(0,0,0,0.04)'
const SHADOW_MD = '0 4px 20px rgba(99,102,241,0.12), 0 2px 6px rgba(0,0,0,0.05)'
const SHADOW_LG = '0 8px 36px rgba(99,102,241,0.16), 0 3px 10px rgba(0,0,0,0.07)'
const SHADOW_RAISED = '4px 4px 14px rgba(99,102,241,0.13), -3px -3px 10px rgba(255,255,255,0.95)'

const btnPrimary: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 55%, #818cf8 100%)',
  color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer',
  boxShadow: '0 6px 22px rgba(67,56,202,0.42), 0 2px 6px rgba(67,56,202,0.25), inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -2px 0 rgba(0,0,0,0.14)',
  fontFamily: 'inherit', fontWeight: 700, transition: 'all 0.18s',
}
const btnGhost: React.CSSProperties = {
  background: 'linear-gradient(145deg, #ffffff 0%, #f0f4ff 100%)',
  color: MUTED, borderRadius: 10, cursor: 'pointer',
  border: `1.5px solid ${BORDER}`,
  boxShadow: '3px 3px 10px rgba(99,102,241,0.1), -2px -2px 8px rgba(255,255,255,0.9)',
  fontFamily: 'inherit', transition: 'all 0.18s', display: 'flex', alignItems: 'center',
}

const recConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  keep_running:     { label: 'ปล่อยต่อ',     color: GREEN,    bg: GREEN_L,  icon: '✅' },
  increase_budget:  { label: 'เพิ่มงบ',       color: '#2563eb', bg: '#dbeafe', icon: '💰' },
  extend_duration:  { label: 'ต่อเวลา',       color: CYAN,     bg: CYAN_L,   icon: '⏱️' },
  decrease_budget:  { label: 'ลดงบ',          color: YELLOW,   bg: YELLOW_L, icon: '⚠️' },
  change_targeting: { label: 'เปลี่ยน Target', color: '#ea580c', bg: '#ffedd5', icon: '🎯' },
  pause_ad:         { label: 'หยุดแอด',       color: RED,      bg: RED_L,    icon: '🛑' },
}

function fmt(n: number | string | undefined, d = 0) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: d })
}
function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function Dashboard() {
  const { data: session } = useSession()
  const [pages, setPages] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotif, setShowNotif] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAll()
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotif(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadAll() {
    setLoading(true)
    const [pagesRes, campaignsRes, notifsRes] = await Promise.all([
      fetch('/api/pages').then(r => r.json()),
      fetch('/api/ads').then(r => r.json()),
      fetch('/api/notifications').then(r => r.json()),
    ])
    setPages(pagesRes.pages || [])
    setCampaigns(campaignsRes.campaigns || [])
    setSummary(campaignsRes.summary || null)
    setNotifications(notifsRes.notifications || [])
    setUnreadCount(notifsRes.unreadCount || 0)
    setLoading(false)
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: 'all' }) })
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const [toggling, setToggling] = useState<string | null>(null)

  async function handleToggle(campaignId: string, action: 'pause' | 'resume') {
    if (toggling) return
    setToggling(campaignId)
    try {
      const res = await fetch(`/api/ads/${campaignId}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        alert(`ไม่สำเร็จ: ${data.error || 'เกิดข้อผิดพลาด'}`)
      } else {
        // Update local state immediately
        setCampaigns(prev => prev.map(c =>
          c.id === campaignId ? { ...c, status: action === 'pause' ? 'paused' : 'active' } : c
        ))
        // Reload all data in background
        loadAll()
      }
    } catch (e: any) {
      alert(`ไม่สำเร็จ: ${e.message}`)
    } finally {
      setToggling(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: "'Sarabun', sans-serif", position: 'relative' }}>
      {/* Grid BG */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(99,102,241,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.045) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />
      <div style={{ position: 'fixed', top: '-8%', right: '-4%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 65%)', zIndex: 0, pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(24px)', borderBottom: `1.5px solid ${BORDER}`, padding: '11px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 16px rgba(99,102,241,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 38, height: 38, background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #818cf8 100%)', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, boxShadow: '0 4px 14px rgba(67,56,202,0.4)' }}>⚡</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>FB Ads AI</div>
            {session?.user?.name && <div style={{ fontSize: 11, color: MUTED }}>{session.user.name}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button onClick={() => { setShowNotif(!showNotif); if (!showNotif && unreadCount > 0) markAllRead() }} style={{ ...btnGhost, padding: '8px 11px', position: 'relative' }}>
              <Bell size={16} />
              {unreadCount > 0 && <span style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, background: RED, borderRadius: '50%', boxShadow: '0 0 6px rgba(220,38,38,0.6)' }} />}
            </button>
            {showNotif && (
              <div style={{ position: 'absolute', right: 0, top: 50, width: 328, background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 18, zIndex: 100, boxShadow: SHADOW_LG, overflow: 'hidden' }}>
                <div style={{ padding: '13px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 800, fontSize: 13 }}>🔔 การแจ้งเตือน</span>
                  {unreadCount > 0 && <span style={{ fontSize: 11, color: PRIMARY, cursor: 'pointer', fontWeight: 700 }} onClick={markAllRead}>อ่านทั้งหมด</span>}
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: 28, textAlign: 'center', color: MUTED, fontSize: 13 }}>ยังไม่มีการแจ้งเตือน</div>
                ) : notifications.slice(0, 8).map((n: any) => (
                  <div key={n.id} style={{ padding: '11px 18px', borderBottom: `1px solid ${BORDER}`, background: n.is_read ? SURFACE : PRIMARY_LIGHT }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.55 }}>{n.message}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>{fmtDate(n.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowModal(true)} style={{ ...btnPrimary, padding: '9px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={15} /> ยิงแอดใหม่
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ ...btnGhost, padding: '8px 11px' }}><LogOut size={15} /></button>
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 960, margin: '0 auto', padding: '26px 20px' }}>

        {/* ── Summary Cards ── */}
        {summary && (
          <>
            {/* Row 1: Money overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
              <MiniCard icon={<DollarSign size={17} />} label="ใช้จ่ายทั้งหมด" value={`฿${fmt(summary.totalSpend, 2)}`} color={RED} bg={RED_L} accent="#fca5a5" />
              <MiniCard icon={<BarChart3 size={17} />} label="งบประมาณรวม" value={`฿${fmt(summary.totalBudget, 0)}`} color={PRIMARY} bg="#ede9fe" accent="#c4b5fd" />
              <MiniCard icon={<DollarSign size={17} />} label="งบคงเหลือ" value={`฿${fmt(summary.budgetRemaining, 0)}`} color={GREEN} bg={GREEN_L} accent="#6ee7b7" />
            </div>

            {/* Row 2: Performance overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
              <MiniCard icon={<Eye size={17} />} label="Impressions" value={fmt(summary.totalImpressions)} color="#7c3aed" bg="#f3e8ff" accent="#c084fc" small />
              <MiniCard icon={<Users size={17} />} label="Reach" value={fmt(summary.totalReach)} color={CYAN} bg={CYAN_L} accent="#22d3ee" small />
              <MiniCard icon={<MousePointer size={17} />} label="Clicks" value={fmt(summary.totalClicks)} color="#2563eb" bg="#dbeafe" accent="#60a5fa" small />
              <MiniCard icon={<Percent size={17} />} label="CTR เฉลี่ย" value={`${fmt(summary.avgCTR, 2)}%`} color={summary.avgCTR >= 1.5 ? GREEN : summary.avgCTR >= 0.8 ? YELLOW : RED} bg={summary.avgCTR >= 1.5 ? GREEN_L : summary.avgCTR >= 0.8 ? YELLOW_L : RED_L} accent="#fcd34d" small />
            </div>

            {/* Row 3: Campaign counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
              <MiniCard icon={<Activity size={17} />} label="แอดทั้งหมด" value={String(summary.totalCampaigns)} color={PRIMARY} bg="#ede9fe" accent="#c4b5fd" small />
              <MiniCard icon={<TrendingUp size={17} />} label="กำลังวิ่ง" value={String(summary.activeCampaigns)} color={GREEN} bg={GREEN_L} accent="#6ee7b7" small />
              <MiniCard icon={<Target size={17} />} label="หยุดชั่วคราว" value={String(summary.pausedCampaigns)} color={YELLOW} bg={YELLOW_L} accent="#fcd34d" small />
            </div>
          </>
        )}

        {/* Pages */}
        {pages.length > 0 && (
          <div style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '11px 18px', marginBottom: 20, boxShadow: SHADOW_SM, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>📄 Pages:</span>
            {pages.map((p: any) => (
              <span key={p.id} style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', color: PRIMARY, padding: '3px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, border: `1px solid rgba(67,56,202,0.2)` }}>{p.name}</span>
            ))}
          </div>
        )}

        {/* ── Campaign List ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 72, color: MUTED }}>
            <div style={{ fontSize: 38, marginBottom: 14, opacity: 0.5 }}>⏳</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>กำลังโหลด...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64, background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 22, boxShadow: SHADOW_MD }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📢</div>
            <p style={{ color: MUTED, marginBottom: 24, fontSize: 15, fontWeight: 600 }}>ยังไม่มีแอดใดๆ</p>
            <button onClick={() => setShowModal(true)} style={{ ...btnPrimary, padding: '13px 32px', fontSize: 14 }}>+ สร้างแอดแรกเลย</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {campaigns.map((c: any) => <CampaignCard key={c.id} campaign={c} onToggle={handleToggle} />)}
          </div>
        )}
      </div>

      {showModal && <BoostModal pages={pages} onClose={() => setShowModal(false)} onSuccess={loadAll} />}
    </div>
  )
}

// ─── Mini Stat Card ────────────────────────────────────────────
function MiniCard({ icon, label, value, color, bg, accent, small }: { icon: ReactNode; label: string; value: string; color: string; bg: string; accent: string; small?: boolean }) {
  return (
    <div style={{
      background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: small ? 14 : 18,
      padding: small ? '14px 16px' : '18px 20px',
      display: 'flex', alignItems: 'center', gap: small ? 12 : 16,
      boxShadow: SHADOW_RAISED, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${accent})` }} />
      <div style={{ background: bg, borderRadius: small ? 10 : 13, padding: small ? 9 : 11, color, flexShrink: 0 }}>{icon}</div>
      <div>
        <div style={{ fontSize: small ? 20 : 26, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3, fontWeight: 600 }}>{label}</div>
      </div>
    </div>
  )
}

// ─── FB Status helpers ────────────────────────────────────────
const fbStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:         { label: 'FB: ACTIVE',         color: GREEN,    bg: GREEN_L },
  PAUSED:         { label: 'FB: PAUSED',         color: YELLOW,   bg: YELLOW_L },
  CAMPAIGN_PAUSED:{ label: 'FB: Campaign หยุด',  color: YELLOW,   bg: YELLOW_L },
  ADSET_PAUSED:   { label: 'FB: AdSet หยุด',     color: YELLOW,   bg: YELLOW_L },
  PENDING_REVIEW: { label: 'FB: รอตรวจสอบ',      color: '#2563eb', bg: '#dbeafe' },
  IN_PROCESS:     { label: 'FB: กำลังประมวลผล',   color: CYAN,     bg: CYAN_L },
  DISAPPROVED:    { label: 'FB: ไม่ผ่าน',         color: RED,      bg: RED_L },
  DELETED:        { label: 'FB: ถูกลบ',           color: MUTED,    bg: '#f1f5f9' },
  UNKNOWN:        { label: 'FB: ไม่ทราบ',         color: MUTED,    bg: '#f1f5f9' },
}

// ─── Campaign Card (with metrics + FB status + toggle) ────────
function CampaignCard({ campaign: c, onToggle }: { campaign: any; onToggle: (id: string, action: 'pause' | 'resume') => void }) {
  const isActive = c.status === 'active'
  const isPaused = c.status === 'paused'
  const statusColor = isActive ? GREEN : isPaused ? YELLOW : MUTED
  const statusBg = isActive ? GREEN_L : isPaused ? YELLOW_L : '#f1f5f9'
  const statusLabel = isActive ? '● กำลังวิ่ง' : isPaused ? '⏸ หยุด' : c.status
  const perf = c.perf
  const analysis = c.analysis
  const rec = analysis ? recConfig[analysis.recommendation] : null
  const spendPercent = c.totalBudget > 0 ? Math.min(100, (perf?.spend || 0) / c.totalBudget * 100) : 0

  // Real Facebook status
  const fbOverall = c.fbStatus?.overall || null
  const fbConf = fbOverall ? (fbStatusConfig[fbOverall] || fbStatusConfig.UNKNOWN) : null

  return (
    <div style={{
      background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 20,
      padding: '20px 24px', boxShadow: SHADOW_RAISED, transition: 'all 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 36px rgba(67,56,202,0.18)'; e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW_RAISED; e.currentTarget.style.transform = 'translateY(0)' }}>

      {/* Top row: name + status + toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <a href={`/dashboard/campaign/${c.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            📌 {c.campaign_name}
          </div>
          <div style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: GREEN, background: GREEN_L, padding: '2px 10px', borderRadius: 999 }}>฿{fmt(c.daily_budget)}/วัน</span>
            <span>{fmtDate(c.start_time)} — {fmtDate(c.end_time)}</span>
          </div>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {rec && (
            <span style={{ fontSize: 10, fontWeight: 800, color: rec.color, background: rec.bg, padding: '3px 10px', borderRadius: 999 }}>
              {rec.icon} {rec.label}
            </span>
          )}
          {/* DB status badge */}
          <span style={{ fontSize: 11, fontWeight: 800, color: statusColor, background: statusBg, padding: '4px 13px', borderRadius: 999, border: `1px solid ${statusColor}35` }}>
            {statusLabel}
          </span>
          {/* Real Facebook status badge */}
          {fbConf && (
            <span style={{ fontSize: 10, fontWeight: 800, color: fbConf.color, background: fbConf.bg, padding: '3px 10px', borderRadius: 999, border: `1px solid ${fbConf.color}30` }}>
              {fbConf.label}
            </span>
          )}
          {/* Toggle button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(c.id, isActive ? 'pause' : 'resume') }}
            title={isActive ? 'หยุดแอด' : 'เปิดแอด'}
            style={{
              width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isActive
                ? 'linear-gradient(135deg, #dc2626, #f87171)'
                : 'linear-gradient(135deg, #059669, #34d399)',
              color: 'white',
              boxShadow: isActive
                ? '0 4px 12px rgba(220,38,38,0.35)'
                : '0 4px 12px rgba(5,150,105,0.35)',
              transition: 'all 0.18s',
            }}
          >
            <Power size={15} />
          </button>
          <a href={`/dashboard/campaign/${c.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ width: 30, height: 30, background: 'linear-gradient(145deg, #ffffff, #e8eeff)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRIMARY, border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
              <ChevronRight size={15} />
            </div>
          </a>
        </div>
      </div>

      {/* Budget progress bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
          <span style={{ color: MUTED, fontWeight: 600 }}>ใช้จ่าย ฿{fmt(perf?.spend || 0, 2)} / ฿{fmt(c.totalBudget, 0)}</span>
          <span style={{ color: spendPercent > 80 ? RED : spendPercent > 50 ? YELLOW : GREEN, fontWeight: 700 }}>{fmt(spendPercent, 1)}%</span>
        </div>
        <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 3,
            width: `${spendPercent}%`,
            background: spendPercent > 80 ? `linear-gradient(90deg, ${RED}, #f87171)` : spendPercent > 50 ? `linear-gradient(90deg, ${YELLOW}, #fbbf24)` : `linear-gradient(90deg, ${GREEN}, #34d399)`,
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      {/* Metrics row */}
      {perf ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          <MetricPill label="Impressions" value={fmt(perf.impressions)} icon="👁️" />
          <MetricPill label="Reach" value={fmt(perf.reach)} icon="👥" />
          <MetricPill label="Clicks" value={fmt(perf.clicks)} icon="🖱️" />
          <MetricPill label="CTR" value={`${fmt(perf.ctr, 2)}%`} icon="📊" color={perf.ctr >= 1.5 ? GREEN : perf.ctr >= 0.8 ? YELLOW : RED} />
          <MetricPill label="CPC" value={`฿${fmt(perf.cpc, 2)}`} icon="💸" color={perf.cpc > 0 && perf.cpc <= 5 ? GREEN : perf.cpc <= 15 ? YELLOW : RED} />
        </div>
      ) : (
        <div style={{ background: SURFACE2, borderRadius: 10, padding: '10px 14px', textAlign: 'center', fontSize: 12, color: MUTED, fontWeight: 600 }}>
          ⏳ ยังไม่มีข้อมูล performance — กดเข้าไปซิงค์ข้อมูลได้เลย
        </div>
      )}

      {/* AI summary */}
      {analysis && (
        <div style={{ marginTop: 12, background: SURFACE2, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: TEXT }}>🤖 AI:</span> {analysis.summary}
        </div>
      )}
    </div>
  )
}

// ─── Metric Pill ────────────────────────────────────────────────
function MetricPill({ label, value, icon, color }: { label: string; value: string; icon: string; color?: string }) {
  return (
    <div style={{ background: SURFACE2, borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: MUTED, marginBottom: 3, fontWeight: 600 }}>{icon} {label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: color || TEXT }}>{value}</div>
    </div>
  )
}

// ─── Boost Modal ────────────────────────────────────────────────
function BoostModal({ pages, onClose, onSuccess }: { pages: any[]; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(1)
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [selectedPost, setSelectedPost] = useState<any>(null)
  const [budget, setBudget] = useState(100)
  const [days, setDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [error, setError] = useState('')

  async function fetchPosts(page: any) {
    setLoadingPosts(true); setError('')
    try {
      const r = await fetch(`/api/posts?pageId=${page.id}&pageToken=${encodeURIComponent(page.access_token)}`)
      const d = await r.json()
      if (d.error) setError(d.error)
      setPosts(d.posts || [])
    } catch { setError('ดึงโพสต์ไม่ได้ กรุณาลองใหม่') }
    finally { setLoadingPosts(false) }
  }

  async function handleSubmit() {
    if (!selectedPage || !selectedPost) return
    setSubmitting(true); setError('')
    const endDate = new Date(); endDate.setDate(endDate.getDate() + days)
    const res = await fetch('/api/ads/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: selectedPost.id, pageId: selectedPage.id,
        pageToken: selectedPage.access_token, pageName: selectedPage.name,
        postMessage: selectedPost.message,
        campaignName: `Boost - ${(selectedPost.message || selectedPost.id).slice(0, 40)}`,
        dailyBudget: budget, startDate: new Date().toISOString(), endDate: endDate.toISOString(),
      }),
    })
    const d = await res.json(); setSubmitting(false)
    if (!res.ok || d.error) { setError(d.error || 'เกิดข้อผิดพลาด'); return }
    onClose(); onSuccess()
  }

  const steps = ['เลือก Page', 'เลือกโพสต์', 'ตั้งค่างบ']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 26, width: '100%', maxWidth: 500, maxHeight: '88vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(67,56,202,0.22)' }}>
        <div style={{ padding: '24px 26px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.3px' }}>🚀 ยิงแอดใหม่</h2>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: s <= step ? `linear-gradient(90deg, #4338ca, #818cf8)` : '#e2e8f0', transition: 'all 0.3s', boxShadow: s <= step ? '0 2px 8px rgba(67,56,202,0.3)' : 'none' }} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: 0, fontWeight: 600 }}>ขั้นที่ {step}/3 — {steps[step - 1]}</p>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: '7px', borderRadius: 10, marginLeft: 14 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 26px 28px' }}>
          {error && <div style={{ background: RED_L, border: `1.5px solid rgba(220,38,38,0.25)`, borderRadius: 11, padding: '10px 15px', marginBottom: 15, fontSize: 13, color: RED, fontWeight: 600 }}>❌ {error}</div>}

          {step === 1 && (
            <div>
              {pages.length === 0 ? <div style={{ textAlign: 'center', padding: '36px 0', color: MUTED, fontSize: 13, fontWeight: 600 }}>ไม่พบ Page</div> : pages.map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedPage(p); fetchPosts(p); setStep(2) }}
                  style={{ width: '100%', padding: '15px 18px', marginBottom: 9, background: 'linear-gradient(145deg, #ffffff, #f5f7ff)', border: `1.5px solid ${BORDER}`, borderRadius: 14, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', boxShadow: SHADOW_RAISED, display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = BORDER2; e.currentTarget.style.background = PRIMARY_LIGHT }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = 'linear-gradient(145deg, #ffffff, #f5f7ff)' }}>
                  <span>📄 {p.name}</span><ChevronRight size={16} color={MUTED} />
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 13, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><ArrowLeft size={13} /> กลับ</button>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 13, fontWeight: 600 }}>โพสต์จาก <strong style={{ color: TEXT }}>{selectedPage?.name}</strong></p>
              {loadingPosts ? <div style={{ textAlign: 'center', padding: 36, color: MUTED, fontSize: 13 }}>⏳ กำลังโหลด...</div>
                : posts.length === 0 ? <div style={{ textAlign: 'center', padding: 36, color: MUTED, fontSize: 13, fontWeight: 600 }}>ไม่พบโพสต์</div>
                  : posts.map((p: any) => (
                    <button key={p.id} onClick={() => { setSelectedPost(p); setStep(3) }}
                      style={{ width: '100%', padding: '13px 15px', marginBottom: 8, background: 'linear-gradient(145deg, #ffffff, #f5f7ff)', border: `1.5px solid ${BORDER}`, borderRadius: 13, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 13, display: 'flex', gap: 11, alignItems: 'flex-start', fontFamily: 'inherit', boxShadow: SHADOW_SM, transition: 'all 0.18s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = BORDER2; e.currentTarget.style.background = PRIMARY_LIGHT }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = 'linear-gradient(145deg, #ffffff, #f5f7ff)' }}>
                      {p.full_picture && <img src={p.full_picture} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', flexShrink: 0, border: `1px solid ${BORDER}` }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, lineHeight: 1.55, fontWeight: 600 }}>{p.message || p.story || 'ไม่มีข้อความ'}</div>
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 5, fontWeight: 600 }}>{fmtDate(p.created_time)}</div>
                      </div>
                    </button>
                  ))}
            </div>
          )}

          {step === 3 && (
            <div>
              <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 13, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><ArrowLeft size={13} /> กลับ</button>
              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: `1.5px solid rgba(67,56,202,0.2)`, borderRadius: 13, padding: '11px 15px', marginBottom: 18 }}>
                <p style={{ fontSize: 11, color: PRIMARY, fontWeight: 800, margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>โพสต์ที่เลือก</p>
                <p style={{ fontSize: 13, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{selectedPost?.message || selectedPost?.story || selectedPost?.id}</p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: MUTED, fontWeight: 700, display: 'block', marginBottom: 7 }}>งบต่อวัน (บาท)</label>
                <input type="number" value={budget} min={20} onChange={e => setBudget(Number(e.target.value))} style={{ width: '100%', padding: '12px 16px', background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 11, color: TEXT, fontSize: 17, fontWeight: 800, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, color: MUTED, fontWeight: 700, display: 'block', marginBottom: 10 }}>ระยะเวลา</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }}>
                  {[3, 7, 14, 30].map(d => (
                    <button key={d} onClick={() => setDays(d)} style={{ padding: '10px 0', border: days === d ? `1.5px solid rgba(67,56,202,0.4)` : `1.5px solid ${BORDER}`, borderRadius: 11, cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', background: days === d ? 'linear-gradient(135deg, #4338ca, #818cf8)' : 'linear-gradient(145deg, #ffffff, #f0f4ff)', color: days === d ? 'white' : MUTED, boxShadow: days === d ? '0 5px 18px rgba(67,56,202,0.4)' : SHADOW_SM, transition: 'all 0.18s' }}>{d} วัน</button>
                  ))}
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)', border: `1.5px solid rgba(99,102,241,0.2)`, borderRadius: 16, padding: '16px 20px', marginBottom: 22 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED, marginBottom: 7 }}>
                  <span style={{ fontWeight: 600 }}>งบต่อวัน</span><span style={{ fontWeight: 700, color: TEXT }}>฿{budget.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: MUTED, marginBottom: 12 }}>
                  <span style={{ fontWeight: 600 }}>ระยะเวลา</span><span style={{ fontWeight: 700, color: TEXT }}>{days} วัน</span>
                </div>
                <div style={{ height: 1, background: BORDER, marginBottom: 12 }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 900 }}>
                  <span>งบรวม</span><span style={{ color: PRIMARY }}>฿{(budget * days).toLocaleString()}</span>
                </div>
              </div>
              <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '15px', background: submitting ? '#a5b4fc' : 'linear-gradient(135deg, #4338ca, #818cf8)', color: 'white', border: 'none', borderRadius: 15, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: submitting ? 'none' : '0 7px 24px rgba(67,56,202,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'all 0.2s' }}>
                <Zap size={18} />{submitting ? 'กำลังสร้างแอดใน Facebook...' : '⚡ ยิงแอดเลย!'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
