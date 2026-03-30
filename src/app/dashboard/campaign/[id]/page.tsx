'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, Pause, Play, Zap, TrendingUp, Users, MousePointer, DollarSign, Activity } from 'lucide-react'

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

const recConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  keep_running:     { label: 'ปล่อยต่อไปเลย',      color: GREEN,        bg: 'rgba(74,222,128,0.1)',   icon: '✅' },
  increase_budget:  { label: 'เพิ่มงบได้เลย',       color: BLUE,         bg: 'rgba(96,165,250,0.1)',   icon: '💰' },
  extend_duration:  { label: 'ต่อระยะเวลา',         color: '#22d3ee',    bg: 'rgba(34,211,238,0.1)',   icon: '⏱️' },
  decrease_budget:  { label: 'ลดงบก่อน',            color: YELLOW,       bg: 'rgba(250,204,21,0.1)',   icon: '⚠️' },
  change_targeting: { label: 'เปลี่ยน Targeting',   color: '#f97316',    bg: 'rgba(249,115,22,0.1)',   icon: '🎯' },
  pause_ad:         { label: 'หยุดโฆษณา',           color: RED,          bg: 'rgba(248,113,113,0.1)',  icon: '🛑' },
}

function fmt(n: number | string | undefined, decimals = 0) {
  if (n === undefined || n === null || n === '') return '—'
  return Number(n).toLocaleString('th-TH', { maximumFractionDigits: decimals })
}
function fmtDate(d?: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [campaign, setCampaign] = useState<any>(null)
  const [perf, setPerf] = useState<any>(null)
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/ads/${id}`)
      const data = await res.json()
      if (!res.ok || data.error) { setError(data.error || 'โหลดข้อมูลไม่ได้'); return }
      setCampaign(data.campaign)
      setPerf(data.latestPerf)
      setAnalysis(data.latestAnalysis)
    } catch {
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูล')
    } finally {
      setLoading(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setError('')
    try {
      const res = await fetch(`/api/ads/${id}/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setPerf(data.performance)
      showToast('✅ ซิงค์ข้อมูลสำเร็จ')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSyncing(false)
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setError('')
    try {
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setAnalysis(data.analysis)
      showToast('🤖 AI วิเคราะห์เสร็จแล้ว')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleToggle() {
    if (!campaign) return
    setToggling(true)
    setError('')
    const action = campaign.status === 'active' ? 'pause' : 'resume'
    try {
      const res = await fetch(`/api/ads/${id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error)
      setCampaign((prev: any) => ({ ...prev, status: data.status }))
      showToast(action === 'pause' ? '⏸ หยุดแอดแล้ว' : '▶️ เปิดแอดแล้ว')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setToggling(false)
    }
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED }}>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div><p>กำลังโหลด...</p></div>
    </div>
  )

  if (error && !campaign) return (
    <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', color: TEXT }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <p style={{ color: RED, marginBottom: 16 }}>{error}</p>
        <button onClick={() => router.push('/dashboard')} style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer' }}>กลับ Dashboard</button>
      </div>
    </div>
  )

  const c = campaign
  const isActive = c?.status === 'active'
  const statusColor = isActive ? GREEN : c?.status === 'paused' ? YELLOW : MUTED
  const statusLabel = isActive ? '● กำลังวิ่ง' : c?.status === 'paused' ? '⏸ หยุดชั่วคราว' : c?.status

  const rec = analysis?.recommendation ? recConfig[analysis.recommendation] : null
  const confidence = analysis?.confidence_score ? Math.round(analysis.confidence_score * 100) : null

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT, fontFamily: "'Sarabun', sans-serif" }}>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', background: '#1e1e2e', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 600, zIndex: 300, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${BORDER}`, padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, background: BG, zIndex: 50 }}>
        <button onClick={() => router.push('/dashboard')}
          style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <ArrowLeft size={14} /> กลับ
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            📌 {c?.campaign_name}
          </h1>
        </div>
        <span style={{ fontSize: 11, color: statusColor, background: `${statusColor}18`, padding: '3px 10px', borderRadius: 999, flexShrink: 0 }}>
          {statusLabel}
        </span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>

        {error && (
          <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: RED }}>
            ❌ {error}
          </div>
        )}

        {/* Campaign Info */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
            <div><span style={{ color: MUTED }}>Page: </span><span>{c?.connected_pages?.page_name || '—'}</span></div>
            <div><span style={{ color: MUTED }}>งบ/วัน: </span><span style={{ fontWeight: 600 }}>฿{fmt(c?.daily_budget)}</span></div>
            <div><span style={{ color: MUTED }}>เริ่ม: </span><span>{fmtDate(c?.start_time)}</span></div>
            <div><span style={{ color: MUTED }}>สิ้นสุด: </span><span>{fmtDate(c?.end_time)}</span></div>
            {c?.fb_campaign_id && <div style={{ gridColumn: '1/-1' }}><span style={{ color: MUTED }}>FB ID: </span><span style={{ fontSize: 11, color: '#475569' }}>{c.fb_campaign_id}</span></div>}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={handleSync} disabled={syncing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: syncing ? MUTED : TEXT, cursor: syncing ? 'not-allowed' : 'pointer', fontSize: 12 }}>
              <RefreshCw size={13} className={syncing ? 'spin' : ''} />
              {syncing ? 'กำลังซิงค์...' : 'ซิงค์ข้อมูล'}
            </button>

            <button onClick={handleAnalyze} disabled={analyzing}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: analyzing ? CARD : 'rgba(99,102,241,0.12)', border: `1px solid ${analyzing ? BORDER : 'rgba(99,102,241,0.3)'}`, borderRadius: 8, color: analyzing ? MUTED : '#a78bfa', cursor: analyzing ? 'not-allowed' : 'pointer', fontSize: 12 }}>
              <Zap size={13} />
              {analyzing ? 'AI กำลังวิเคราะห์...' : 'วิเคราะห์ด้วย AI'}
            </button>

            {c?.fb_campaign_id && (
              <button onClick={handleToggle} disabled={toggling}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: isActive ? 'rgba(250,204,21,0.1)' : 'rgba(74,222,128,0.1)', border: `1px solid ${isActive ? 'rgba(250,204,21,0.3)' : 'rgba(74,222,128,0.3)'}`, borderRadius: 8, color: isActive ? YELLOW : GREEN, cursor: toggling ? 'not-allowed' : 'pointer', fontSize: 12, marginLeft: 'auto' }}>
                {isActive ? <Pause size={13} /> : <Play size={13} />}
                {toggling ? 'กำลังดำเนินการ...' : isActive ? 'หยุดแอด' : 'เปิดแอดอีกครั้ง'}
              </button>
            )}
          </div>
        </div>

        {/* Performance Metrics */}
        <h3 style={{ fontSize: 13, color: MUTED, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>📊 Performance</h3>
        {perf ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
              <MetricCard label="Impressions" value={fmt(perf.impressions)} icon={<Activity size={14} />} color={PURPLE} />
              <MetricCard label="Reach" value={fmt(perf.reach)} icon={<Users size={14} />} color={BLUE} />
              <MetricCard label="Clicks" value={fmt(perf.clicks)} icon={<MousePointer size={14} />} color="#22d3ee" />
              <MetricCard label="CTR" value={`${fmt(perf.ctr, 2)}%`} icon={<TrendingUp size={14} />} color={perf.ctr >= 1.5 ? GREEN : perf.ctr >= 0.8 ? YELLOW : RED} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
              <MetricCard label="ยอดใช้จ่าย" value={`฿${fmt(perf.spend, 2)}`} icon={<DollarSign size={14} />} color={GREEN} />
              <MetricCard label="CPM" value={`฿${fmt(perf.cpm, 2)}`} icon={<DollarSign size={14} />} color={perf.cpm <= 80 ? GREEN : perf.cpm <= 150 ? YELLOW : RED} />
              <MetricCard label="CPC" value={`฿${fmt(perf.cpc, 2)}`} icon={<DollarSign size={14} />} color={perf.cpc <= 5 ? GREEN : perf.cpc <= 15 ? YELLOW : RED} />
              <MetricCard label="Frequency" value={fmt(perf.frequency, 2)} icon={<Activity size={14} />} color={perf.frequency <= 3 ? GREEN : perf.frequency <= 5 ? YELLOW : RED} />
            </div>

            {/* Engagement */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 10 }}>❤️ Engagement</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(perf.likes)}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Likes</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(perf.comments)}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Comments</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(perf.shares)}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>Shares</div>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 10, color: '#374151', marginBottom: 16 }}>
              อัปเดตล่าสุด: {perf.fetched_at ? new Date(perf.fetched_at).toLocaleString('th-TH') : '—'}
            </p>
          </>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', marginBottom: 16 }}>
            <p style={{ color: MUTED, fontSize: 14, marginBottom: 12 }}>ยังไม่มีข้อมูล performance</p>
            <button onClick={handleSync} disabled={syncing}
              style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontSize: 13 }}>
              {syncing ? 'กำลังโหลด...' : '🔄 ซิงค์จาก Facebook'}
            </button>
          </div>
        )}

        {/* AI Analysis */}
        <h3 style={{ fontSize: 13, color: MUTED, marginBottom: 10, letterSpacing: '0.05em', textTransform: 'uppercase' }}>🤖 AI Analysis</h3>
        {analysis ? (
          <div style={{ background: rec ? rec.bg : CARD, border: `1px solid ${rec ? rec.color + '40' : BORDER}`, borderRadius: 14, padding: '18px 20px' }}>
            {/* Recommendation Badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>{rec?.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: rec?.color }}>{rec?.label}</div>
                  {confidence !== null && (
                    <div style={{ fontSize: 11, color: MUTED }}>ความมั่นใจ {confidence}%</div>
                  )}
                </div>
              </div>
              <button onClick={handleAnalyze} disabled={analyzing}
                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 12px', cursor: analyzing ? 'not-allowed' : 'pointer', fontSize: 11, color: MUTED }}>
                {analyzing ? '⏳ กำลังวิเคราะห์' : '🔄 วิเคราะห์ใหม่'}
              </button>
            </div>

            {/* Summary */}
            {analysis.summary && (
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, lineHeight: 1.6 }}>
                {analysis.summary}
              </div>
            )}

            {/* Confidence Bar */}
            {confidence !== null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: MUTED, marginBottom: 4 }}>
                  <span>Confidence</span><span>{confidence}%</span>
                </div>
                <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${confidence}%`, background: rec?.color || PURPLE, borderRadius: 2 }} />
                </div>
              </div>
            )}

            {/* Reasoning */}
            {analysis.reasoning && (
              <details style={{ marginBottom: 12 }}>
                <summary style={{ fontSize: 12, color: MUTED, cursor: 'pointer', marginBottom: 6 }}>เหตุผลเพิ่มเติม</summary>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, marginTop: 8 }}>{analysis.reasoning}</div>
              </details>
            )}

            {/* Action Items */}
            {analysis.action_items?.length > 0 && (
              <div>
                <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>📋 สิ่งที่ต้องทำ</p>
                {analysis.action_items.map((item: string, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: rec?.color, flexShrink: 0, marginTop: 2 }}>→</span>
                    <span style={{ color: '#cbd5e1', lineHeight: 1.5 }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {analysis.created_at && (
              <p style={{ fontSize: 10, color: '#374151', marginTop: 12, marginBottom: 0 }}>
                วิเคราะห์เมื่อ: {new Date(analysis.created_at).toLocaleString('th-TH')}
              </p>
            )}
          </div>
        ) : (
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
            <p style={{ color: MUTED, fontSize: 14, marginBottom: 12 }}>ยังไม่มีการวิเคราะห์</p>
            <button onClick={handleAnalyze} disabled={analyzing}
              style={{ background: PURPLE, color: 'white', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: analyzing ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600 }}>
              {analyzing ? '⏳ กำลังวิเคราะห์...' : '🤖 วิเคราะห์ด้วย AI เลย'}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  )
}

function MetricCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, color }}>
        {icon}
        <span style={{ fontSize: 10, color: MUTED }}>{label}</span>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}
