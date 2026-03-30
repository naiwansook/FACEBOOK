'use client'
import { useEffect, useState } from 'react'

export default function Dashboard() {
  const [pages, setPages] = useState<any[]>([])
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [showModal, setShowModal] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    fetch('/api/pages').then(r => r.json()).then(d => setPages(d.pages || []))
    fetch('/api/ads').then(r => r.json()).then(d => setCampaigns(d.campaigns || []))
  }, [])

  const refreshCampaigns = () => {
    fetch('/api/ads').then(r => r.json()).then(d => setCampaigns(d.campaigns || []))
  }

  if (!mounted) return null

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: 'white', fontFamily: 'sans-serif', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>⚡ FB Ads AI</h1>
        <button onClick={() => setShowModal(true)}
          style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          + ยิงแอดใหม่
        </button>
      </div>

      <div style={{ marginBottom: 16, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>Pages ที่เชื่อมต่อ: {pages.length} pages</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pages.map((p: any) => (
            <span key={p.id} style={{ background: 'rgba(99,102,241,0.2)', color: '#a78bfa', padding: '4px 12px', borderRadius: 999, fontSize: 12 }}>
              {p.name}
            </span>
          ))}
        </div>
      </div>

      <div style={{ padding: 24, background: 'rgba(255,255,255,0.03)', borderRadius: 12, textAlign: 'center' }}>
        {campaigns.length === 0 ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📢</div>
            <p style={{ color: '#64748b', marginBottom: 16 }}>ยังไม่มีแอดใดๆ</p>
            <button onClick={() => setShowModal(true)}
              style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: 10, padding: '10px 20px', cursor: 'pointer', fontSize: 14 }}>
              + สร้างแอดแรกเลย
            </button>
          </>
        ) : (
          campaigns.map((c: any) => (
            <div key={c.id} style={{ padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 10, marginBottom: 8, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{c.campaign_name}</p>
                  <p style={{ fontSize: 12, color: '#64748b' }}>งบ: ฿{c.daily_budget}/วัน · สถานะ: {c.status}</p>
                  {c.fb_campaign_id && (
                    <p style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>FB ID: {c.fb_campaign_id}</p>
                  )}
                </div>
                <span style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 999,
                  background: c.status === 'active' ? 'rgba(74,222,128,0.15)' : 'rgba(100,116,139,0.15)',
                  color: c.status === 'active' ? '#4ade80' : '#64748b',
                }}>
                  {c.status === 'active' ? '● กำลังวิ่ง' : c.status}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <BoostModal
          pages={pages}
          onClose={() => setShowModal(false)}
          onSuccess={refreshCampaigns}
        />
      )}
    </div>
  )
}

function BoostModal({ pages, onClose, onSuccess }: { pages: any[], onClose: () => void, onSuccess: () => void }) {
  const [step, setStep] = useState(1)
  const [selectedPage, setSelectedPage] = useState<any>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [selectedPost, setSelectedPost] = useState<any>(null)
  const [budget, setBudget] = useState(100)
  const [days, setDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loadingPosts, setLoadingPosts] = useState(false)

  const fetchPosts = async (page: any) => {
    setLoadingPosts(true)
    setError('')
    try {
      const res = await fetch(
        `/api/posts?pageId=${page.id}&pageToken=${encodeURIComponent(page.access_token)}`
      )
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      }
      setPosts(data.posts || [])
    } catch {
      setError('ไม่สามารถดึงโพสต์ได้')
    } finally {
      setLoadingPosts(false)
    }
  }

  const handleSubmit = async () => {
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
        campaignName: `Boost - ${selectedPost.message?.slice(0, 30) || selectedPost.id}`,
        dailyBudget: budget,
        startDate: new Date().toISOString(),
        endDate: endDate.toISOString(),
      }),
    })

    const data = await res.json()
    setSubmitting(false)

    if (!res.ok || data.error) {
      setError(data.error || 'เกิดข้อผิดพลาด')
      return
    }

    onClose()
    onSuccess()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '80vh', overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>🚀 ยิงแอดใหม่ (ขั้นที่ {step}/3)</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#f87171' }}>
            ❌ {error}
          </div>
        )}

        {step === 1 && (
          <div>
            <p style={{ color: '#64748b', marginBottom: 12, fontSize: 13 }}>เลือก Page</p>
            {pages.length === 0 ? (
              <p style={{ color: '#ef4444', fontSize: 13 }}>ไม่พบ Page — ลอง Logout แล้ว Login ใหม่ครับ</p>
            ) : pages.map((p: any) => (
              <button key={p.id} onClick={() => { setSelectedPage(p); fetchPosts(p); setStep(2) }}
                style={{ width: '100%', padding: '12px 16px', marginBottom: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'white', cursor: 'pointer', textAlign: 'left', fontSize: 14 }}>
                {p.name}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div>
            <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>← กลับ</button>
            <p style={{ color: '#64748b', marginBottom: 12, fontSize: 13 }}>เลือกโพสต์จาก {selectedPage?.name}</p>
            {loadingPosts ? (
              <p style={{ color: '#64748b', fontSize: 13, textAlign: 'center', padding: 20 }}>กำลังโหลดโพสต์...</p>
            ) : posts.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: 13 }}>ไม่พบโพสต์</p>
            ) : posts.map((p: any) => (
              <button key={p.id} onClick={() => { setSelectedPost(p); setStep(3) }}
                style={{ width: '100%', padding: '12px 16px', marginBottom: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'white', cursor: 'pointer', textAlign: 'left', fontSize: 13 }}>
                {p.message?.slice(0, 80) || p.story || 'ไม่มีข้อความ'}
              </button>
            ))}
          </div>
        )}

        {step === 3 && (
          <div>
            <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', marginBottom: 12, fontSize: 13 }}>← กลับ</button>
            <p style={{ color: '#a78bfa', fontSize: 13, marginBottom: 16 }}>โพสต์: {selectedPost?.message?.slice(0, 60)}...</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>งบต่อวัน (บาท)</label>
              <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>จำนวนวัน</label>
              <input type="number" value={days} onChange={e => setDays(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <p style={{ fontSize: 13, color: '#4ade80', marginBottom: 16 }}>งบรวม: ฿{budget * days}</p>
            <button onClick={handleSubmit} disabled={submitting}
              style={{ width: '100%', padding: '12px', background: submitting ? '#4338ca' : '#6366f1', color: 'white', border: 'none', borderRadius: 10, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}>
              {submitting ? '⏳ กำลังสร้างแอด...' : '🚀 ยิงแอดเลย!'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
