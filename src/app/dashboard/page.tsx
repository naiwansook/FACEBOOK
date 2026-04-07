'use client'
import { useEffect, useState, useRef, ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Bell, Plus, ChevronRight, TrendingUp, Activity, Target, LogOut, X, ArrowLeft, Zap, DollarSign, Eye, MousePointer, Users, BarChart3, Percent, Power, Trash2, RefreshCw, Trophy, Pause, CheckCircle } from 'lucide-react'

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

export default function Dashboard() {
  const { data: session } = useSession()
  const [pages, setPages] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotif, setShowNotif] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showABModal, setShowABModal] = useState(false)
  const [showABView, setShowABView] = useState<string | null>(null)
  const [abTests, setAbTests] = useState<any[]>([])
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
    const [pagesRes, campaignsRes, notifsRes, abTestsRes] = await Promise.all([
      fetch('/api/pages').then(r => r.json()),
      fetch('/api/ads').then(r => r.json()),
      fetch('/api/notifications').then(r => r.json()),
      fetch('/api/ads/ab-tests').then(r => r.json()).catch(() => ({ tests: [] })),
    ])
    setPages(pagesRes.pages || [])
    setCampaigns(campaignsRes.campaigns || [])
    setSummary(campaignsRes.summary || null)
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

  const [cleaning, setCleaning] = useState(false)
  async function handleCleanup() {
    if (cleaning) return
    setCleaning(true)
    try {
      const res = await fetch('/api/ads/cleanup', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        alert(`ลบ campaigns ค้างแล้ว ${data.deleted?.length || 0} รายการ`)
        loadAll()
      } else {
        alert(`ไม่สำเร็จ: ${data.error}`)
      }
    } catch (e: any) { alert(e.message) }
    finally { setCleaning(false) }
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
          <button onClick={() => setShowABModal(true)} style={{ ...btnPrimary, padding: '9px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)', boxShadow: '0 6px 22px rgba(124,58,237,0.42)' }}>
            <Zap size={15} /> AI A/B Test
          </button>
          <button onClick={() => setShowModal(true)} style={{ ...btnPrimary, padding: '9px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Plus size={15} /> ยิงแอดใหม่
          </button>
          <button onClick={handleCleanup} disabled={cleaning} style={{ ...btnGhost, padding: '8px 14px', fontSize: 12, fontWeight: 700, color: RED, borderColor: 'rgba(220,38,38,0.2)' }}>
            <Trash2 size={13} /> {cleaning ? 'กำลังลบ...' : 'ล้าง FB ค้าง'}
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
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 10, color: MUTED }}>📄 เพจที่จัดการ ({pages.length})</h3>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(pages.length, 3)}, 1fr)`, gap: 10 }}>
              {pages.map((p: any) => (
                <div key={p.id} style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '12px 14px', boxShadow: SHADOW_SM, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {p.picture?.data?.url ? (
                    <img src={p.picture.data.url} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg, #4338ca, #818cf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>{(p.name || '?')[0]}</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>
                      {p.category || ''}{p.fan_count ? ` • ${fmt(p.fan_count)} likes` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Main Ad List (grouped by AB Test / Post) ── */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 72, color: MUTED }}>
            <div style={{ fontSize: 38, marginBottom: 14, opacity: 0.5 }}>⏳</div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>กำลังโหลด...</p>
          </div>
        ) : abTests.length === 0 && campaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64, background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 22, boxShadow: SHADOW_MD }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>📢</div>
            <p style={{ color: MUTED, marginBottom: 24, fontSize: 15, fontWeight: 600 }}>ยังไม่มีแอดใดๆ</p>
            <button onClick={() => setShowABModal(true)} style={{ ...btnPrimary, padding: '13px 32px', fontSize: 14 }}>+ สร้างแอดแรกเลย</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* AB Test Groups — each is a post with 3-4 variants */}
            {abTests.map((t: any) => (
              <AdGroupCard key={t.id} test={t} onOpen={() => setShowABView(t.id)} />
            ))}

            {/* Standalone campaigns (not part of AB test) */}
            {campaigns.filter((c: any) => !c.test_group_id).map((c: any) => (
              <CampaignCard key={c.id} campaign={c} onToggle={handleToggle} onDelete={handleDelete} deleting={deleting} onApply={handleApplyRecommendation} applying={applying} />
            ))}
          </div>
        )}
      </div>

      {showModal && <BoostModal pages={pages} onClose={() => setShowModal(false)} onSuccess={loadAll} />}
      {showABModal && <ABTestModal pages={pages} onClose={() => setShowABModal(false)} onSuccess={(testId) => { setShowABModal(false); setShowABView(testId); loadAll() }} />}
      {showABView && <ABTestView testId={showABView} onClose={() => { setShowABView(null); loadAll() }} />}
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

// ─── Ad Group Card (grouped by post) ──────────────────────────
function AdGroupCard({ test, onOpen }: { test: any; onOpen: () => void }) {
  const isRunning = test.status === 'running'
  const totalBudget = test.total_daily_budget * (test.duration_days || 7)
  const totalSpend = test.totals?.spend || 0
  const spendPercent = totalBudget > 0 ? Math.min(100, totalSpend / totalBudget * 100) : 0

  return (
    <div
      onClick={onOpen}
      style={{
        background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 20,
        padding: '20px 24px', boxShadow: SHADOW_RAISED, cursor: 'pointer',
        transition: 'all 0.2s',
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 10px 36px rgba(67,56,202,0.18)'; e.currentTarget.style.transform = 'translateY(-3px)' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = SHADOW_RAISED; e.currentTarget.style.transform = 'translateY(0)' }}
    >
      {/* Row 1: Page name + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4338ca, #818cf8)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white', fontWeight: 800, flexShrink: 0 }}>
            {(test.page_name || '?')[0]}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: PRIMARY }}>{test.page_name || 'ไม่ทราบเพจ'}</div>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{fmtDate(test.created_at)}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 800, padding: '4px 13px', borderRadius: 999,
            color: isRunning ? GREEN : test.status === 'completed' ? '#2563eb' : MUTED,
            background: isRunning ? GREEN_L : test.status === 'completed' ? '#dbeafe' : '#f1f5f9',
            border: `1px solid ${isRunning ? GREEN : test.status === 'completed' ? '#2563eb' : MUTED}30`,
          }}>
            {isRunning ? '● กำลังวิ่ง' : test.status === 'completed' ? '✅ เสร็จ' : test.status === 'evaluating' ? '🔍 ประเมิน' : test.status}
          </span>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(145deg, #ffffff, #e8eeff)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: PRIMARY, border: `1px solid ${BORDER}` }}>
            <ChevronRight size={14} />
          </div>
        </div>
      </div>

      {/* Row 2: Post content */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        {test.post_image && (
          <img src={test.post_image} alt="" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: `1.5px solid ${BORDER}` }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 13, fontWeight: 600, margin: '0 0 6px', lineHeight: 1.5, color: TEXT,
            overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          }}>
            {test.post_message || test.fb_post_id || 'ไม่มีข้อความ'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: MUTED, fontWeight: 600 }}>
            <span style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', color: '#7c3aed', padding: '2px 10px', borderRadius: 999, fontWeight: 800, border: '1px solid rgba(124,58,237,0.2)' }}>
              {test.variant_count || 0} แบบทดสอบ
            </span>
            <span>฿{fmt(test.total_daily_budget)}/วัน</span>
            <span>{test.duration_days} วัน</span>
          </div>
        </div>
      </div>

      {/* Row 3: Budget progress */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 5 }}>
          <span style={{ color: MUTED, fontWeight: 600 }}>ใช้จ่าย ฿{fmt(totalSpend, 2)} / ฿{fmt(totalBudget, 0)}</span>
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

      {/* Row 4: Performance summary */}
      {(test.totals?.impressions > 0 || test.totals?.reach > 0) ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          <MetricPill label="Impressions" value={fmt(test.totals.impressions)} icon="👁️" />
          <MetricPill label="Reach" value={fmt(test.totals.reach)} icon="👥" />
          <MetricPill label="Clicks" value={fmt(test.totals.clicks)} icon="🖱️" />
          <MetricPill label="ใช้ไป" value={`฿${fmt(test.totals.spend, 2)}`} icon="💸" />
        </div>
      ) : (
        <div style={{ background: SURFACE2, borderRadius: 10, padding: '10px 14px', textAlign: 'center', fontSize: 12, color: MUTED, fontWeight: 600 }}>
          ⏳ ยังไม่มีข้อมูล — กดเข้าไปดูรายละเอียดแต่ละแบบทดสอบ
        </div>
      )}

      {/* Row 5: Variant mini badges */}
      {test.variants && test.variants.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
          {test.variants.map((v: any) => (
            <span key={v.id} style={{
              fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
              background: v.status === 'active' ? GREEN_L : v.status === 'paused' ? YELLOW_L : '#f1f5f9',
              color: v.status === 'active' ? GREEN : v.status === 'paused' ? YELLOW : MUTED,
              border: `1px solid ${v.status === 'active' ? GREEN : v.status === 'paused' ? YELLOW : MUTED}25`,
            }}>
              {v.variant_label || v.campaign_name}
              {v.perf?.spend ? ` • ฿${fmt(v.perf.spend, 1)}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Goal config ───────────────────────────────────────────────
const GOALS = [
  { id: 'messages', icon: '💬', label: 'ลูกค้าทักมา', desc: 'เพิ่มข้อความใน Messenger', color: '#2563eb', bg: '#dbeafe' },
  { id: 'traffic', icon: '🏪', label: 'มาที่ร้าน/เว็บ', desc: 'เพิ่มคนคลิกเข้ามา', color: '#059669', bg: '#d1fae5' },
  { id: 'reach', icon: '📢', label: 'เข้าถึงคนมากสุด', desc: 'กระจายให้คนเห็นมากที่สุด', color: '#7c3aed', bg: '#f3e8ff' },
]

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

// ─── Boost Modal (AI auto-targeting) ──────────────────────────
function BoostModal({ pages, onClose, onSuccess }: { pages: any[]; onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState(1)
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [selectedPost, setSelectedPost] = useState<any>(null)
  const MIN_BUDGET = 120 // 3 variants × 40 baht minimum
  const [budget, setBudget] = useState(MIN_BUDGET)
  const [days, setDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [error, setError] = useState('')
  const [aiResult, setAiResult] = useState<any>(null)

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
    const res = await fetch('/api/ads/create-ab-test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: selectedPost.id, pageId: selectedPage.id,
        pageToken: selectedPage.access_token, pageName: selectedPage.name,
        pageCategory: selectedPage.category,
        postMessage: selectedPost.message,
        postImage: selectedPost.full_picture,
        existingReactions: selectedPost.reactions?.summary?.total_count || 0,
        existingComments: 0,
        existingShares: selectedPost.shares?.count || 0,
        dailyBudget: budget, days,
      }),
    })
    const d = await res.json(); setSubmitting(false)
    if (!res.ok || d.error) { setError(d.error || 'เกิดข้อผิดพลาด'); return }
    setAiResult(d)
    setStep(4) // Show AI result
  }

  const totalSteps = 4
  const steps = ['เลือก Page', 'เลือกโพสต์', 'งบ & ยิงแอด', 'AI สร้างแอดแล้ว!']
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, fontWeight: 700, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: SURFACE, border: `1.5px solid ${BORDER}`, borderRadius: 26, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(67,56,202,0.22)' }}>
        <div style={{ padding: '24px 26px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 14px' }}>🚀 ยิงแอดใหม่</h2>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map(s => (
                <div key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: s <= step ? `linear-gradient(90deg, #4338ca, #818cf8)` : '#e2e8f0', transition: 'all 0.3s' }} />
              ))}
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: 0, fontWeight: 600 }}>ขั้นที่ {step}/{totalSteps} — {steps[step - 1]}</p>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: '7px', borderRadius: 10, marginLeft: 14 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 26px 28px' }}>
          {error && <div style={{ background: RED_L, border: `1.5px solid rgba(220,38,38,0.25)`, borderRadius: 11, padding: '10px 15px', marginBottom: 15, fontSize: 13, color: RED, fontWeight: 600 }}>❌ {error}</div>}

          {/* Step 1: Page */}
          {step === 1 && (
            <div>
              {pages.length === 0 ? <div style={{ textAlign: 'center', padding: '36px 0', color: MUTED, fontSize: 13, fontWeight: 600 }}>ไม่พบ Page</div> : pages.map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedPage(p); fetchPosts(p); setStep(2) }}
                  style={{ width: '100%', padding: '15px 18px', marginBottom: 9, background: 'linear-gradient(145deg, #ffffff, #f5f7ff)', border: `1.5px solid ${BORDER}`, borderRadius: 14, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', boxShadow: SHADOW_RAISED, display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.18s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = BORDER2; e.currentTarget.style.background = PRIMARY_LIGHT }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = 'linear-gradient(145deg, #ffffff, #f5f7ff)' }}>
                  {p.picture?.data?.url ? <img src={p.picture.data.url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ fontSize: 20 }}>📄</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{p.category || ''}{p.fan_count ? ` • ${fmt(p.fan_count)} likes` : ''}</div>
                  </div>
                  <ChevronRight size={16} color={MUTED} />
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
                        <div style={{ fontSize: 10, color: MUTED, marginTop: 5, fontWeight: 600, display: 'flex', gap: 10, alignItems: 'center' }}>
                          {fmtDate(p.created_time)}
                          {p.reactions?.summary?.total_count > 0 && <span>❤️ {p.reactions.summary.total_count}</span>}
                          {p.comments?.summary?.total_count > 0 && <span>💬 {p.comments.summary.total_count}</span>}
                          {p.shares?.count > 0 && <span>🔄 {p.shares.count}</span>}
                        </div>
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
              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', border: `1.5px solid rgba(67,56,202,0.2)`, borderRadius: 13, padding: '11px 15px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: PRIMARY, fontWeight: 800, margin: '0 0 5px' }}>โพสต์ที่เลือก</p>
                <p style={{ fontSize: 13, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{selectedPost?.message || selectedPost?.story || selectedPost?.id}</p>
              </div>

              {/* AI info */}
              <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 13, padding: '13px 16px', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: GREEN }}>🤖 AI จะสร้าง 3-4 แอดทดสอบอัตโนมัติ</span>
                <div style={{ fontSize: 11, color: '#166534', marginTop: 4, lineHeight: 1.6 }}>AI จะอ่านเนื้อหาโพสต์แล้วสร้างแอด 3-4 แบบที่ targeting ต่างกัน เพื่อทดสอบว่าแบบไหนได้ผลดีที่สุด</div>
              </div>

              {/* Budget */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: MUTED, fontWeight: 700, display: 'block', marginBottom: 7 }}>งบต่อวัน (บาท) — ขั้นต่ำ ฿{MIN_BUDGET}</label>
                <input type="number" value={budget || ''} min={MIN_BUDGET} onChange={e => setBudget(Number(e.target.value) || 0)} style={{ ...inputStyle, fontSize: 17, fontWeight: 800 }} />
                {budget < MIN_BUDGET && <p style={{ fontSize: 11, color: RED, margin: '5px 0 0', fontWeight: 700 }}>งบขั้นต่ำ ฿{MIN_BUDGET} (AI สร้าง 3 แบบ × ฿40 ขั้นต่ำ/แบบ)</p>}
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
                  <span style={{ fontWeight: 600 }}>งบต่อวัน</span><span style={{ fontWeight: 700, color: TEXT }}>฿{budget.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: MUTED, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>ระยะเวลา</span><span style={{ fontWeight: 700, color: TEXT }}>{days} วัน</span>
                </div>
                <div style={{ height: 1, background: BORDER, margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 900 }}>
                  <span>งบรวม</span><span style={{ color: PRIMARY }}>฿{(budget * days).toLocaleString()}</span>
                </div>
              </div>

              <button onClick={handleSubmit} disabled={submitting || budget < MIN_BUDGET} style={{ width: '100%', padding: '15px', background: (submitting || budget < MIN_BUDGET) ? '#a5b4fc' : 'linear-gradient(135deg, #4338ca, #818cf8)', color: 'white', border: 'none', borderRadius: 15, cursor: (submitting || budget < MIN_BUDGET) ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: submitting ? 'none' : '0 7px 24px rgba(67,56,202,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'all 0.2s' }}>
                {submitting ? (
                  <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> AI กำลังสร้าง 3-4 แอดทดสอบ...</>
                ) : (
                  <><Zap size={18} /> ยิงแอด! (AI สร้าง 3 แบบทดสอบ • ฿{Math.round(budget / 3)}/แบบ)</>
                )}
              </button>
            </div>
          )}

          {/* Step 4: AI AB Test Result */}
          {step === 4 && aiResult && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🎯</div>
                <p style={{ fontSize: 17, fontWeight: 900, margin: '0 0 4px' }}>AI สร้าง {aiResult.variants?.length || 0} แอดทดสอบ!</p>
                <p style={{ fontSize: 12, color: MUTED, margin: 0, fontWeight: 600 }}>กำลังทดสอบเป้าหมายที่แตกต่างกัน</p>
              </div>

              {/* AI Post Analysis */}
              {aiResult.postAnalysis && (
                <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)', border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 13, padding: '13px 16px', marginBottom: 14 }}>
                  <p style={{ fontSize: 12, color: GREEN, fontWeight: 800, margin: '0 0 4px' }}>🤖 AI วิเคราะห์โพสต์:</p>
                  <p style={{ fontSize: 12, margin: 0, lineHeight: 1.6, fontWeight: 500, color: '#166534' }}>{aiResult.postAnalysis}</p>
                </div>
              )}

              {/* Variants */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                {(aiResult.variants || []).map((v: any, i: number) => (
                  <div key={i} style={{ background: 'linear-gradient(145deg, #ffffff, #f5f7ff)', border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: '14px 16px', boxShadow: SHADOW_SM }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: TEXT }}>{v.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, background: 'linear-gradient(135deg, #4338ca, #818cf8)', color: 'white', padding: '3px 10px', borderRadius: 999 }}>฿{v.budget}/วัน</span>
                    </div>
                    <p style={{ fontSize: 11, color: MUTED, margin: 0, fontWeight: 600 }}>{v.strategy}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: 'linear-gradient(135deg, #eef2ff, #ede9fe)', border: `1.5px solid rgba(99,102,241,0.2)`, borderRadius: 13, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: PRIMARY, fontWeight: 700, textAlign: 'center' }}>
                💡 ระบบจะเปรียบเทียบผลทุก 12 ชม. แล้วบอกว่าแบบไหนดี/ไม่ดี อัตโนมัติ
              </div>

              <button onClick={() => { onClose(); onSuccess() }}
                style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #059669, #34d399)', color: 'white', border: 'none', borderRadius: 15, cursor: 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: '0 7px 24px rgba(5,150,105,0.4)' }}>
                ดูผลทดสอบ
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── AI A/B Test Modal ────────────────────────────────────────
function ABTestModal({ pages, onClose, onSuccess }: { pages: any[]; onClose: () => void; onSuccess: (testId: string) => void }) {
  const [step, setStep] = useState(1)
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [selectedPost, setSelectedPost] = useState<any>(null)
  const [budget, setBudget] = useState(0)
  const [days, setDays] = useState(0)
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
    } catch { setError('ดึงโพสต์ไม่ได้') }
    finally { setLoadingPosts(false) }
  }

  async function handleAnalyze() {
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

  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 14px', background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 10, color: TEXT, fontSize: 14, fontWeight: 700, boxSizing: 'border-box', fontFamily: 'inherit', outline: 'none' }
  const stepNames = ['เลือก Page', 'เลือกโพสต์', 'ตั้งงบ (หรือให้ AI เลือก)', 'AI สร้าง Variants แล้ว!']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: SURFACE, border: `1.5px solid rgba(124,58,237,0.3)`, borderRadius: 26, width: '100%', maxWidth: 540, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(124,58,237,0.22)' }}>
        <div style={{ padding: '24px 26px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}><Zap size={20} color="#7c3aed" /> AI A/B Test</h2>
            <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
              {[1,2,3,4].map(s => <div key={s} style={{ flex: 1, height: 5, borderRadius: 3, background: s <= step ? 'linear-gradient(90deg, #7c3aed, #a78bfa)' : '#e2e8f0' }} />)}
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: 0, fontWeight: 600 }}>ขั้นที่ {step}/4 — {stepNames[step-1]}</p>
          </div>
          <button onClick={onClose} style={{ ...btnGhost, padding: '7px', borderRadius: 10, marginLeft: 14 }}><X size={18} /></button>
        </div>
        <div style={{ padding: '18px 26px 28px' }}>
          {error && <div style={{ background: RED_L, border: `1.5px solid rgba(220,38,38,0.25)`, borderRadius: 11, padding: '10px 15px', marginBottom: 15, fontSize: 13, color: RED, fontWeight: 600 }}>{error}</div>}

          {step === 1 && (
            <div>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 12, fontWeight: 600 }}>AI จะอ่านข้อมูลจากเพจและโพสต์ แล้วสร้าง 3-4 กลุ่มเป้าหมายทดสอบอัตโนมัติ</p>
              {pages.map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedPage(p); fetchPosts(p); setStep(2) }}
                  style={{ width: '100%', padding: '15px 18px', marginBottom: 9, background: 'linear-gradient(145deg, #ffffff, #f5f3ff)', border: `1.5px solid rgba(124,58,237,0.15)`, borderRadius: 14, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 700, fontFamily: 'inherit', boxShadow: SHADOW_SM, display: 'flex', alignItems: 'center', gap: 12 }}>
                  {p.picture?.data?.url ? <img src={p.picture.data.url} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ fontSize: 20 }}>📄</span>}
                  <div style={{ flex: 1 }}>
                    <div>{p.name}</div>
                    <div style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{p.category || ''}{p.fan_count ? ` • ${fmt(p.fan_count)} likes` : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 13, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><ArrowLeft size={13} /> กลับ</button>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 13, fontWeight: 600 }}>เลือกโพสต์จาก <strong style={{ color: TEXT }}>{selectedPage?.name}</strong></p>
              {loadingPosts ? <div style={{ textAlign: 'center', padding: 36, color: MUTED, fontSize: 13 }}>กำลังโหลดโพสต์...</div> :
              posts.map((p: any) => (
                <button key={p.id} onClick={() => { setSelectedPost(p); setStep(3) }}
                  style={{ width: '100%', padding: '13px 15px', marginBottom: 8, background: 'linear-gradient(145deg, #ffffff, #f5f7ff)', border: `1.5px solid ${BORDER}`, borderRadius: 13, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 13, display: 'flex', gap: 11, alignItems: 'flex-start', fontFamily: 'inherit', boxShadow: SHADOW_SM }}>
                  {p.full_picture && <img src={p.full_picture} alt="" style={{ width: 48, height: 48, borderRadius: 9, objectFit: 'cover', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, fontWeight: 600 }}>{p.message || p.story || 'ไม่มีข้อความ'}</div>
                    <div style={{ fontSize: 10, color: MUTED, marginTop: 4, fontWeight: 600, display: 'flex', gap: 10, alignItems: 'center' }}>
                      {fmtDate(p.created_time)}
                      {p.reactions?.summary?.total_count > 0 && <span>❤️ {p.reactions.summary.total_count}</span>}
                      {p.comments?.summary?.total_count > 0 && <span>💬 {p.comments.summary.total_count}</span>}
                      {p.shares?.count > 0 && <span>🔄 {p.shares.count}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 3 && (
            <div>
              <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 13, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}><ArrowLeft size={13} /> กลับ</button>
              <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', border: `1.5px solid rgba(124,58,237,0.2)`, borderRadius: 13, padding: '13px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: '#7c3aed', fontWeight: 800, margin: '0 0 4px' }}>ตั้งงบเอง หรือปล่อยว่างให้ AI แนะนำ</p>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4, fontWeight: 600 }}>งบรวมต่อวัน (บาท)</label>
                  <input type="number" value={budget || ''} min={60} placeholder="AI แนะนำให้" onChange={e => setBudget(Number(e.target.value))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: MUTED, display: 'block', marginBottom: 4, fontWeight: 600 }}>ระยะเวลา (วัน)</label>
                  <input type="number" value={days || ''} min={1} placeholder="AI แนะนำให้" onChange={e => setDays(Number(e.target.value))} style={inputStyle} />
                </div>
              </div>
              <button onClick={handleAnalyze} disabled={submitting} style={{ width: '100%', padding: '15px', background: submitting ? '#a5b4fc' : 'linear-gradient(135deg, #7c3aed, #a78bfa)', color: 'white', border: 'none', borderRadius: 15, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: submitting ? 'none' : '0 7px 24px rgba(124,58,237,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                {submitting ? <><RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> AI กำลังวิเคราะห์ + สร้าง Variants...</> : <><Zap size={18} /> AI วิเคราะห์ + สร้างทดสอบ</>}
              </button>
            </div>
          )}

          {step === 4 && aiPlan && (
            <div>
              <div style={{ background: GREEN_L, border: '1.5px solid rgba(5,150,105,0.25)', borderRadius: 13, padding: '14px 16px', marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: GREEN, fontWeight: 800, margin: '0 0 6px' }}>AI วิเคราะห์โพสต์:</p>
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
              <p style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>AI สร้าง {aiPlan.variants.length} กลุ่มทดสอบ:</p>
              {aiPlan.variants.map((v: any, i: number) => (
                <div key={i} style={{ background: SURFACE2, border: `1.5px solid ${BORDER}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8, boxShadow: SHADOW_SM }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed' }}>{v.label}</span>
                    <span style={{ fontSize: 11, color: GREEN, fontWeight: 700 }}>฿{v.budget}/วัน</span>
                  </div>
                  <p style={{ fontSize: 11, color: MUTED, margin: 0, fontWeight: 500 }}>{v.strategy}</p>
                </div>
              ))}
              <div style={{ background: 'linear-gradient(135deg, #f5f3ff, #ede9fe)', borderRadius: 12, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: MUTED, margin: 0, lineHeight: 1.6, fontWeight: 500 }}>AI จะเปรียบเทียบผลทุก 12 ชั่วโมง แจ้งเตือนว่าแบบไหนควรเพิ่มงบ แบบไหนควรหยุด แบบที่แย่จะถูกหยุดอัตโนมัติ</p>
              </div>
              <button onClick={() => onSuccess(aiPlan.testGroupId)} style={{ width: '100%', padding: '15px', background: 'linear-gradient(135deg, #059669, #34d399)', color: 'white', border: 'none', borderRadius: 15, cursor: 'pointer', fontSize: 16, fontWeight: 900, fontFamily: 'inherit', boxShadow: '0 7px 24px rgba(5,150,105,0.4)' }}>
                ดูผล A/B Test
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
