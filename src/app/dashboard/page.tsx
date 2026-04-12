'use client'
import { useEffect, useState, useRef, ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Bell, Plus, ChevronRight, TrendingUp, Activity, Target, LogOut, X, ArrowLeft, Zap, DollarSign, Eye, MousePointer, Users, BarChart3, Percent, Power, Trash2, RefreshCw, Trophy, Pause, CheckCircle, Sparkles } from 'lucide-react'

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

const verdictConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  scale_up:        { label: 'เพิ่มงบ!', color: GREEN, bg: GREEN_L, icon: '🚀' },
  keep_running:    { label: 'ปล่อยต่อ', color: '#2563eb', bg: '#dbeafe', icon: '✅' },
  reduce:          { label: 'ลดงบ', color: YELLOW, bg: YELLOW_L, icon: '⚠️' },
  stop_and_delete: { label: 'หยุดเลย', color: RED, bg: RED_L, icon: '🛑' },
}

function fmt(n: number | string | undefined, d = 0) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: d })
}
function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtDateTime(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function timeRemaining(endDateStr?: string): { text: string; color: string; urgent: boolean } {
  if (!endDateStr) return { text: '—', color: MUTED, urgent: false }
  const now = new Date().getTime()
  const end = new Date(endDateStr).getTime()
  const diff = end - now
  if (diff <= 0) return { text: 'หมดเวลาแล้ว', color: RED, urgent: true }
  const totalHours = diff / (1000 * 60 * 60)
  const d = Math.floor(totalHours / 24)
  const h = Math.floor(totalHours % 24)
  if (d > 3) return { text: `เหลือ ${d} วัน`, color: GREEN, urgent: false }
  if (d >= 1) return { text: `เหลือ ${d} วัน ${h} ชม.`, color: YELLOW, urgent: false }
  if (totalHours >= 1) return { text: `เหลือ ${h} ชม.`, color: RED, urgent: true }
  return { text: 'เหลือไม่ถึง 1 ชม.', color: RED, urgent: true }
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
  const [showABView, setShowABView] = useState<string | null>(null)
  const [abTests, setAbTests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dataReason, setDataReason] = useState<string | null>(null)
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
    const [pagesRes, campaignsRes, notifsRes, abTestsRes] = await Promise.all([
      fetch('/api/pages').then(r => r.json()),
      fetch('/api/ads').then(r => r.json()),
      fetch('/api/notifications').then(r => r.json()),
      fetch('/api/ads/ab-tests').then(r => r.json()).catch(() => ({ tests: [] })),
    ])
    setPages(pagesRes.pages || [])
    setCampaigns(campaignsRes.campaigns || [])
    setSummary(campaignsRes.summary || null)
    setDataReason(campaignsRes.reason || null)
    setNotifications(notifsRes.notifications || [])
    setUnreadCount(notifsRes.unreadCount || 0)
    setAbTests(abTestsRes.tests || [])
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

  const [deleting, setDeleting] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  async function handleApplyRecommendation(campaignId: string) {
    if (applying) return
    setApplying(campaignId)
    try {
      const res = await fetch(`/api/ads/${campaignId}/apply-recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        alert(`ไม่สำเร็จ: ${data.error || 'เกิดข้อผิดพลาด'}`)
      } else {
        alert(`✅ ${data.details}`)
        loadAll()
      }
    } catch (e: any) {
      alert(`ไม่สำเร็จ: ${e.message}`)
    } finally {
      setApplying(null)
    }
  }

  const [cleaning, setCleaning] = useState(false)
  const [cleanupPreview, setCleanupPreview] = useState<any>(null)
  const [showCleanup, setShowCleanup] = useState(false)

  async function handlePreviewCleanup() {
    setShowCleanup(true); setCleanupPreview(null)
    try {
      const res = await fetch('/api/ads/cleanup')
      const d = await res.json()
      setCleanupPreview(d)
    } catch { setCleanupPreview({ count: 0, campaigns: [], error: 'โหลดข้อมูลไม่ได้' }) }
  }

  async function handleCleanup() {
    if (cleaning) return
    if (!cleanupPreview?.count) return
    setCleaning(true)
    try {
      const res = await fetch('/api/ads/cleanup', { method: 'POST' })
      const d = await res.json()
      if (d.error) { alert(`ลบไม่สำเร็จ: ${d.error}`); return }
      alert(`ล้างแอดสำเร็จ ${d.cleaned} รายการ`)
      setShowCleanup(false)
      loadAll()
    } catch (e: any) { alert(`เกิดข้อผิดพลาด: ${e.message}`) }
    finally { setCleaning(false) }
  }

  async function handleDelete(campaignId: string, campaignName: string) {
    if (deleting) return
    if (!confirm(`ลบแอด "${campaignName}" ?\n\nจะลบทั้งใน Facebook และระบบ ไม่สามารถกู้คืนได้`)) return
    setDeleting(campaignId)
    try {
      const res = await fetch(`/api/ads/${campaignId}/delete`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert(`ลบไม่สำเร็จ: ${data.error || 'เกิดข้อผิดพลาด'}`)
      } else {
        setCampaigns(prev => prev.filter(c => c.id !== campaignId))
        if (data.fbErrors) console.warn('FB delete warnings:', data.fbErrors)
      }
    } catch (e: any) {
      alert(`ลบไม่สำเร็จ: ${e.message}`)
    } finally {
      setDeleting(null)
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
          <button onClick={handlePreviewCleanup} style={{ ...btnGhost, padding: '8px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, color: RED, border: `1.5px solid rgba(220,38,38,0.2)` }}>
            <Trash2 size={14} /> ล้างแอดเก่า
          </button>
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

        {/* ── AB Tests ── */}
        {abTests.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={16} color={PRIMARY} /> AI A/B Tests
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {abTests.map((t: any) => {
                const variants = t.variants || []
                const activeCount = variants.filter((v: any) => v.status === 'active').length
                const pausedCount = variants.filter((v: any) => v.status === 'paused').length
                return (
                <div key={t.id} onClick={() => setShowABView(t.id)}
                  style={{ width: '100%', background: SURFACE, border: `1.5px solid rgba(124,58,237,0.2)`, borderRadius: 20, padding: '18px 22px', cursor: 'pointer', color: TEXT, fontFamily: 'inherit', boxShadow: SHADOW_RAISED, transition: 'all 0.2s', overflow: 'hidden', boxSizing: 'border-box' }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 36px rgba(124,58,237,0.18)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW_RAISED; e.currentTarget.style.transform = 'translateY(0)' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      {t.post_image && <img src={t.post_image} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1.5px solid rgba(124,58,237,0.15)' }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(t.post_message || t.fb_post_id || 'A/B Test').slice(0, 50)}
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, color: GREEN, background: GREEN_L, padding: '1px 9px', borderRadius: 999 }}>฿{t.total_daily_budget}/วัน</span>
                          <span>{fmtDate(t.created_at)}</span>
                          {t.totalSpend > 0 && <span>ใช้แล้ว ฿{fmt(t.totalSpend, 2)}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {activeCount > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, background: GREEN_L, padding: '3px 10px', borderRadius: 999 }}>● วิ่ง {activeCount}</span>}
                      {pausedCount > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: YELLOW, background: YELLOW_L, padding: '3px 10px', borderRadius: 999 }}>⏸ หยุด {pausedCount}</span>}
                      <span style={{ fontSize: 10, fontWeight: 800, color: t.status === 'running' ? '#7c3aed' : MUTED, background: t.status === 'running' ? '#f3e8ff' : '#f1f5f9', padding: '3px 10px', borderRadius: 999 }}>
                        {t.status === 'running' ? 'กำลังทดสอบ' : t.status === 'completed' ? 'เสร็จ' : t.status}
                      </span>
                      <ChevronRight size={14} color={MUTED} />
                    </div>
                  </div>
                  {/* Variant breakdown */}
                  {variants.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(variants.length, 4)}, minmax(0, 1fr))`, gap: 8 }}>
                      {variants.map((v: any) => {
                        const isActive = v.status === 'active'
                        const isPaused = v.status === 'paused'
                        const statusLabel = isActive ? 'กำลังวิ่ง' : isPaused ? 'หยุด' : v.status
                        const statusClr = isActive ? GREEN : isPaused ? YELLOW : MUTED
                        const start = v.startTime ? new Date(v.startTime) : new Date()
                        const end = v.endTime ? new Date(v.endTime) : new Date()
                        const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000))
                        const totalBudget = (v.dailyBudget || 0) * totalDays
                        const spendPct = totalBudget > 0 ? Math.min(100, (v.spend || 0) / totalBudget * 100) : 0
                        const barColor = spendPct > 80 ? RED : spendPct > 50 ? YELLOW : GREEN
                        return (
                          <div key={v.id} style={{
                            background: isActive ? 'linear-gradient(135deg, #f0fdf4, #dcfce7)' : isPaused ? '#fffbeb' : SURFACE2,
                            border: `1px solid ${isActive ? 'rgba(5,150,105,0.2)' : isPaused ? 'rgba(217,119,6,0.2)' : BORDER}`,
                            borderRadius: 12, padding: '10px 12px', overflow: 'hidden', minWidth: 0,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <div style={{ fontSize: 12, fontWeight: 800, color: isActive ? GREEN : isPaused ? YELLOW : TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {v.label || 'Variant'}
                              </div>
                              <span style={{ fontSize: 9, fontWeight: 700, color: statusClr, background: statusClr + '15', padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>{statusLabel}</span>
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: TEXT, marginBottom: 6 }}>฿{v.dailyBudget}<span style={{ fontSize: 10, fontWeight: 600, color: MUTED }}>/วัน</span></div>
                            {/* Budget progress bar */}
                            <div style={{ marginBottom: 5 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 3 }}>
                                <span style={{ color: MUTED, fontWeight: 600 }}>฿{fmt(v.spend || 0, 1)} / ฿{fmt(totalBudget, 0)}</span>
                                <span style={{ color: barColor, fontWeight: 700 }}>{fmt(spendPct, 1)}%</span>
                              </div>
                              <div style={{ height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: 3, width: `${spendPct}%`, background: `linear-gradient(90deg, ${barColor}, ${barColor}99)`, transition: 'width 0.5s ease' }} />
                              </div>
                            </div>
                            {v.impressions > 0 && (
                              <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>
                                {fmt(v.impressions)} imp • {fmt(v.clicks)} clicks
                              </div>
                            )}
                            {v.endTime && (() => { const tr = timeRemaining(v.endTime); return (
                              <div style={{ fontSize: 9, color: tr.color, fontWeight: 700, marginTop: 3 }}>{tr.text}</div>
                            ) })()}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )})}
            </div>
          </div>
        )}

        {/* ── Campaign List (hide AB test variants) ── */}
        {(() => {
          const standalone = campaigns.filter((c: any) => !c.test_group_id)
          return loading ? (
            <div style={{ textAlign: 'center', padding: 72, color: MUTED }}>
              <div style={{ fontSize: 38, marginBottom: 14, opacity: 0.5 }}>⏳</div>
              <p style={{ fontSize: 14, fontWeight: 600 }}>กำลังโหลด...</p>
            </div>
          ) : standalone.length === 0 && abTests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 64, background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 22, boxShadow: SHADOW_MD }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>{dataReason === 'fb_token_expired' ? '🔒' : '📢'}</div>
              <p style={{ color: MUTED, marginBottom: 8, fontSize: 15, fontWeight: 600 }}>
                {dataReason === 'fb_token_expired' ? 'Facebook Token หมดอายุ' : 'ยังไม่มีแอดใดๆ'}
              </p>
              {dataReason === 'fb_token_expired' && (
                <p style={{ color: MUTED, marginBottom: 16, fontSize: 13 }}>กรุณา Logout แล้ว Login ใหม่เพื่อต่ออายุ Token</p>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {dataReason === 'fb_token_expired' ? (
                  <button onClick={() => signOut()} style={{ ...btnPrimary, padding: '13px 32px', fontSize: 14 }}>🔄 Login ใหม่</button>
                ) : (
                  <button onClick={() => setShowModal(true)} style={{ ...btnPrimary, padding: '13px 32px', fontSize: 14 }}>+ สร้างแอดแรกเลย</button>
                )}
              </div>
            </div>
          ) : standalone.length > 0 ? (
            <>
              <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                📌 แอดปกติ <span style={{ fontSize: 11, fontWeight: 600, color: MUTED }}>({standalone.length})</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {standalone.map((c: any) => <CampaignCard key={c.id} campaign={c} onToggle={handleToggle} onDelete={handleDelete} deleting={deleting} onApply={handleApplyRecommendation} applying={applying} />)}
              </div>
            </>
          ) : null
        })()}
      </div>

      {showModal && <CreateAdModal pages={pages} onClose={() => setShowModal(false)} onSuccess={(testId) => { setShowModal(false); if (testId) setShowABView(testId); loadAll() }} />}
      {showABView && <ABTestView testId={showABView} onClose={() => { setShowABView(null); loadAll() }} />}

      {/* Cleanup Modal */}
      {showCleanup && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div style={{ background: SURFACE, border: `1.5px solid rgba(220,38,38,0.2)`, borderRadius: 22, width: '100%', maxWidth: 480, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(220,38,38,0.15)' }}>
            <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Trash2 size={18} color={RED} /> ล้างแอดที่ไม่ได้ใช้
              </h2>
              <button onClick={() => setShowCleanup(false)} style={{ ...btnGhost, padding: '7px', borderRadius: 10 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {!cleanupPreview ? (
                <div style={{ textAlign: 'center', padding: 32, color: MUTED, fontSize: 13 }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} /><br />กำลังค้นหาแอดที่ไม่ได้ใช้...
                </div>
              ) : cleanupPreview.error ? (
                <div style={{ textAlign: 'center', padding: 32, color: RED, fontSize: 13 }}>{cleanupPreview.error}</div>
              ) : cleanupPreview.count === 0 ? (
                <div style={{ textAlign: 'center', padding: 32 }}>
                  <div style={{ fontSize: 42, marginBottom: 10 }}>✨</div>
                  <p style={{ fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>สะอาดหมดแล้ว!</p>
                  <p style={{ fontSize: 12, color: MUTED }}>ไม่มีแอดที่ไม่ได้ใช้ต้องลบ</p>
                </div>
              ) : (
                <>
                  <div style={{ background: RED_L, border: '1.5px solid rgba(220,38,38,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: RED, margin: '0 0 4px' }}>พบ {cleanupPreview.count} แอดที่ไม่ได้ใช้</p>
                    <p style={{ fontSize: 11, color: MUTED, margin: 0, lineHeight: 1.5 }}>แอดเหล่านี้จะถูกลบทั้งใน Facebook และในระบบ ไม่สามารถกู้คืนได้</p>
                  </div>
                  <div style={{ maxHeight: 280, overflow: 'auto', marginBottom: 16 }}>
                    {cleanupPreview.campaigns.map((c: any) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 6, background: SURFACE2, borderRadius: 10, border: `1px solid ${BORDER}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.isABVariant && <span style={{ color: '#7c3aed', marginRight: 4 }}>[AB]</span>}
                            {c.name}
                          </div>
                          <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{c.reason}</div>
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, flexShrink: 0, padding: '2px 8px', borderRadius: 999,
                          color: c.status === 'error' ? RED : c.status === 'completed' ? GREEN : YELLOW,
                          background: c.status === 'error' ? RED_L : c.status === 'completed' ? GREEN_L : YELLOW_L,
                        }}>{c.status}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={handleCleanup} disabled={cleaning}
                    style={{
                      width: '100%', padding: '14px', border: 'none', borderRadius: 14, cursor: cleaning ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontSize: 15, fontWeight: 900,
                      background: cleaning ? '#fca5a5' : 'linear-gradient(135deg, #dc2626, #f87171)',
                      color: 'white', boxShadow: '0 6px 20px rgba(220,38,38,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                    {cleaning ? (
                      <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> กำลังลบ...</>
                    ) : (
                      <><Trash2 size={16} /> ลบทั้ง {cleanupPreview.count} แอด</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}
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
function CampaignCard({ campaign: c, onToggle, onDelete, deleting, onApply, applying }: { campaign: any; onToggle: (id: string, action: 'pause' | 'resume') => void; onDelete: (id: string, name: string) => void; deleting: string | null; onApply: (id: string) => void; applying: string | null }) {
  const isActive = c.status === 'active'
  const isPaused = c.status === 'paused'
  const campaignGoal = c.goal ? goalById(c.goal) : null
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

      {/* Top row: post image + name + status + toggle */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 14 }}>
        {/* Post thumbnail */}
        {c.post_image && (
          <a href={`/dashboard/campaign/${c.id}`} style={{ flexShrink: 0 }}>
            <img src={c.post_image} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover', border: `1.5px solid ${BORDER}` }} />
          </a>
        )}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <a href={`/dashboard/campaign/${c.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}>
            {c.campaign_name}
          </div>
          {c.post_message && (
            <div style={{ fontSize: 11, color: MUTED, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, maxWidth: '70%' }}>
              {c.post_message.slice(0, 60)}{c.post_message.length > 60 ? '...' : ''}
            </div>
          )}
          <div style={{ fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: GREEN, background: GREEN_L, padding: '2px 10px', borderRadius: 999 }}>฿{fmt(c.daily_budget)}/วัน</span>
            {campaignGoal && <span style={{ fontWeight: 700, color: campaignGoal.color, background: campaignGoal.bg, padding: '2px 10px', borderRadius: 999 }}>{campaignGoal.icon} {campaignGoal.label}</span>}
            {(() => { const tr = timeRemaining(c.end_time); return (
              <span style={{ fontWeight: 700, color: tr.color, background: tr.urgent ? RED_L : 'transparent', padding: tr.urgent ? '2px 10px' : '0', borderRadius: 999 }}>{tr.text}</span>
            ) })()}
          </div>
          <div style={{ fontSize: 10, color: MUTED, marginTop: 3, fontWeight: 500 }}>
            เริ่ม {fmtDateTime(c.start_time)} — สิ้นสุด {fmtDateTime(c.end_time)}
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
          {/* Delete button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(c.id, c.campaign_name) }}
            disabled={deleting === c.id}
            title="ลบแอด"
            style={{
              width: 34, height: 34, borderRadius: 10, border: `1.5px solid rgba(220,38,38,0.2)`,
              cursor: deleting === c.id ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: deleting === c.id ? '#fca5a5' : 'linear-gradient(145deg, #ffffff, #fff5f5)',
              color: RED, opacity: deleting === c.id ? 0.6 : 1,
              transition: 'all 0.18s',
            }}
          >
            <Trash2 size={14} />
          </button>
          <a href={`/dashboard/campaign/${c.id}`} style={{ textDecoration: 'none' }}>
            <div style={{ width: 30, height: 30, background: 'linear-gradient(145deg, #ffffff, #e8eeff)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRIMARY, border: `1px solid ${BORDER}`, cursor: 'pointer' }}>
              <ChevronRight size={15} />
            </div>
          </a>
        </div>
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

      {/* Metrics row — goal-specific */}
      {perf ? (
        <GoalMetrics perf={perf} goal={campaignGoal} />
      ) : (
        <div style={{ background: SURFACE2, borderRadius: 10, padding: '10px 14px', textAlign: 'center', fontSize: 12, color: MUTED, fontWeight: 600 }}>
          ⏳ ยังไม่มีข้อมูล performance — กดเข้าไปซิงค์ข้อมูลได้เลย
        </div>
      )}

      {/* AI summary + Apply button */}
      {analysis && (
        <div style={{ marginTop: 12, background: SURFACE2, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: TEXT }}>🤖 AI:</span> {analysis.summary}
          {rec && analysis.recommendation !== 'keep_running' && !analysis.action_taken && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApply(c.id) }}
              disabled={applying === c.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, width: '100%',
                padding: '9px 14px', borderRadius: 10, border: 'none', cursor: applying === c.id ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                background: applying === c.id
                  ? '#a5b4fc'
                  : `linear-gradient(135deg, ${rec.color}, ${rec.color}cc)`,
                color: 'white',
                boxShadow: `0 4px 14px ${rec.color}40`,
                transition: 'all 0.18s',
                justifyContent: 'center',
              }}
            >
              {applying === c.id ? (
                <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> กำลังดำเนินการ...</>
              ) : (
                <><CheckCircle size={14} /> ทำตาม AI แนะนำ — {rec.label}</>
              )}
            </button>
          )}
          {analysis.action_taken && (
            <div style={{ marginTop: 8, fontSize: 11, color: GREEN, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
              <CheckCircle size={13} /> ดำเนินการตาม AI แล้ว
            </div>
          )}
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

// ─── Goal-specific Metrics ────────────────────────────────────
function GoalMetrics({ perf, goal }: { perf: any; goal: any }) {
  const metricKeys = goal?.metrics || ['impressions', 'reach', 'clicks', 'ctr', 'cpc']
  const mm: Record<string, { label: string; icon: string; value: string; color?: string }> = {
    impressions: { label: 'Impressions', icon: '👁️', value: fmt(perf.impressions) },
    reach: { label: 'Reach', icon: '👥', value: fmt(perf.reach) },
    clicks: { label: 'Clicks', icon: '🖱️', value: fmt(perf.clicks) },
    ctr: { label: 'CTR', icon: '📊', value: `${fmt(perf.ctr, 2)}%`, color: perf.ctr >= 1.5 ? GREEN : perf.ctr >= 0.8 ? YELLOW : RED },
    cpc: { label: 'CPC', icon: '💸', value: `฿${fmt(perf.cpc, 2)}`, color: perf.cpc > 0 && perf.cpc <= 5 ? GREEN : perf.cpc <= 15 ? YELLOW : RED },
    cpm: { label: 'CPM', icon: '💰', value: `฿${fmt(perf.cpm, 2)}` },
    spend: { label: 'Spend', icon: '💵', value: `฿${fmt(perf.spend, 2)}` },
    engagement: { label: 'Engagement', icon: '❤️', value: fmt(perf.engagement || 0) },
    messages: { label: 'Messages', icon: '💬', value: fmt(perf.messages || 0) },
    frequency: { label: 'Frequency', icon: '🔁', value: fmt(perf.frequency, 2) },
  }
  const metrics = metricKeys.map((k: string) => mm[k]).filter(Boolean)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(metrics.length, 5)}, 1fr)`, gap: 8 }}>
      {metrics.map((m: any) => <MetricPill key={m.label} label={m.label} value={m.value} icon={m.icon} color={m.color} />)}
    </div>
  )
}

// ─── Goal config ───────────────────────────────────────────────
const GOALS = [
  { id: 'auto_engagement', icon: '🤖', label: 'อัตโนมัติ', desc: 'เพิ่มการมีส่วนร่วมอัตโนมัติ', color: '#4338ca', bg: '#eef2ff', metrics: ['impressions', 'engagement', 'clicks', 'ctr'] },
  { id: 'messages', icon: '💬', label: 'เพิ่มข้อความ', desc: 'ให้ลูกค้าทักมาใน Messenger', color: '#2563eb', bg: '#dbeafe', metrics: ['messages', 'clicks', 'cpc', 'ctr'] },
  { id: 'sales_messages', icon: '🛒', label: 'ยอดขายผ่านแชท', desc: 'เพิ่มยอดการซื้อผ่านข้อความ', color: '#dc2626', bg: '#fef2f2', metrics: ['messages', 'clicks', 'spend', 'cpc'] },
  { id: 'leads_messages', icon: '📋', label: 'ข้อมูลลูกค้า', desc: 'เก็บข้อมูลลูกค้าผ่าน Messenger', color: '#ea580c', bg: '#fff7ed', metrics: ['messages', 'clicks', 'cpc', 'ctr'] },
  { id: 'traffic', icon: '🌐', label: 'ผู้เยี่ยมชมเว็บ', desc: 'เพิ่มคนคลิกเข้าเว็บไซต์', color: '#059669', bg: '#d1fae5', metrics: ['clicks', 'ctr', 'cpc', 'impressions'] },
  { id: 'calls', icon: '📞', label: 'เพิ่มการโทร', desc: 'ให้คนโทรหาธุรกิจคุณ', color: '#0891b2', bg: '#ecfeff', metrics: ['clicks', 'reach', 'cpc', 'impressions'] },
  { id: 'reach', icon: '📢', label: 'เข้าถึงมากสุด', desc: 'กระจายให้คนเห็นมากที่สุด', color: '#7c3aed', bg: '#f3e8ff', metrics: ['impressions', 'reach', 'cpm', 'frequency'] },
]
const goalById = (id: string) => GOALS.find(g => g.id === id) || GOALS[0]

const INTEREST_PRESETS = [
  { id: '6003139266461', name: 'อาหาร (Food & dining)' },
  { id: '6003384545796', name: 'กาแฟ (Coffee)' },
  { id: '6003330688420', name: 'ร้านอาหาร (Restaurants)' },
  { id: '6003348604980', name: 'ชา (Tea)' },
  { id: '6003397425735', name: 'เบเกอรี่ (Bakery)' },
  { id: '6003020834693', name: 'ช้อปปิ้ง (Shopping)' },
  { id: '6003107902433', name: 'ท่องเที่ยว (Travel)' },
  { id: '6003659945983', name: 'สุขภาพ (Fitness)' },
  { id: '6003370445981', name: 'แฟชั่น (Fashion)' },
  { id: '6003602772782', name: 'ความสวยความงาม (Beauty)' },
]

// ─── Unified Create Ad Modal (AI auto A/B test) ──────────────
function CreateAdModal({ pages, onClose, onSuccess }: { pages: any[]; onClose: () => void; onSuccess: (testId?: string) => void }) {
  const [step, setStep] = useState(1)
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [selectedPost, setSelectedPost] = useState<any>(null)
  const [budget, setBudget] = useState(200)
  const [days, setDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [error, setError] = useState('')
  const [aiPlan, setAiPlan] = useState<any>(null)

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
    try {
      const res = await fetch('/api/ads/create-ab-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId: selectedPost.id, pageId: selectedPage.id,
          pageToken: selectedPage.access_token, pageName: selectedPage.name,
          pageCategory: selectedPage.category, postMessage: selectedPost.message,
          postImage: selectedPost.full_picture, dailyBudget: budget || undefined,
          days: days || undefined,
          existingReactions: selectedPost.reactions?.summary?.total_count || 0,
          existingShares: selectedPost.shares?.count || 0,
        }),
      })
      const d = await res.json(); setSubmitting(false)
      if (!res.ok || d.error) { setError(d.error || 'เกิดข้อผิดพลาด'); return }
      setAiPlan(d); setStep(4)
    } catch (err: any) { setSubmitting(false); setError(err.message || 'เกิดข้อผิดพลาด') }
  }

  const totalSteps = 4
  const stepNames = ['เลือก Page', 'เลือกโพสต์', 'ตั้งงบ & ยิงแอด', 'AI สร้างแอดแล้ว!']
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, fontWeight: 700, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 26, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(67,56,202,0.22)' }}>
        <div style={{ padding: '24px 26px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 14px' }}>🚀 ยิงแอดใหม่</h2>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                <div key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: s <= step ? 'linear-gradient(90deg, #4338ca, #818cf8)' : '#e2e8f0', transition: 'all 0.3s' }} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: 0, fontWeight: 600 }}>ขั้นที่ {step}/{totalSteps} — {stepNames[step - 1]}</p>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: '7px', borderRadius: 10, marginLeft: 14 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 26px 28px' }}>
          {error && <div style={{ background: RED_L, border: `1.5px solid rgba(220,38,38,0.25)`, borderRadius: 11, padding: '10px 15px', marginBottom: 15, fontSize: 13, color: RED, fontWeight: 600 }}>❌ {error}</div>}

          {/* Step 1: Page */}
          {step === 1 && (
            <div>
              <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 13, padding: '12px 16px', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: GREEN }}>🤖 AI จะสร้าง 3-4 กลุ่มเป้าหมายทดสอบอัตโนมัติ</span>
                <div style={{ fontSize: 11, color: '#166534', marginTop: 4, lineHeight: 1.6 }}>เลือกโพสต์ ตั้งงบ แล้ว AI จะอ่านเนื้อหาโพสต์แล้วสร้างแอดหลายแบบให้ทดสอบเอง</div>
              </div>
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

          {/* Step 2: Post */}
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
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 5, fontWeight: 600 }}>{fmtDate(p.created_time)}{p.reactions?.summary?.total_count ? ` • ${p.reactions.summary.total_count} reactions` : ''}</div>
                      </div>
                    </button>
                  ))}
            </div>
          )}

          {/* Step 3: Budget & Submit */}
          {step === 3 && (
            <div>
              <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 13, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><ArrowLeft size={13} /> กลับ</button>

              {/* Selected post */}
              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: `1.5px solid rgba(67,56,202,0.2)`, borderRadius: 13, padding: '11px 15px', marginBottom: 16, display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                {selectedPost?.full_picture && <img src={selectedPost.full_picture} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: PRIMARY, fontWeight: 800, margin: '0 0 4px' }}>โพสต์ที่เลือก</p>
                  <p style={{ fontSize: 13, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{selectedPost?.message || selectedPost?.story || selectedPost?.id}</p>
                </div>
              </div>

              {/* AI info */}
              <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 13, padding: '13px 16px', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: GREEN }}>🤖 AI จะวิเคราะห์โพสต์แล้วสร้าง 3-4 แบบ</span>
                <div style={{ fontSize: 11, color: '#166534', marginTop: 4, lineHeight: 1.6 }}>แต่ละแบบมีกลุ่มเป้าหมายต่างกัน เพื่อทดสอบว่าแบบไหนได้ผลดีที่สุด</div>
              </div>

              {/* Budget */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: MUTED, fontWeight: 700, display: 'block', marginBottom: 7 }}>งบรวมต่อวัน (บาท)</label>
                <input type="number" value={budget} min={60} onChange={e => setBudget(Number(e.target.value))} style={{ ...inputStyle, fontSize: 17, fontWeight: 800 }} />
                <p style={{ fontSize: 10, color: MUTED, margin: '4px 0 0', fontWeight: 500 }}>งบจะถูกแบ่งให้แต่ละแบบอัตโนมัติ (ขั้นต่ำ 60 บาท)</p>
              </div>

              {/* Duration */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 12, color: MUTED, fontWeight: 700, display: 'block', marginBottom: 10 }}>ระยะเวลา</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 9 }}>
                  {[3, 7, 14, 30].map(d => (
                    <button key={d} onClick={() => setDays(d)} style={{ padding: '10px 0', border: days === d ? `1.5px solid rgba(67,56,202,0.4)` : `1.5px solid ${BORDER}`, borderRadius: 11, cursor: 'pointer', fontSize: 13, fontWeight: 800, fontFamily: 'inherit', background: days === d ? 'linear-gradient(135deg, #4338ca, #818cf8)' : 'linear-gradient(145deg, #ffffff, #f0f4ff)', color: days === d ? 'white' : MUTED, boxShadow: days === d ? '0 5px 18px rgba(67,56,202,0.4)' : SHADOW_SM, transition: 'all 0.18s' }}>{d} วัน</button>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)', border: `1.5px solid rgba(99,102,241,0.2)`, borderRadius: 16, padding: '16px 20px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>งบรวมต่อวัน</span><span style={{ fontWeight: 700, color: TEXT }}>฿{budget.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>ระยะเวลา</span><span style={{ fontWeight: 700, color: TEXT }}>{days} วัน</span>
                </div>
                <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 900 }}>
                  <span>งบรวมทั้งหมด</span><span style={{ color: PRIMARY }}>฿{(budget * days).toLocaleString()}</span>
                </div>
              </div>

              <button onClick={handleSubmit} disabled={submitting} style={{ width: '100%', padding: '15px', background: submitting ? '#a5b4fc' : 'linear-gradient(135deg, #4338ca, #818cf8)', color: 'white', border: 'none', borderRadius: 15, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: submitting ? 'none' : '0 7px 24px rgba(67,56,202,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'all 0.2s' }}>
                {submitting ? (
                  <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> AI กำลังวิเคราะห์ + สร้างแอด...</>
                ) : (
                  <><Zap size={18} /> ยิงแอดเลย!</>
                )}
              </button>
            </div>
          )}

          {/* Step 4: AI Results */}
          {step === 4 && aiPlan && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 17, fontWeight: 900, margin: '0 0 4px' }}>สร้างแอดสำเร็จ!</p>
                <p style={{ fontSize: 12, color: MUTED, margin: 0, fontWeight: 600 }}>AI สร้าง {aiPlan.variants.length} กลุ่มทดสอบอัตโนมัติ</p>
              </div>

              <div style={{ background: GREEN_L, border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 13, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: GREEN, fontWeight: 800, margin: '0 0 6px' }}>🤖 AI วิเคราะห์โพสต์:</p>
                <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>{aiPlan.postAnalysis}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                <div style={{ background: SURFACE2, borderRadius: 14, padding: '12px', textAlign: 'center', boxShadow: SHADOW_SM }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: PRIMARY }}>{aiPlan.totalDailyBudget}</div>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>บาท/วัน</div>
                </div>
                <div style={{ background: SURFACE2, borderRadius: 14, padding: '12px', textAlign: 'center', boxShadow: SHADOW_SM }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: PRIMARY }}>{aiPlan.days}</div>
                  <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>วัน</div>
                </div>
              </div>

              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>กลุ่มเป้าหมายที่สร้าง:</p>
              {aiPlan.variants.map((v: any, i: number) => (
                <div key={i} style={{ background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8, boxShadow: SHADOW_SM }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: PRIMARY }}>{v.label}</span>
                    <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>฿{v.budget}/วัน</span>
                  </div>
                  <p style={{ fontSize: 11, color: MUTED, margin: 0, fontWeight: 500 }}>{v.strategy}</p>
                </div>
              ))}

              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: MUTED, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>ระบบจะเปรียบเทียบผลอัตโนมัติ แจ้งเตือนว่าแบบไหนดีที่สุด แบบที่แย่จะถูกแนะนำให้หยุด</p>
              </div>

              <button onClick={() => onSuccess(aiPlan.testGroupId)}
                style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #059669, #34d399)', color: 'white', border: 'none', borderRadius: 15, cursor: 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: '0 7px 24px rgba(5,150,105,0.4)' }}>
                ดูผลแอดทดสอบ
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── AB Test View (Real-time Comparison) ──────────────────────
function ABTestView({ testId, onClose }: { testId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [comparing, setComparing] = useState(false)
  const [comparison, setComparison] = useState<any>(null)
  const [error, setError] = useState('')
  const [applyingAB, setApplyingAB] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => { loadTestData() }, [testId])

  async function loadTestData() {
    setLoading(true)
    try {
      const res = await fetch(`/api/ads/ab-test/${testId}`)
      const d = await res.json()
      if (d.error) setError(d.error); else setData(d)
    } catch { setError('โหลดข้อมูลไม่ได้') }
    finally { setLoading(false) }
  }

  async function requestComparison() {
    setComparing(true); setError('')
    try {
      const res = await fetch(`/api/ads/ab-test/${testId}`, { method: 'POST' })
      const d = await res.json()
      if (d.error) setError(d.error); else { setComparison(d.comparison); loadTestData() }
    } catch { setError('เปรียบเทียบไม่ได้') }
    finally { setComparing(false) }
  }

  async function applyReallocation() {
    if (applyingAB || !comparison) return
    setApplyingAB(true)
    try {
      const res = await fetch(`/api/ads/ab-test/${testId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comparison }),
      })
      const d = await res.json()
      if (!res.ok || d.error) {
        setError(d.error || 'เกิดข้อผิดพลาด')
      } else {
        setApplied(true)
        const successCount = d.actions?.filter((a: any) => a.success).length || 0
        alert(`✅ จัดสรรงบตาม AI สำเร็จ ${successCount} รายการ\n\n${d.actions?.map((a: any) => `${a.label}: ${a.action}`).join('\n')}`)
        loadTestData()
      }
    } catch { setError('ไม่สามารถดำเนินการได้') }
    finally { setApplyingAB(false) }
  }

  function bestOf(variants: any[], key: string, mode: 'max'|'min' = 'max') {
    if (!variants?.length) return null
    return variants.reduce((best, v) => mode === 'max' ? ((v[key]||0) > (best[key]||0) ? v : best) : ((v[key]||0) < (best[key]||0) ? v : best), variants[0])?.id
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: SURFACE, border: `1.5px solid rgba(124,58,237,0.3)`, borderRadius: 26, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(124,58,237,0.22)' }}>
        <div style={{ padding: '16px 22px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: SURFACE, zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={18} color="#7c3aed" />
            <span style={{ fontWeight: 900, fontSize: 15 }}>A/B Test — ผลเปรียบเทียบ</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={requestComparison} disabled={comparing}
              style={{ ...btnPrimary, padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, background: 'linear-gradient(135deg, #7c3aed, #a78bfa)', boxShadow: '0 4px 16px rgba(124,58,237,0.35)' }}>
              <RefreshCw size={13} style={comparing ? { animation: 'spin 1s linear infinite' } : undefined} />
              {comparing ? 'AI วิเคราะห์...' : 'AI เปรียบเทียบ'}
            </button>
            <button onClick={onClose} style={{ ...btnGhost, padding: '7px 9px' }}><X size={16} /></button>
          </div>
        </div>
        <div style={{ padding: '16px 22px' }}>
          {loading ? <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>กำลังโหลด...</div>
          : error && !data ? <div style={{ textAlign: 'center', padding: 40, color: RED }}>{error}</div>
          : data ? (
            <>
              {error && <div style={{ background: RED_L, borderRadius: 10, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: RED, fontWeight: 600 }}>{error}</div>}

              {data.testGroup.aiAnalysis && (
                <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: `1.5px solid rgba(124,58,237,0.2)`, borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
                  <p style={{ fontSize: 11, color: '#7c3aed', fontWeight: 800, margin: '0 0 4px' }}>AI วิเคราะห์โพสต์:</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.5, fontWeight: 500 }}>{data.testGroup.aiAnalysis.analysis}</p>
                </div>
              )}

              {comparison && (
                <div style={{ background: GREEN_L, border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 14, padding: '14px 18px', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, color: GREEN, fontWeight: 800, margin: '0 0 6px' }}>AI สรุปผลเปรียบเทียบ:</p>
                  <p style={{ fontSize: 13, margin: '0 0 6px', lineHeight: 1.6, fontWeight: 500 }}>{comparison.overallSummary}</p>
                  {comparison.reallocationPlan && <p style={{ fontSize: 12, color: CYAN, margin: 0, fontWeight: 600 }}>{comparison.reallocationPlan}</p>}
                </div>
              )}

              {(data.variants || []).map((v: any) => {
                const cv = comparison?.variants?.find((c: any) => c.campaignId === v.id)
                const isWinner = data.testGroup.winningCampaignId === v.id
                const isPaused = v.status === 'paused'
                const bestCtr = bestOf(data.variants, 'ctr', 'max') === v.id
                const bestCpc = bestOf(data.variants, 'cpc', 'min') === v.id
                const vc = cv ? verdictConfig[cv.verdict] : null

                return (
                  <div key={v.id} style={{
                    background: isWinner ? GREEN_L : isPaused ? RED_L : SURFACE,
                    border: `1.5px solid ${isWinner ? 'rgba(5,150,105,0.3)' : isPaused ? 'rgba(220,38,38,0.2)' : BORDER}`,
                    borderRadius: 16, padding: '16px 18px', marginBottom: 12, boxShadow: SHADOW_SM,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isWinner && <Trophy size={15} color={GREEN} />}
                        {isPaused && <Pause size={15} color={RED} />}
                        <span style={{ fontSize: 14, fontWeight: 800, color: isWinner ? GREEN : isPaused ? RED : TEXT }}>{v.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {vc && <span style={{ fontSize: 11, fontWeight: 800, color: vc.color, background: vc.bg, padding: '3px 10px', borderRadius: 999 }}>{vc.icon} {vc.label}</span>}
                        <span style={{ fontSize: 10, color: MUTED, fontWeight: 700 }}>฿{v.dailyBudget}/วัน</span>
                      </div>
                    </div>
                    {v.strategy?.strategy && <p style={{ fontSize: 11, color: MUTED, margin: '0 0 10px', fontWeight: 500 }}>{v.strategy.strategy}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                      {[
                        ['Impressions', fmt(v.impressions), false],
                        ['Reach', fmt(v.reach), false],
                        ['Clicks', fmt(v.clicks), false],
                        ['Spend', `฿${fmt(v.spend, 1)}`, false],
                        ['CTR', `${fmt(v.ctr, 2)}%`, bestCtr],
                        ['CPC', `฿${fmt(v.cpc, 1)}`, bestCpc],
                        ['CPM', `฿${fmt(v.cpm, 1)}`, false],
                        ['Engagement', fmt(v.engagement), false],
                      ].map(([label, value, highlight]) => (
                        <div key={label as string} style={{ background: highlight ? GREEN_L : SURFACE2, borderRadius: 8, padding: '6px 8px', textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: highlight ? GREEN : TEXT }}>{value}</div>
                          <div style={{ fontSize: 9, color: MUTED, marginTop: 2, fontWeight: 600 }}>{label}</div>
                        </div>
                      ))}
                    </div>
                    {cv && (
                      <>
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 7, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${cv.score}%`, height: '100%', borderRadius: 4, background: cv.score >= 70 ? `linear-gradient(90deg, ${GREEN}, #34d399)` : cv.score >= 40 ? `linear-gradient(90deg, ${YELLOW}, #fbbf24)` : `linear-gradient(90deg, ${RED}, #f87171)` }} />
                          </div>
                          <span style={{ fontSize: 13, fontWeight: 900, color: cv.score >= 70 ? GREEN : cv.score >= 40 ? YELLOW : RED }}>{cv.score}/100</span>
                        </div>
                        {cv.reason && <p style={{ fontSize: 11, color: MUTED, margin: '8px 0 0', fontStyle: 'italic', fontWeight: 500 }}>{cv.reason}</p>}
                      </>
                    )}
                  </div>
                )
              })}

              {comparison?.shouldReallocate && (
                <div style={{ background: YELLOW_L, border: `1.5px solid rgba(217,119,6,0.25)`, borderRadius: 12, padding: '12px 16px' }}>
                  <p style={{ fontSize: 12, color: YELLOW, fontWeight: 800, margin: '0 0 4px' }}>แนะนำจัดสรรงบใหม่</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: '0 0 10px', fontWeight: 500 }}>{comparison.reallocationPlan}</p>
                  {!applied ? (
                    <button
                      onClick={applyReallocation}
                      disabled={applyingAB}
                      style={{
                        width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none',
                        cursor: applyingAB ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                        background: applyingAB ? '#a5b4fc' : 'linear-gradient(135deg, #d97706, #f59e0b)',
                        color: 'white', boxShadow: '0 4px 14px rgba(217,119,6,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        transition: 'all 0.18s',
                      }}
                    >
                      {applyingAB ? (
                        <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> กำลังจัดสรรงบ...</>
                      ) : (
                        <><CheckCircle size={14} /> จัดสรรงบตาม AI แนะนำ</>
                      )}
                    </button>
                  ) : (
                    <div style={{ fontSize: 12, color: GREEN, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <CheckCircle size={14} /> จัดสรรงบตาม AI เรียบร้อยแล้ว
                    </div>
                  )}
                </div>
              )}

              {/* Per-variant apply buttons */}
              {comparison && !comparison.shouldReallocate && comparison.variants?.some((cv: any) => cv.verdict !== 'keep_running') && !applied && (
                <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: `1.5px solid rgba(67,56,202,0.2)`, borderRadius: 12, padding: '12px 16px' }}>
                  <p style={{ fontSize: 12, color: PRIMARY, fontWeight: 800, margin: '0 0 8px' }}>ดำเนินการตาม AI</p>
                  <button
                    onClick={applyReallocation}
                    disabled={applyingAB}
                    style={{
                      width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none',
                      cursor: applyingAB ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                      background: applyingAB ? '#a5b4fc' : 'linear-gradient(135deg, #4338ca, #818cf8)',
                      color: 'white', boxShadow: '0 4px 14px rgba(67,56,202,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}
                  >
                    {applyingAB ? (
                      <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> กำลังดำเนินการ...</>
                    ) : (
                      <><CheckCircle size={14} /> ทำตาม AI แนะนำทั้งหมด</>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
