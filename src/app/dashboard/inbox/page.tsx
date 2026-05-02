'use client'
import { useEffect, useRef, useState, ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import {
  ArrowLeft, Send, Sparkles, RefreshCw, Search, Star, Archive, CheckCircle2,
  MessageSquare, Inbox, Settings, Zap, X, ChevronLeft, MoreVertical, Bot,
  AlertCircle, BarChart3, Bell, Plus, LogOut, ListFilter, MailOpen, MailQuestion,
} from 'lucide-react'

// ─── Design Tokens (sync กับ dashboard) ───────────────────────
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

const btnPrimary: React.CSSProperties = {
  background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 55%, #818cf8 100%)',
  color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer',
  boxShadow: '0 6px 22px rgba(67,56,202,0.42), inset 0 1px 0 rgba(255,255,255,0.28)',
  fontFamily: 'inherit', fontWeight: 700, transition: 'all 0.18s',
}
const btnGhost: React.CSSProperties = {
  background: 'linear-gradient(145deg, #ffffff 0%, #f0f4ff 100%)',
  color: MUTED, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${BORDER}`,
  fontFamily: 'inherit', transition: 'all 0.18s',
}

const categoryConfig: Record<string, { label: string; color: string; bg: string }> = {
  inquiry:    { label: '❓ สอบถาม',  color: '#2563eb', bg: '#dbeafe' },
  price:      { label: '💰 ราคา',    color: GREEN, bg: GREEN_L },
  order:      { label: '🛒 สั่งซื้อ', color: PRIMARY, bg: PRIMARY_LIGHT },
  complaint:  { label: '😡 ร้องเรียน', color: RED, bg: RED_L },
  support:    { label: '🛠 ช่วยเหลือ', color: CYAN, bg: CYAN_L },
  spam:       { label: '🚫 สแปม',    color: MUTED, bg: '#f1f5f9' },
  other:      { label: 'อื่นๆ',       color: MUTED, bg: '#f1f5f9' },
}

const sentimentConfig: Record<string, { label: string; emoji: string; color: string }> = {
  positive: { label: 'พอใจ',  emoji: '😊', color: GREEN },
  neutral:  { label: 'ปกติ',  emoji: '😐', color: MUTED },
  negative: { label: 'ไม่พอใจ', emoji: '😡', color: RED },
}

// Stable color per page so admins can spot which page a chat is from at a glance
const PAGE_PALETTE = [
  { bg: '#dbeafe', border: '#2563eb', text: '#1d4ed8', avatar: 'linear-gradient(135deg, #60a5fa, #2563eb)' }, // blue
  { bg: '#dcfce7', border: '#16a34a', text: '#15803d', avatar: 'linear-gradient(135deg, #4ade80, #16a34a)' }, // green
  { bg: '#fef3c7', border: '#d97706', text: '#b45309', avatar: 'linear-gradient(135deg, #fbbf24, #d97706)' }, // amber
  { bg: '#fce7f3', border: '#db2777', text: '#be185d', avatar: 'linear-gradient(135deg, #f472b6, #db2777)' }, // pink
  { bg: '#ede9fe', border: '#7c3aed', text: '#6d28d9', avatar: 'linear-gradient(135deg, #a78bfa, #7c3aed)' }, // violet
  { bg: '#cffafe', border: '#0891b2', text: '#0e7490', avatar: 'linear-gradient(135deg, #22d3ee, #0891b2)' }, // cyan
  { bg: '#fee2e2', border: '#dc2626', text: '#b91c1c', avatar: 'linear-gradient(135deg, #f87171, #dc2626)' }, // red
  { bg: '#e0e7ff', border: '#4f46e5', text: '#4338ca', avatar: 'linear-gradient(135deg, #818cf8, #4f46e5)' }, // indigo
]
function pageColor(pageId?: string) {
  if (!pageId) return PAGE_PALETTE[7]
  let hash = 0
  for (let i = 0; i < pageId.length; i++) hash = ((hash << 5) - hash + pageId.charCodeAt(i)) | 0
  return PAGE_PALETTE[Math.abs(hash) % PAGE_PALETTE.length]
}

function timeAgo(d?: string): string {
  if (!d) return ''
  const diff = Date.now() - new Date(d).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'เพิ่งส่ง'
  if (m < 60) return `${m} นาที`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ชม.`
  const day = Math.floor(h / 24)
  if (day < 7) return `${day} วัน`
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

export default function InboxPage() {
  const { data: session } = useSession()

  // Data
  const [pages, setPages] = useState<any[]>([])
  const [conversations, setConversations] = useState<any[]>([])
  const [activeConv, setActiveConv] = useState<any | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [quickReplies, setQuickReplies] = useState<any[]>([])

  // Filters
  const [pageFilter, setPageFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all'|'unread'|'starred'|'unresolved'|'archived'>('all')
  const [search, setSearch] = useState('')

  // UI state
  const [loadingList, setLoadingList] = useState(true)
  const [pageSyncing, setPageSyncing] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [sending, setSending] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [totalUnread, setTotalUnread] = useState(0)
  const [errorBanner, setErrorBanner] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<any>(null)

  // ── Load conversations ──
  async function loadConversations() {
    setLoadingList(true)
    const params = new URLSearchParams()
    if (pageFilter) params.set('pageId', pageFilter)
    if (statusFilter !== 'all') params.set('filter', statusFilter)
    if (search) params.set('q', search)

    const res = await fetch(`/api/inbox/conversations?${params.toString()}`).then(r => r.json())
    setConversations(res.conversations || [])
    setPages(res.pages || [])
    setTotalUnread(res.totalUnread || 0)
    setLoadingList(false)
  }

  async function loadMessages(convId: string) {
    setLoadingMessages(true)
    setAiSuggestions([])
    const res = await fetch(`/api/inbox/conversations/${convId}`).then(r => r.json())
    if (res.conversation) {
      setActiveConv(res.conversation)
      setMessages(res.messages || [])
      // อัปเดต unread count ใน list
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, unread_count: 0 } : c))
    }
    setLoadingMessages(false)
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function loadQuickReplies() {
    const r = await fetch('/api/inbox/quick-replies').then(r => r.json())
    setQuickReplies(r.replies || [])
  }

  // ── Background sync (silent — no spinner) ──
  async function backgroundSync(pageId?: string) {
    try {
      const res = await fetch('/api/inbox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pageId ? { pageId } : {}),
      })
      const data = await res.json()
      // ถ้า sync มี error → แสดงให้ user เห็น (ไม่งั้น user งง ว่าทำไมแชทไม่มี)
      if (data?.summary?.length) {
        const errs: string[] = []
        for (const p of data.summary) {
          if (p.errors?.length) {
            errs.push(`${p.page_name}: ${p.errors.join('; ')}`)
          }
        }
        if (errs.length) setErrorBanner(`Sync error → ${errs.join(' | ')}`)
      }
    } catch {
      // ignore — next interval will retry
    }
  }

  // ── Initial load + polling ──
  // ลด rate การยิง FB API หลังเจอ "Application request limit reached"
  // (Dev mode FB ~200 calls/hour)
  useEffect(() => {
    loadConversations()
    loadQuickReplies()
    // ไม่ trigger sync ตอน mount แล้ว — webhook subscribe ทำตอนกด Sync
    // หรือทุก 10 นาทีในพื้นหลัง
  }, [])

  // เปลี่ยนเพจ → load จาก DB ทันที (ไม่ trigger sync เอง)
  // ถ้าผู้ใช้ต้องการข้อมูลใหม่ → กดปุ่ม Sync เอง
  useEffect(() => {
    loadConversations()
  }, [pageFilter, statusFilter])

  // Poll DB ทุก 30 วิ (เร็วพอสำหรับ user แต่ไม่กิน rate limit FB
  // เพราะ poll DB ของเรา ไม่ใช่ FB)
  // Background sync FB ทุก 10 นาที (กัน webhook ตก)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    let tick = 0
    const SYNC_EVERY_TICKS = 20  // 20 × 30s = 10 นาที
    pollRef.current = setInterval(() => {
      tick++
      loadConversations()
      if (activeConv) {
        fetch(`/api/inbox/conversations/${activeConv.id}`)
          .then(r => r.json())
          .then(res => {
            if (res.messages) setMessages(res.messages)
          })
          .catch(() => {})
      }
      if (tick % SYNC_EVERY_TICKS === 0) {
        backgroundSync()
      }
    }, 30000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [activeConv?.id, pageFilter, statusFilter, search])

  // ── Send message ──
  async function handleSend() {
    if (!activeConv || !draft.trim() || sending) return
    setSending(true)
    setErrorBanner(null)
    const text = draft.trim()
    setDraft('')

    // optimistic
    const optimistic = {
      id: `temp-${Date.now()}`,
      direction: 'outbound',
      message_text: text,
      sent_by: 'page_user',
      delivery_status: 'sending',
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    try {
      const res = await fetch('/api/inbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id, text }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setErrorBanner(data.error || 'ส่งไม่สำเร็จ')
        setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, delivery_status: 'failed', error_message: data.error } : m))
      } else {
        // replace optimistic with real
        setMessages(prev => prev.map(m => m.id === optimistic.id ? data.message : m))
        loadConversations()
      }
    } catch (e: any) {
      setErrorBanner(e.message)
    }
    setSending(false)
  }

  // ── AI Suggest ──
  async function handleAiSuggest(instruction?: string) {
    if (!activeConv || aiLoading) return
    setAiLoading(true)
    setAiSuggestions([])
    try {
      const res = await fetch('/api/inbox/ai-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: activeConv.id, instruction }),
      })
      const data = await res.json()
      if (data.suggestions?.length) {
        setAiSuggestions(data.suggestions)
        setActiveConv((c: any) => c ? { ...c, ai_category: data.category, ai_sentiment: data.sentiment, ai_summary: data.summary } : c)
      } else {
        setErrorBanner(data.error || 'AI ไม่สามารถสร้างคำแนะนำได้')
      }
    } catch (e: any) {
      setErrorBanner(e.message)
    }
    setAiLoading(false)
  }

  // ── Sync from Facebook ──
  async function handleSync() {
    setSyncing(true)
    setErrorBanner(null)
    try {
      const res = await fetch('/api/inbox/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) setErrorBanner(data.error || 'Sync ล้มเหลว')
      await loadConversations()
    } catch (e: any) {
      setErrorBanner(e.message)
    }
    setSyncing(false)
  }

  // ── Conversation actions ──
  async function patchConv(patch: any) {
    if (!activeConv) return
    await fetch(`/api/inbox/conversations/${activeConv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    setActiveConv((c: any) => c ? { ...c, ...patch } : c)
    loadConversations()
  }

  // ── Render ──
  const filteredConvs = conversations.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return (c.customer_name || '').toLowerCase().includes(s)
      || (c.last_message || '').toLowerCase().includes(s)
  })

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: 'Inter, "Sarabun", system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      {/* Background pattern */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `linear-gradient(rgba(99,102,241,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.045) 1px, transparent 1px)`, backgroundSize: '48px 48px' }} />

      {/* Sidebar (compact mini-rail) */}
      <aside style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: 244,
        boxSizing: 'border-box',
        background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(28px)',
        borderRight: `1.5px solid ${BORDER}`, padding: '18px 14px 16px',
        display: 'flex', flexDirection: 'column', gap: 6, zIndex: 50,
        boxShadow: '4px 0 28px rgba(99,102,241,0.08)', overflowY: 'auto',
      }} className="ib-sidebar">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '2px 8px 16px', borderBottom: `1px solid ${BORDER}`, marginBottom: 10 }}>
          <div style={{ width: 40, height: 40, background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 60%, #818cf8 100%)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 4px 14px rgba(67,56,202,0.4)' }}>⚡</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 15, color: TEXT, lineHeight: 1.2 }}>FB Ads AI</div>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 700, marginTop: 1 }}>Smart Manager</div>
          </div>
        </div>

        {session?.user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', borderRadius: 12, marginBottom: 12, border: `1px solid ${BORDER}` }}>
            {session.user.image ? (
              <img src={session.user.image} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1.5px solid white' }} />
            ) : (
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 900 }}>
                {(session.user.name || 'U')[0]}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{session.user.name || 'ผู้ใช้'}</div>
              <div style={{ fontSize: 9, color: GREEN, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: GREEN }} />เชื่อมต่อแล้ว
              </div>
            </div>
          </div>
        )}

        <div style={{ fontSize: 10, color: MUTED, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, padding: '6px 10px 4px' }}>เมนูหลัก</div>

        <Link href="/dashboard" style={{ textDecoration: 'none' }}>
          <NavItem icon={<BarChart3 size={15} />} label="ยิงแอดเพจ" />
        </Link>
        <NavItem icon={<MessageSquare size={15} />} label="กล่องข้อความ" active badge={totalUnread} />
        <button onClick={() => setShowSettings(true)} style={{ all: 'unset', display: 'block', cursor: 'pointer' }}>
          <NavItem icon={<Settings size={15} />} label="ตั้งค่าแชท" />
        </button>

        <div style={{ flex: 1, minHeight: 16 }} />

        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ ...btnGhost, padding: '10px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'flex-start', color: RED, border: `1.5px solid rgba(220,38,38,0.18)`, fontWeight: 800 }}
        >
          <LogOut size={14} /> ออกจากระบบ
        </button>
      </aside>

      {/* Mobile top bar (visible < 820px) */}
      <div className="ib-mobile-bar" style={{
        display: 'none', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 40,
        background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(20px)',
        borderBottom: `1.5px solid ${BORDER}`, padding: '10px 14px',
        alignItems: 'center', gap: 10, height: 52, boxSizing: 'border-box',
      }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #4338ca, #818cf8)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>⚡</div>
          <div style={{ fontWeight: 900, fontSize: 13, color: TEXT }}>FB Ads AI</div>
        </Link>
        <div style={{ flex: 1 }} />
        <Link href="/dashboard" style={{ ...btnGhost, padding: '7px 11px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', color: MUTED } as any}>
          <BarChart3 size={13} /> ยิงแอดเพจ
        </Link>
      </div>

      {/* Main 3-column layout */}
      <main data-active={activeConv ? '1' : '0'} style={{ marginLeft: 244, height: '100vh', display: 'flex', position: 'relative', zIndex: 1, overflow: 'hidden' }} className="ib-main">
        {/* Column 1: Conversation List */}
        <section style={{
          width: 340, flexShrink: 0, background: SURFACE,
          borderRight: `1.5px solid ${BORDER}`, display: 'flex', flexDirection: 'column',
        }} className="ib-col1">
          {/* Header */}
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  background: 'linear-gradient(135deg, #4338ca, #818cf8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(67,56,202,0.3)',
                }}>
                  <MessageSquare size={16} color="white" strokeWidth={2.5} />
                </div>
                <h1 style={{ fontSize: 17, fontWeight: 900, margin: 0, color: TEXT, letterSpacing: '-0.3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>กล่องข้อความ</h1>
              </div>
              <button
                onClick={handleSync}
                disabled={syncing}
                title="ดึงข้อความล่าสุดจาก Facebook"
                style={{ ...btnGhost, padding: '7px 11px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, flexShrink: 0, minWidth: 78, justifyContent: 'center' }}
              >
                <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'โหลด...' : 'Sync'}
              </button>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาลูกค้า..."
                style={{
                  width: '100%', padding: '9px 12px 9px 32px', borderRadius: 10,
                  border: `1.5px solid ${BORDER}`, background: SURFACE2,
                  fontSize: 12, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Page filter */}
            {pages.length > 0 && (
              <select
                value={pageFilter}
                onChange={e => setPageFilter(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 10,
                  border: `1.5px solid ${BORDER}`, background: 'white',
                  fontSize: 12, fontFamily: 'inherit', fontWeight: 700, color: TEXT, marginBottom: 10,
                }}
              >
                <option value="">📂 ทุกเพจ ({pages.length})</option>
                {pages.map(p => <option key={p.id} value={p.id}>📄 {p.page_name}</option>)}
              </select>
            )}

            {/* Status filter — high-contrast segmented control (active = filled purple) */}
            <div style={{
              display: 'flex', gap: 3, padding: 4,
              background: '#e0e7ff', borderRadius: 11,
              border: `1.5px solid ${BORDER2}`,
            }}>
              {([
                ['all', 'ทั้งหมด', null, null],
                ['unread', 'ใหม่', null, totalUnread > 0 ? totalUnread : null],
                ['unresolved', 'ค้าง', null, null],
                ['starred', null, Star, null],
                ['archived', null, Archive, null],
              ] as const).map(([key, label, Icon, count]) => {
                const active = statusFilter === key
                return (
                  <button
                    key={key}
                    onClick={() => setStatusFilter(key as any)}
                    title={key === 'starred' ? 'ติดดาว' : key === 'archived' ? 'จัดเก็บ' : undefined}
                    style={{
                      flex: 1, padding: '7px 4px', border: 'none',
                      borderRadius: 8,
                      // ACTIVE = filled gradient purple → ชัดเจนเด่นมาก
                      background: active
                        ? 'linear-gradient(135deg, #4338ca, #6366f1)'
                        : 'transparent',
                      boxShadow: active
                        ? '0 3px 10px rgba(67,56,202,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                        : 'none',
                      fontSize: 11, fontWeight: 800, cursor: 'pointer',
                      fontFamily: 'inherit',
                      // ACTIVE = white text, INACTIVE = muted
                      color: active ? 'white' : MUTED,
                      whiteSpace: 'nowrap',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      transition: 'all 0.18s',
                    }}
                  >
                    {Icon ? <Icon size={13} /> : label}
                    {count !== null && count !== undefined && (
                      <span style={{
                        background: active ? 'rgba(255,255,255,0.25)' : RED,
                        color: 'white',
                        fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 999,
                        minWidth: 14, textAlign: 'center', lineHeight: 1.4,
                      }}>{count > 99 ? '99+' : count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {(loadingList || pageSyncing) && conversations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 12 }}>
                <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                <div>{pageSyncing ? 'กำลังดึงแชทจากเพจ...' : 'กำลังโหลด...'}</div>
              </div>
            ) : filteredConvs.length === 0 ? (
              <EmptyState
                icon={<Inbox size={36} />}
                title={pages.length === 0 ? 'ยังไม่มีเพจที่เชื่อมต่อ' : 'ยังไม่มีข้อความ'}
                hint={pages.length === 0
                  ? 'กลับไปหน้ายิงแอดเพจเพื่อเชื่อมต่อเพจก่อน'
                  : 'เพจนี้ยังไม่มีบทสนทนา หรือลูกค้ายังไม่ได้ทักเข้ามา'}
              />
            ) : (
              filteredConvs.map(c => (
                <ConvItem
                  key={c.id}
                  conv={c}
                  active={activeConv?.id === c.id}
                  onClick={() => loadMessages(c.id)}
                />
              ))
            )}
          </div>
        </section>

        {/* Column 2: Chat Thread */}
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: SURFACE2 }} className="ib-col2">
          {!activeConv ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, padding: 20 }}>
              <div style={{ textAlign: 'center', maxWidth: 320 }}>
                <div style={{ fontSize: 48, marginBottom: 10, lineHeight: 1 }}>💬</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, marginBottom: 5 }}>เลือกบทสนทนา</div>
                <div style={{ fontSize: 12, lineHeight: 1.6 }}>เลือกข้อความจากด้านซ้ายเพื่อเริ่มแชทกับลูกค้า</div>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header — page-colored top stripe so admin always knows which page they're replying from */}
              <div style={{
                padding: '14px 18px', background: SURFACE,
                borderBottom: `1.5px solid ${BORDER}`,
                borderTop: `4px solid ${pageColor(activeConv.page_id).border}`,
                display: 'flex', alignItems: 'center', gap: 12, boxShadow: SHADOW_SM,
              }}>
                <button
                  onClick={() => setActiveConv(null)}
                  className="ib-back"
                  style={{ ...btnGhost, padding: 7, display: 'none' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <Avatar name={activeConv.customer_name} src={activeConv.customer_picture} size={42} ringColor={pageColor(activeConv.page_id).border} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: TEXT, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {activeConv.customer_name || 'ลูกค้า'}
                    {activeConv.is_starred && <Star size={13} fill={YELLOW} color={YELLOW} />}
                  </div>
                  <div style={{ marginTop: 3 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 9px', borderRadius: 999,
                      background: pageColor(activeConv.page_id).bg,
                      color: pageColor(activeConv.page_id).text,
                      fontSize: 11, fontWeight: 800,
                      border: `1px solid ${pageColor(activeConv.page_id).border}33`,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: pageColor(activeConv.page_id).border }} />
                      {activeConv.connected_pages?.page_name}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => patchConv({ is_starred: !activeConv.is_starred })}
                    title={activeConv.is_starred ? 'เลิก star' : 'Star'}
                    style={{ ...btnGhost, padding: 8 }}
                  >
                    <Star size={14} fill={activeConv.is_starred ? YELLOW : 'transparent'} color={activeConv.is_starred ? YELLOW : MUTED} />
                  </button>
                  <button
                    onClick={() => patchConv({ is_resolved: !activeConv.is_resolved })}
                    title={activeConv.is_resolved ? 'เปิดใหม่' : 'จบบทสนทนา'}
                    style={{ ...btnGhost, padding: 8, color: activeConv.is_resolved ? GREEN : MUTED }}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                  <button
                    onClick={() => patchConv({ is_archived: !activeConv.is_archived })}
                    title="Archive"
                    style={{ ...btnGhost, padding: 8 }}
                  >
                    <Archive size={14} />
                  </button>
                  <button
                    onClick={() => setShowRightPanel(!showRightPanel)}
                    title="ข้อมูลลูกค้า"
                    className="ib-toggle-right"
                    style={{ ...btnGhost, padding: 8 }}
                  >
                    <MoreVertical size={14} />
                  </button>
                </div>
              </div>

              {/* Error banner */}
              {errorBanner && (
                <div style={{
                  padding: '10px 18px', background: RED_L, borderBottom: `1px solid ${RED}33`,
                  fontSize: 12, color: RED, display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700,
                }}>
                  <AlertCircle size={14} />
                  <div style={{ flex: 1 }}>{errorBanner}</div>
                  <button onClick={() => setErrorBanner(null)} style={{ all: 'unset', cursor: 'pointer' }}><X size={14} /></button>
                </div>
              )}

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {loadingMessages ? (
                  <div style={{ textAlign: 'center', padding: 40, color: MUTED }}>
                    <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: MUTED, fontSize: 12 }}>
                    ยังไม่มีข้อความในบทสนทนานี้
                  </div>
                ) : messages.map((m, i) => (
                  <MessageBubble
                    key={m.id || i}
                    message={m}
                    customerName={activeConv.customer_name}
                    customerPic={activeConv.customer_picture}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* AI Suggestions */}
              {aiSuggestions.length > 0 && (
                <div style={{
                  padding: '12px 18px', background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
                  borderTop: `1px solid ${BORDER2}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: PRIMARY, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Sparkles size={12} /> AI แนะนำคำตอบ — กดเพื่อใช้
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {aiSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { setDraft(s); setAiSuggestions([]) }}
                        style={{
                          textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                          border: `1.5px solid ${BORDER2}`, background: 'white',
                          fontSize: 12, color: TEXT, cursor: 'pointer', fontFamily: 'inherit',
                          lineHeight: 1.5, transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = SURFACE2; e.currentTarget.style.borderColor = PRIMARY }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.borderColor = BORDER2 as string }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Composer */}
              <div style={{ padding: '12px 18px 16px', background: SURFACE, borderTop: `1.5px solid ${BORDER}` }}>
                {/* Quick reply chips */}
                {quickReplies.length > 0 && (
                  <div style={{ display: 'flex', gap: 5, marginBottom: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {quickReplies.slice(0, 6).map(qr => (
                      <button
                        key={qr.id}
                        onClick={() => setDraft(qr.message)}
                        style={{
                          padding: '5px 10px', borderRadius: 999, border: `1px solid ${BORDER}`,
                          background: SURFACE2, fontSize: 11, fontWeight: 700, color: PRIMARY,
                          cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                        }}
                        title={qr.message}
                      >⚡ {qr.title}</button>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <button
                    onClick={() => handleAiSuggest()}
                    disabled={aiLoading}
                    title="ให้ AI ช่วยร่างคำตอบ"
                    style={{
                      padding: '11px 14px', borderRadius: 12, border: 'none',
                      background: aiLoading ? '#e0e7ff' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                      color: 'white', cursor: aiLoading ? 'wait' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800,
                      fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(139,92,246,0.35)',
                    }}
                  >
                    {aiLoading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                    AI ช่วยตอบ
                  </button>

                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    placeholder="พิมพ์ข้อความ... (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่)"
                    rows={1}
                    style={{
                      flex: 1, padding: '11px 14px', borderRadius: 12,
                      border: `1.5px solid ${BORDER}`, background: SURFACE2,
                      fontSize: 13, fontFamily: 'inherit', resize: 'none', outline: 'none',
                      maxHeight: 140, color: TEXT,
                    }}
                  />

                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    style={{
                      ...btnPrimary, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, opacity: !draft.trim() || sending ? 0.5 : 1,
                      cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {sending ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                    ส่ง
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* Column 3: Right panel — customer info */}
        {activeConv && showRightPanel && (
          <aside style={{
            width: 280, flexShrink: 0, background: SURFACE,
            borderLeft: `1.5px solid ${BORDER}`, padding: 18, overflowY: 'auto',
          }} className="ib-col3">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingBottom: 18, borderBottom: `1px solid ${BORDER}`, marginBottom: 16 }}>
              <Avatar name={activeConv.customer_name} src={activeConv.customer_picture} size={64} />
              <div style={{ fontSize: 15, fontWeight: 800, color: TEXT, textAlign: 'center' }}>
                {activeConv.customer_name || 'ลูกค้า'}
              </div>
              <div style={{ fontSize: 11, color: MUTED }}>📄 {activeConv.connected_pages?.page_name}</div>
            </div>

            {/* AI Insights */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                <Bot size={11} style={{ display: 'inline', marginRight: 4 }} /> AI Insights
              </div>

              {activeConv.ai_category && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>หมวดหมู่</div>
                  <span style={{
                    display: 'inline-block', padding: '4px 10px', borderRadius: 999,
                    background: categoryConfig[activeConv.ai_category]?.bg || '#f1f5f9',
                    color: categoryConfig[activeConv.ai_category]?.color || MUTED,
                    fontSize: 11, fontWeight: 800,
                  }}>
                    {categoryConfig[activeConv.ai_category]?.label || activeConv.ai_category}
                  </span>
                </div>
              )}

              {activeConv.ai_sentiment && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>อารมณ์ลูกค้า</div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: sentimentConfig[activeConv.ai_sentiment]?.color }}>
                    {sentimentConfig[activeConv.ai_sentiment]?.emoji} {sentimentConfig[activeConv.ai_sentiment]?.label}
                  </span>
                </div>
              )}

              {activeConv.ai_summary && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 10, color: MUTED, marginBottom: 3 }}>สรุปบทสนทนา</div>
                  <div style={{ fontSize: 11, color: TEXT, lineHeight: 1.6, padding: 8, background: SURFACE2, borderRadius: 8, border: `1px solid ${BORDER}` }}>
                    {activeConv.ai_summary}
                  </div>
                </div>
              )}

              {!activeConv.ai_category && !activeConv.ai_sentiment && (
                <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>
                  กดปุ่ม "AI ช่วยตอบ" เพื่อให้ AI วิเคราะห์บทสนทนา
                </div>
              )}
            </div>

            {/* AI tone tweaks */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                <Zap size={11} style={{ display: 'inline', marginRight: 4 }} /> สั่ง AI
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { label: '💬 ตอบสั้นๆ', val: 'ตอบให้สั้นกระชับที่สุด ไม่เกิน 2 ประโยค' },
                  { label: '📝 ตอบละเอียด', val: 'ตอบแบบละเอียด อธิบายครบถ้วน' },
                  { label: '😊 อบอุ่นมากขึ้น', val: 'ตอบให้อบอุ่น เป็นกันเอง มี emoji เพิ่ม' },
                  { label: '💼 ทางการ', val: 'ตอบแบบทางการ มืออาชีพ' },
                  { label: '🛒 ปิดการขาย', val: 'ช่วยปิดการขาย แนะนำให้ลูกค้ายืนยันสั่งซื้อ' },
                ].map(t => (
                  <button
                    key={t.label}
                    onClick={() => handleAiSuggest(t.val)}
                    disabled={aiLoading}
                    style={{
                      ...btnGhost, padding: '7px 10px', fontSize: 11, fontWeight: 700,
                      textAlign: 'left', color: TEXT, justifyContent: 'flex-start',
                    }}
                  >{t.label}</button>
                ))}
              </div>
            </div>
          </aside>
        )}
      </main>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          pages={pages}
          onClose={() => setShowSettings(false)}
          onSaved={() => { loadConversations(); loadQuickReplies() }}
        />
      )}

      {/* Responsive CSS */}
      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        html, body { overflow-x: hidden; }

        /* Tablet — hide right panel */
        @media (max-width: 1280px) {
          .ib-col3 { display: none !important; }
        }

        /* Narrow tablet — narrower col1 */
        @media (max-width: 980px) {
          .ib-col1 { width: 290px !important; }
        }

        /* Mobile — hide sidebar (use top bar instead) */
        @media (max-width: 820px) {
          .ib-sidebar { transform: translateX(-100%); transition: transform 0.25s; }
          .ib-main { margin-left: 0 !important; padding-top: 52px; height: calc(100vh - 0px) !important; }
          .ib-mobile-bar { display: flex !important; }
        }

        /* Small mobile — single column (toggle list ↔ chat) */
        @media (max-width: 680px) {
          .ib-col1 { width: 100% !important; }
          /* Hide col1 when chat is open */
          .ib-main[data-active="1"] .ib-col1 { display: none !important; }
          /* Hide col2 when no chat selected */
          .ib-main[data-active="0"] .ib-col2 { display: none !important; }
          .ib-back { display: flex !important; }
        }
      `}</style>
    </div>
  )
}

// ─── Components ───────────────────────────────────────────────

function NavItem({ icon, label, active, badge }: { icon: ReactNode; label: string; active?: boolean; badge?: number }) {
  const baseColor = active ? PRIMARY : '#374151'
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 11,
        padding: '10px 12px', borderRadius: 11,
        background: active ? 'linear-gradient(135deg, #eef2ff, #e0e7ff)' : 'transparent',
        color: baseColor, cursor: 'pointer',
        fontSize: 13, fontWeight: active ? 800 : 700,
        border: `1px solid ${active ? BORDER2 : 'transparent'}`,
        boxShadow: active ? '0 3px 10px rgba(67,56,202,0.12)' : 'none',
        position: 'relative', transition: 'all 0.15s',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span style={{ background: RED, color: 'white', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 999, minWidth: 18, textAlign: 'center' }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </div>
  )
}

function Avatar({ name, src, size = 40, ringColor }: { name?: string; src?: string; size?: number; ringColor?: string }) {
  const ring = ringColor ? `2px solid ${ringColor}` : '1.5px solid white'
  if (src) {
    return <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: ring, boxShadow: SHADOW_SM }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, #818cf8, #6366f1)', color: 'white',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 800, boxShadow: SHADOW_SM,
      border: ring,
    }}>
      {(name || '?')[0].toUpperCase()}
    </div>
  )
}

function ConvItem({ conv, active, onClick }: { conv: any; active: boolean; onClick: () => void }) {
  const unread = conv.unread_count > 0
  const pc = pageColor(conv.page_id)
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 10, padding: '12px 14px', cursor: 'pointer',
        borderBottom: `1px solid ${BORDER}`,
        background: active
          ? PRIMARY_LIGHT
          : (unread ? `linear-gradient(90deg, ${pc.bg} 0%, ${pc.bg}55 40%, white 100%)` : 'white'),
        borderLeft: `4px solid ${active ? PRIMARY : pc.border}`,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = SURFACE2 }}
      onMouseLeave={e => {
        if (!active) e.currentTarget.style.background = unread
          ? `linear-gradient(90deg, ${pc.bg} 0%, ${pc.bg}55 40%, white 100%)`
          : 'white'
      }}
    >
      <Avatar name={conv.customer_name} src={conv.customer_picture} size={40} ringColor={pc.border} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
          <div style={{
            fontSize: 13, fontWeight: unread ? 800 : 700, color: TEXT,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {conv.customer_name || 'ลูกค้า'}
            {conv.is_starred && <Star size={11} fill={YELLOW} color={YELLOW} style={{ marginLeft: 4, display: 'inline' }} />}
          </div>
          <div style={{ fontSize: 10, color: unread ? PRIMARY : MUTED, flexShrink: 0, fontWeight: unread ? 800 : 600 }}>
            {timeAgo(conv.last_message_at)}
          </div>
        </div>
        <div style={{ marginBottom: 4 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 999,
            background: pc.bg, color: pc.text,
            fontSize: 10, fontWeight: 800,
            border: `1px solid ${pc.border}33`,
            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: pc.border, flexShrink: 0 }} />
            {conv.connected_pages?.page_name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <div style={{
            fontSize: 12, color: unread ? TEXT : MUTED, fontWeight: unread ? 700 : 500,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {conv.last_sender === 'page' && <span style={{ color: MUTED }}>คุณ: </span>}
            {conv.last_message || '(ไม่มีข้อความ)'}
          </div>
          {unread && (
            <span style={{ background: PRIMARY, color: 'white', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, minWidth: 18, textAlign: 'center', flexShrink: 0 }}>
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          )}
        </div>
        {conv.ai_category && (
          <div style={{ marginTop: 5 }}>
            <span style={{
              display: 'inline-block', padding: '2px 7px', borderRadius: 999,
              background: categoryConfig[conv.ai_category]?.bg || '#f1f5f9',
              color: categoryConfig[conv.ai_category]?.color || MUTED,
              fontSize: 9, fontWeight: 800,
            }}>
              {categoryConfig[conv.ai_category]?.label || conv.ai_category}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function MessageBubble({ message: m, customerName, customerPic }: { message: any; customerName?: string; customerPic?: string }) {
  const out = m.direction === 'outbound'
  const failed = m.delivery_status === 'failed'
  const sending = m.delivery_status === 'sending'
  const isAuto = m.sent_by === 'page_auto' || m.sent_by === 'page_ai'

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: out ? 'row-reverse' : 'row', maxWidth: '85%', alignSelf: out ? 'flex-end' : 'flex-start' }}>
      {!out && <Avatar name={customerName} src={customerPic} size={28} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: out ? 'flex-end' : 'flex-start' }}>
        {isAuto && out && (
          <div style={{ fontSize: 9, color: PRIMARY, fontWeight: 800, marginBottom: 2 }}>
            🤖 AUTO
          </div>
        )}
        <div style={{
          padding: '9px 13px', borderRadius: 16,
          background: out
            ? (failed ? RED_L : 'linear-gradient(135deg, #4338ca 0%, #6366f1 100%)')
            : 'white',
          color: out ? (failed ? RED : 'white') : TEXT,
          border: out ? 'none' : `1px solid ${BORDER}`,
          fontSize: 13, lineHeight: 1.5, wordBreak: 'break-word',
          boxShadow: SHADOW_SM,
          opacity: sending ? 0.6 : 1,
          borderTopRightRadius: out ? 4 : 16,
          borderTopLeftRadius: out ? 16 : 4,
        }}>
          {m.message_text || (m.attachments?.length ? '📎 ไฟล์แนบ' : '')}
          {(m.attachments || []).map((a: any, i: number) => (
            a.type === 'image' && a.url ? (
              <img key={i} src={a.url} style={{ maxWidth: 200, marginTop: 6, borderRadius: 8, display: 'block' }} alt="" />
            ) : (
              <div key={i} style={{ marginTop: 6, fontSize: 11 }}>📎 {a.name || a.url}</div>
            )
          ))}
        </div>
        <div style={{ fontSize: 10, color: MUTED, padding: '0 4px' }}>
          {sending && '⏳ กำลังส่ง...'}
          {failed && <span style={{ color: RED, fontWeight: 700 }}>❌ ส่งไม่สำเร็จ {m.error_message ? `(${m.error_message})` : ''}</span>}
          {!sending && !failed && timeAgo(m.created_at)}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: MUTED }}>
      <div style={{ marginBottom: 10, opacity: 0.4 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: TEXT, marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 240, margin: '0 auto' }}>{hint}</div>}
    </div>
  )
}

// ─── Settings Modal ───────────────────────────────────────────
function SettingsModal({ pages, onClose, onSaved }: { pages: any[]; onClose: () => void; onSaved: () => void }) {
  const [selectedPage, setSelectedPage] = useState<string>(pages[0]?.id || '')
  const [settings, setSettings] = useState<any>({})
  const [quickReplies, setQuickReplies] = useState<any[]>([])
  const [newQR, setNewQR] = useState({ shortcut: '', title: '', message: '' })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'general'|'auto'|'kb'|'qr'>('general')

  useEffect(() => {
    if (!selectedPage) return
    fetch(`/api/inbox/settings?pageId=${selectedPage}`)
      .then(r => r.json())
      .then(d => {
        const s = d.settings?.[0] || {
          ai_assist_enabled: true,
          ai_auto_categorize: true,
          ai_tone: 'friendly',
          auto_reply_enabled: false,
          auto_reply_message: 'ขอบคุณที่ติดต่อเรา ทีมงานจะรีบตอบกลับโดยเร็วที่สุดค่ะ 🙏',
          business_hours_enabled: false,
          off_hours_message: 'ขณะนี้นอกเวลาทำการ ทีมงานจะติดต่อกลับในเวลาทำการนะคะ ⏰',
          knowledge_base: '',
          business_hours: { mon:{start:'09:00',end:'18:00',off:false},tue:{start:'09:00',end:'18:00',off:false},wed:{start:'09:00',end:'18:00',off:false},thu:{start:'09:00',end:'18:00',off:false},fri:{start:'09:00',end:'18:00',off:false},sat:{start:'09:00',end:'18:00',off:true},sun:{start:'09:00',end:'18:00',off:true} },
        }
        setSettings(s)
      })
    fetch('/api/inbox/quick-replies').then(r => r.json()).then(d => setQuickReplies(d.replies || []))
  }, [selectedPage])

  async function save() {
    if (!selectedPage) return
    setSaving(true)
    await fetch('/api/inbox/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: selectedPage, ...settings }),
    })
    setSaving(false)
    onSaved()
  }

  async function addQR() {
    if (!newQR.shortcut || !newQR.title || !newQR.message) return
    const r = await fetch('/api/inbox/quick-replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newQR),
    }).then(r => r.json())
    if (r.success) {
      setQuickReplies([r.reply, ...quickReplies])
      setNewQR({ shortcut: '', title: '', message: '' })
      onSaved()
    }
  }

  async function deleteQR(id: string) {
    await fetch(`/api/inbox/quick-replies?id=${id}`, { method: 'DELETE' })
    setQuickReplies(quickReplies.filter(q => q.id !== id))
    onSaved()
  }

  const updateBH = (day: string, field: string, value: any) => {
    setSettings((s: any) => ({
      ...s,
      business_hours: { ...s.business_hours, [day]: { ...s.business_hours?.[day], [field]: value } }
    }))
  }

  const days = [
    { k: 'mon', label: 'จันทร์' },{ k: 'tue', label: 'อังคาร' },{ k: 'wed', label: 'พุธ' },
    { k: 'thu', label: 'พฤหัสฯ' },{ k: 'fri', label: 'ศุกร์' },{ k: 'sat', label: 'เสาร์' },{ k: 'sun', label: 'อาทิตย์' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(6px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: SURFACE, borderRadius: 18, width: '100%', maxWidth: 720, maxHeight: '90vh', overflow: 'hidden', boxShadow: SHADOW_LG, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 22px', borderBottom: `1.5px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>⚙️ ตั้งค่ากล่องข้อความ</div>
          <button onClick={onClose} style={{ ...btnGhost, padding: 8 }}><X size={16} /></button>
        </div>

        {/* Page selector */}
        {pages.length > 0 && (
          <div style={{ padding: '12px 22px', borderBottom: `1px solid ${BORDER}`, background: SURFACE2 }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, marginBottom: 5 }}>เลือกเพจที่จะตั้งค่า</div>
            <select value={selectedPage} onChange={e => setSelectedPage(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>
              {pages.map(p => <option key={p.id} value={p.id}>📄 {p.page_name}</option>)}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${BORDER}`, padding: '0 22px' }}>
          {([['general','🤖 AI'],['auto','💬 ตอบอัตโนมัติ'],['kb','📚 ความรู้'],['qr','⚡ Quick Reply']] as const).map(([k,l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                padding: '12px 14px', border: 'none', background: 'transparent',
                fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                color: tab === k ? PRIMARY : MUTED,
                borderBottom: tab === k ? `2px solid ${PRIMARY}` : '2px solid transparent',
              }}
            >{l}</button>
          ))}
        </div>

        <div style={{ padding: 22, flex: 1, overflowY: 'auto' }}>
          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Toggle label="✨ เปิดปุ่ม 'AI ช่วยตอบ'" checked={settings.ai_assist_enabled} onChange={v => setSettings({...settings, ai_assist_enabled: v})} />
              <Toggle label="🏷️ ให้ AI จัดหมวดหมู่อัตโนมัติ" checked={settings.ai_auto_categorize} onChange={v => setSettings({...settings, ai_auto_categorize: v})} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>🎭 โทนการตอบ</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[['friendly','😊 เป็นกันเอง'],['professional','💼 ทางการ'],['casual','😎 สบายๆ']].map(([v,l]) => (
                    <button key={v} onClick={() => setSettings({...settings, ai_tone: v})} style={{
                      flex: 1, padding: '10px 8px', borderRadius: 10, border: settings.ai_tone === v ? `2px solid ${PRIMARY}` : `1.5px solid ${BORDER}`,
                      background: settings.ai_tone === v ? PRIMARY_LIGHT : 'white', cursor: 'pointer',
                      fontSize: 12, fontWeight: 800, color: settings.ai_tone === v ? PRIMARY : TEXT, fontFamily: 'inherit',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'auto' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Toggle label="💬 เปิดตอบกลับอัตโนมัติ (เมื่อมีข้อความใหม่)" checked={settings.auto_reply_enabled} onChange={v => setSettings({...settings, auto_reply_enabled: v})} />
              {settings.auto_reply_enabled && (
                <textarea value={settings.auto_reply_message || ''} onChange={e => setSettings({...settings, auto_reply_message: e.target.value})} rows={3} placeholder="ข้อความตอบกลับอัตโนมัติ" style={{ width: '100%', padding: 10, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
              )}

              <div style={{ height: 1, background: BORDER, margin: '4px 0' }} />

              <Toggle label="⏰ ตั้งเวลาทำการ (นอกเวลาส่งข้อความอัตโนมัติ)" checked={settings.business_hours_enabled} onChange={v => setSettings({...settings, business_hours_enabled: v})} />
              {settings.business_hours_enabled && (
                <>
                  <textarea value={settings.off_hours_message || ''} onChange={e => setSettings({...settings, off_hours_message: e.target.value})} rows={2} placeholder="ข้อความนอกเวลาทำการ" style={{ width: '100%', padding: 10, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {days.map(d => {
                      const bh = settings.business_hours?.[d.k] || { start: '09:00', end: '18:00', off: false }
                      return (
                        <div key={d.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: SURFACE2, borderRadius: 8 }}>
                          <div style={{ width: 60, fontSize: 12, fontWeight: 700 }}>{d.label}</div>
                          <input type="checkbox" checked={!bh.off} onChange={e => updateBH(d.k, 'off', !e.target.checked)} />
                          {!bh.off && (
                            <>
                              <input type="time" value={bh.start} onChange={e => updateBH(d.k, 'start', e.target.value)} style={{ padding: 4, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12 }} />
                              <span>–</span>
                              <input type="time" value={bh.end} onChange={e => updateBH(d.k, 'end', e.target.value)} style={{ padding: 4, borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12 }} />
                            </>
                          )}
                          {bh.off && <span style={{ fontSize: 11, color: MUTED }}>หยุด</span>}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'kb' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>📚 ข้อมูลร้าน/สินค้า/FAQ</div>
              <div style={{ fontSize: 11, color: MUTED, marginBottom: 10 }}>
                ใส่ข้อมูลที่ AI ใช้อ้างอิงตอนตอบลูกค้า เช่น ราคาสินค้า, เวลาเปิด-ปิด, นโยบายการคืนสินค้า ฯลฯ
              </div>
              <textarea
                value={settings.knowledge_base || ''}
                onChange={e => setSettings({...settings, knowledge_base: e.target.value})}
                rows={14}
                placeholder={'ตัวอย่าง:\n- เปิดทำการ จ-ศ 9:00-18:00\n- ส่งฟรี EMS เมื่อสั่งครบ 1,000 บาท\n- สินค้ามีรับประกัน 1 ปี\n- คืนสินค้าได้ภายใน 7 วัน...'}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box' }}
              />
            </div>
          )}

          {tab === 'qr' && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>⚡ ข้อความสำเร็จรูป (ใช้ได้ทุกเพจ)</div>

              {/* Add new */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, background: SURFACE2, borderRadius: 12, marginBottom: 14 }}>
                <input value={newQR.shortcut} onChange={e => setNewQR({...newQR, shortcut: e.target.value})} placeholder="คำสั่ง เช่น /ราคา" style={{ padding: 8, borderRadius: 8, border: `1px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 12 }} />
                <input value={newQR.title} onChange={e => setNewQR({...newQR, title: e.target.value})} placeholder="ชื่อแสดง เช่น ตอบราคา" style={{ padding: 8, borderRadius: 8, border: `1px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 12 }} />
                <textarea value={newQR.message} onChange={e => setNewQR({...newQR, message: e.target.value})} placeholder="ข้อความเต็ม" rows={3} style={{ padding: 8, borderRadius: 8, border: `1px solid ${BORDER}`, fontFamily: 'inherit', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                <button onClick={addQR} style={{ ...btnPrimary, padding: '8px 12px', fontSize: 12 }}><Plus size={12} style={{ display: 'inline', marginRight: 4 }} />เพิ่ม</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {quickReplies.map(qr => (
                  <div key={qr.id} style={{ padding: 10, background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: PRIMARY, marginBottom: 2 }}>⚡ {qr.title} <span style={{ fontSize: 10, color: MUTED, fontWeight: 600 }}>{qr.shortcut}</span></div>
                      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{qr.message}</div>
                    </div>
                    <button onClick={() => deleteQR(qr.id)} style={{ ...btnGhost, padding: 6, color: RED, alignSelf: 'flex-start' }}><X size={12} /></button>
                  </div>
                ))}
                {quickReplies.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: MUTED, fontSize: 12 }}>ยังไม่มี Quick Reply</div>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: `1.5px solid ${BORDER}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ ...btnGhost, padding: '9px 16px', fontSize: 12, fontWeight: 700 }}>ยกเลิก</button>
          {tab !== 'qr' && (
            <button onClick={save} disabled={saving} style={{ ...btnPrimary, padding: '9px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              {saving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={12} />}
              บันทึก
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer', padding: '8px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{label}</div>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 42, height: 24, background: checked ? PRIMARY : '#cbd5e1', borderRadius: 999,
          position: 'relative', transition: 'all 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          width: 18, height: 18, background: 'white', borderRadius: '50%',
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          transition: 'all 0.2s', boxShadow: SHADOW_SM,
        }} />
      </div>
    </label>
  )
}
