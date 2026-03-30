'use client'
import { useEffect, useState, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Bell, Plus, ChevronRight, TrendingUp, Activity, DollarSign, Target, LogOut, X, ArrowLeft } from 'lucide-react'

const BG = '#0a0a0f'
const CARD = 'rgba(255,255,255,0.04)'
const BORDER = 'rgba(255,255,255,0.08)'
const TEXT = '#f1f5f9'
const MUTED = '#64748b'
const PURPLE = '#6366f1'
const GREEN = '#4ade80'
const RED = '#f87171'
const YELLOW = '#facc15'
const BLUE = '#60a5fa'

const recConfig: Record<string, { label: string; color: string; icon: string }> = {
  keep_running:     { label: 'ปล่อยต่อ',         color: GREEN,  icon: '✅' },
  increase_budget:  { label: 'เพิ่มงบได้เลย',     color: BLUE,   icon: '💰' },
  extend_duration:  { label: 'ต่อระยะเวลา',       color: '#22d3ee', icon: '⏱️' },
  decrease_budget:  { label: 'ลดงบก่อน',          color: YELLOW, icon: '⚠️' },
  change_targeting: { label: 'เปลี่ยน Targeting', color: '#f97316', icon: '🎯' },
  pause_ad:         { label: 'หยุดโฆษณา',         color: RED,    icon: '🛑' },
}

function fmt(n: number | string | undefined, decimals = 0) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: decimals })
}
function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function Dashboard() {
  const { data: session } = useSession()
  const [pages, setPages] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotif, setShowNotif] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const notifRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadAll()
    // Close notification dropdown when clicking outside
    const handleClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotif(false)
      }
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
    setNotifications(notifsRes.notifications || [])
    setUnreadCount(notifsRes.unreadCount || 0)
    setLoading(false)
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: 'all' }) })
    setUnreadCount(0)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active').length
  const pausedCampaigns = campaigns.filter(c => c.status === 'paused').length

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: "'Sarabun', sans-serif" }}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: BG, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚡</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>FB Ads AI</span>
          {session?.user?.name && (
            <span style={{ fontSize: 12, color: MUTED, marginLeft: 8 }}>— {session.user.name}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Notifications Bell */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              onClick={() => { setShowNotif(!showNotif); if (!showNotif && unreadCount > 0) markAllRead() }}
              style={{ position: 'relative', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: TEXT, display: 'flex', alignItems: 'center' }}>
              <Bell size={16} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 4, right: 4, width: 8, height: 8, background: RED, borderRadius: '50%' }} />
              )}
            </button>
            {showNotif && (
              <div style={{ position: 'absolute', right: 0, top: 44, width: 320, background: '#161620', border: `1px solid ${BORDER}`, borderRadius: 14, zIndex: 100, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>การแจ้งเตือน</span>
                  {unreadCount > 0 && <span style={{ fontSize: 11, color: PURPLE, cursor: 'pointer' }} onClick={markAllRead}>อ่านทั้งหมด</span>}
                </div>
                {notifications.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: MUTED, fontSize: 13 }}>ยังไม่มีการแจ้งเตือน</div>
                ) : (
                  notifications.slice(0, 8).map((n: any) => (
                    <div key={n.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.06)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: '#374151', marginTop: 4 }}>{fmtDate(n.created_at)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Create Button */}
          <button
            onClick={() => setShowModal(true)}
            style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> ยิงแอดใหม่
          </button>

          {/* Logout */}
          <button onClick={() => signOut({ callbackUrl: '/login' })}
            style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center' }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px' }}>

        {/* Stats Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard icon={<Activity size={16} />} label="แอดทั้งหมด" value={String(campaigns.length)} color={PURPLE} />
          <StatCard icon={<TrendingUp size={16} />} label="กำลังวิ่ง" value={String(activeCampaigns)} color={GREEN} />
          <StatCard icon={<Target size={16} />} label="หยุดชั่วคราว" value={String(pausedCampaigns)} color={YELLOW} />
        </div>

        {/* Pages Connected */}
        {pages.length > 0 && (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 16px', marginBottom: 20 }}>
            <span style={{ fontSize: 12, color: MUTED, marginRight: 10 }}>Pages ที่เชื่อมต่อ:</span>
            {pages.map((p: any) => (
              <span key={p.id} style={{ background: 'rgba(99,102,241,0.15)', color: '#a78bfa', padding: '3px 10px', borderRadius: 999, fontSize: 11, marginRight: 6 }}>
                {p.name}
              </span>
            ))}
          </div>
        )}

        {/* Campaign List */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: MUTED }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <p style={{ fontSize: 14 }}>กำลังโหลด...</p>
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
            <p style={{ color: MUTED, marginBottom: 20, fontSize: 15 }}>ยังไม่มีแอดใดๆ</p>
            <button onClick={() => setShowModal(true)}
              style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 12, padding: '12px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              + สร้างแอดแรกเลย
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {campaigns.map((c: any) => <CampaignCard key={c.id} campaign={c} />)}
          </div>
        )}
      </div>

      {showModal && (
        <BoostModal pages={pages} onClose={() => setShowModal(false)} onSuccess={loadAll} />
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ background: `${color}20`, borderRadius: 8, padding: 8, color }}>{icon}</div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
        <div style={{ fontSize: 11, color: MUTED }}>{label}</div>
      </div>
    </div>
  )
}

function CampaignCard({ campaign: c }: { campaign: any }) {
  const isActive = c.status === 'active'
  const isPaused = c.status === 'paused'
  const statusColor = isActive ? GREEN : isPaused ? YELLOW : MUTED
  const statusLabel = isActive ? '● กำลังวิ่ง' : isPaused ? '⏸ หยุดชั่วคราว' : c.status

  return (
    <a href={`/dashboard/campaign/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'border-color 0.2s' }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)')}
        onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📌 {c.campaign_name}
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>
              <span style={{ marginRight: 14 }}>💰 ฿{c.daily_budget}/วัน</span>
              <span>{fmtDate(c.start_time)} — {fmtDate(c.end_time)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: statusColor, background: `${statusColor}18`, padding: '3px 10px', borderRadius: 999 }}>
              {statusLabel}
            </span>
            <ChevronRight size={14} color={MUTED} />
          </div>
        </div>
        {c.fb_campaign_id && (
          <div style={{ marginTop: 8, fontSize: 10, color: '#374151' }}>
            FB: {c.fb_campaign_id}
          </div>
        )}
      </div>
    </a>
  )
}

// ─── Boost Modal ───────────────────────────────────────────────
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
    setLoadingPosts(true)
    setError('')
    try {
      const r = await fetch(`/api/posts?pageId=${page.id}&pageToken=${encodeURIComponent(page.access_token)}`)
      const d = await r.json()
      if (d.error) setError(d.error)
      setPosts(d.posts || [])
    } catch {
      setError('ดึงโพสต์ไม่ได้ กรุณาลองใหม่')
    } finally {
      setLoadingPosts(false)
    }
  }

  async function handleSubmit() {
    if (!selectedPage || !selectedPost) return
    setSubmitting(true)
    setError('')
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + days)

    const res = await fetch('/api/ads/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId: selectedPost.id,
        pageId: selectedPage.id,
        pageToken: selectedPage.access_token,
        pageName: selectedPage.name,
        postMessage: selectedPost.message,
        campaignName: `Boost - ${(selectedPost.message || selectedPost.id).slice(0, 40)}`,
        dailyBudget: budget,
        startDate: new Date().toISOString(),
        endDate: endDate.toISOString(),
      }),
    })
    const d = await res.json()
    setSubmitting(false)

    if (!res.ok || d.error) {
      setError(d.error || 'เกิดข้อผิดพลาด')
      return
    }
    onClose()
    onSuccess()
  }

  const stepTitles = ['เลือก Page', 'เลือกโพสต์', 'ตั้งค่างบ']

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: '#111118', border: `1px solid ${BORDER}`, borderRadius: 20, width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'auto' }}>

        {/* Modal Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>🚀 ยิงแอดใหม่</h2>
            {/* Step Indicators */}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ width: 60, height: 3, borderRadius: 2, background: s <= step ? PURPLE : BORDER }} />
              ))}
            </div>
            <p style={{ fontSize: 11, color: MUTED, margin: '4px 0 0' }}>ขั้นที่ {step}/3 — {stepTitles[step - 1]}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '16px 24px 24px' }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: RED }}>
              ❌ {error}
            </div>
          )}

          {/* Step 1: Select Page */}
          {step === 1 && (
            <div>
              {pages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: MUTED, fontSize: 13 }}>
                  ไม่พบ Page — กรุณา Login ใหม่เพื่อให้สิทธิ์
                </div>
              ) : pages.map((p: any) => (
                <button key={p.id}
                  onClick={() => { setSelectedPage(p); fetchPosts(p); setStep(2) }}
                  style={{ width: '100%', padding: '14px 16px', marginBottom: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 14, fontWeight: 500 }}>
                  📄 {p.name}
                </button>
              ))}
            </div>
          )}

          {/* Step 2: Select Post */}
          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={13} /> กลับ
              </button>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 12 }}>โพสต์จาก <strong style={{ color: TEXT }}>{selectedPage?.name}</strong></p>
              {loadingPosts ? (
                <div style={{ textAlign: 'center', padding: 32, color: MUTED, fontSize: 13 }}>⏳ กำลังโหลดโพสต์...</div>
              ) : posts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: MUTED, fontSize: 13 }}>ไม่พบโพสต์ใน Page นี้</div>
              ) : (
                posts.map((p: any) => (
                  <button key={p.id}
                    onClick={() => { setSelectedPost(p); setStep(3) }}
                    style={{ width: '100%', padding: '12px 14px', marginBottom: 8, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, color: TEXT, cursor: 'pointer', textAlign: 'left', fontSize: 13, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    {p.full_picture && (
                      <img src={p.full_picture} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {p.message || p.story || 'ไม่มีข้อความ'}
                      </div>
                      <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>{fmtDate(p.created_time)}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 3: Budget */}
          {step === 3 && (
            <div>
              <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', marginBottom: 12, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ArrowLeft size={13} /> กลับ
              </button>

              {/* Post Preview */}
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
                <p style={{ fontSize: 11, color: MUTED, margin: '0 0 4px' }}>โพสต์ที่เลือก</p>
                <p style={{ fontSize: 13, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {selectedPost?.message || selectedPost?.story || selectedPost?.id}
                </p>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 6 }}>งบต่อวัน (บาท)</label>
                <input type="number" value={budget} min={20} onChange={e => setBudget(Number(e.target.value))}
                  style={{ width: '100%', padding: '10px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 15, boxSizing: 'border-box' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, color: MUTED, display: 'block', marginBottom: 6 }}>ระยะเวลา (วัน)</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 8 }}>
                  {[3, 7, 14, 30].map(d => (
                    <button key={d} onClick={() => setDays(d)}
                      style={{ padding: '8px 0', background: days === d ? PURPLE : CARD, border: `1px solid ${days === d ? PURPLE : BORDER}`, borderRadius: 8, color: days === d ? 'white' : MUTED, cursor: 'pointer', fontSize: 13, fontWeight: days === d ? 600 : 400 }}>
                      {d} วัน
                    </button>
                  ))}
                </div>
                <input type="number" value={days} min={1} onChange={e => setDays(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {/* Budget Summary */}
              <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: MUTED }}>งบต่อวัน</span>
                  <span>฿{budget}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginTop: 4 }}>
                  <span style={{ color: MUTED }}>ระยะเวลา</span>
                  <span>{days} วัน</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, marginTop: 8, color: GREEN }}>
                  <span>งบรวมทั้งหมด</span>
                  <span>฿{(budget * days).toLocaleString()}</span>
                </div>
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                style={{ width: '100%', padding: '13px', background: submitting ? '#4338ca' : PURPLE, color: 'white', border: 'none', borderRadius: 12, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}>
                {submitting ? '⏳ กำลังสร้างแอดใน Facebook...' : '🚀 ยิงแอดเลย!'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
