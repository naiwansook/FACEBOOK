'use client'
import { useEffect, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'

const BG = '#eef2ff', SURFACE = '#ffffff'
const BORDER = 'rgba(99,102,241,0.13)'
const TEXT = '#1a1f3c', MUTED = '#6b7280'
const PRIMARY = '#4338ca', GREEN = '#059669', RED = '#dc2626'

type InvitePreview = {
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  role: string
  ownerName: string
  ownerImage: string | null
  note: string | null
  pages: { page_name: string; page_picture: string | null }[]
  expiresAt: string
  error?: string
}

export default function InviteAcceptPage() {
  const params = useParams() as { token: string }
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    if (!params.token) return
    fetch(`/api/team/invitations/${params.token}`)
      .then(async r => {
        const data = await r.json()
        if (!r.ok) {
          setErrorMsg(data.error || 'ไม่สามารถโหลดคำเชิญได้')
        } else {
          setPreview(data)
        }
      })
      .catch(e => setErrorMsg(e.message))
      .finally(() => setLoading(false))
  }, [params.token])

  async function handleAccept() {
    if (accepting) return
    setAccepting(true)
    try {
      const res = await fetch(`/api/team/invitations/${params.token}/accept`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        alert('ยอมรับคำเชิญไม่สำเร็จ: ' + (data.error || 'unknown'))
        setAccepting(false)
        return
      }
      router.push(data.redirect || '/dashboard')
    } catch (e: any) {
      alert('เกิดข้อผิดพลาด: ' + e.message)
      setAccepting(false)
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh', background: BG,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Sarabun', sans-serif", padding: 20, position: 'relative',
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ color: MUTED, fontWeight: 700 }}>กำลังโหลดคำเชิญ...</div>
      </div>
    )
  }

  if (errorMsg || !preview) {
    return (
      <div style={containerStyle}>
        <div style={{
          maxWidth: 420, background: SURFACE, borderRadius: 22, padding: '30px 28px',
          border: `1.5px solid ${BORDER}`, textAlign: 'center',
          boxShadow: '8px 8px 28px rgba(99,102,241,0.14), -6px -6px 20px rgba(255,255,255,0.95)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 20, color: TEXT, fontWeight: 900, margin: '0 0 10px' }}>
            ไม่สามารถใช้คำเชิญนี้ได้
          </h1>
          <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, fontWeight: 600 }}>
            {errorMsg || 'คำเชิญอาจหมดอายุ ถูกใช้ไปแล้ว หรือถูกยกเลิก'}
          </p>
          <a href="/" style={{
            display: 'inline-block', marginTop: 20, padding: '11px 26px',
            background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 55%, #818cf8 100%)',
            color: 'white', borderRadius: 12, fontSize: 13, fontWeight: 800,
            textDecoration: 'none',
            boxShadow: '0 6px 22px rgba(67,56,202,0.42), 0 2px 6px rgba(67,56,202,0.25)',
          }}>
            กลับหน้าแรก
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Tech grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(rgba(99,102,241,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.05) 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />
      <div style={{ position: 'fixed', top: '-8%', right: '-5%', width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 65%)', zIndex: 0, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 460 }}>
        <div style={{
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(24px)',
          border: `1.5px solid ${BORDER}`, borderRadius: 26, padding: '30px 28px',
          boxShadow: '8px 8px 28px rgba(99,102,241,0.14), -6px -6px 20px rgba(255,255,255,0.95)',
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{
              width: 64, height: 64, margin: '0 auto 14px',
              background: 'linear-gradient(135deg, #4338ca 0%, #6366f1 55%, #818cf8 100%)',
              borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
              boxShadow: '0 6px 22px rgba(67,56,202,0.42)',
            }}>👋</div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: TEXT, margin: '0 0 4px' }}>
              คุณได้รับคำเชิญ
            </h1>
            <p style={{ color: MUTED, fontSize: 13, margin: 0, fontWeight: 600 }}>
              ให้เข้าร่วมเป็น <strong style={{ color: PRIMARY }}>{preview.role === 'agent' ? 'แอดมินตอบแชท' : preview.role}</strong>
            </p>
          </div>

          {/* Owner */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)',
            borderRadius: 14, marginBottom: 14, border: `1px solid ${BORDER}`,
          }}>
            {preview.ownerImage ? (
              <img src={preview.ownerImage} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1.5px solid white' }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900 }}>
                {preview.ownerName[0]}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 11, color: MUTED, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>เชิญโดย</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: TEXT }}>{preview.ownerName}</div>
            </div>
          </div>

          {/* Pages */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
              เพจที่คุณจะดูแล ({preview.pages.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
              {preview.pages.map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  background: '#f5f7ff', border: `1px solid ${BORDER}`, borderRadius: 10,
                }}>
                  {p.page_picture ? (
                    <img src={p.page_picture} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 18 }}>📄</span>
                  )}
                  <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>{p.page_name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Note */}
          {preview.note && (
            <div style={{
              background: '#fef3c7', border: '1px solid rgba(217,119,6,0.25)', borderRadius: 10,
              padding: '10px 12px', marginBottom: 18, fontSize: 12, color: '#92400e', lineHeight: 1.6,
            }}>
              💬 {preview.note}
            </div>
          )}

          {/* What can agent do */}
          <div style={{
            background: '#f0fdf4', border: '1px solid rgba(5,150,105,0.18)', borderRadius: 10,
            padding: '11px 14px', marginBottom: 22, fontSize: 12, color: '#065f46', lineHeight: 1.7,
          }}>
            <strong>สิทธิ์ของคุณ:</strong> ตอบแชทลูกค้า · ขอ AI ช่วยตอบ · ใช้ quick replies
            <br /><strong style={{ color: MUTED }}>ไม่สามารถ:</strong> ยิงแอด · ดูค่าใช้จ่าย · จัดการทีม
          </div>

          {/* Actions */}
          {sessionStatus === 'loading' ? (
            <div style={{ textAlign: 'center', color: MUTED, fontSize: 13 }}>กำลังตรวจสอบ...</div>
          ) : !session ? (
            <button
              onClick={() => signIn('facebook', { callbackUrl: `/invite/${params.token}` })}
              style={{
                width: '100%', padding: '14px 24px',
                background: 'linear-gradient(135deg, #1877f2 0%, #0d65d9 100%)',
                color: 'white', border: 'none', borderRadius: 14,
                fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 6px 22px rgba(24,119,242,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              เข้าสู่ระบบด้วย Facebook เพื่อยอมรับ
            </button>
          ) : (
            <>
              <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f0fdf4', borderRadius: 10, fontSize: 12, color: '#065f46', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✅</span>
                <span>คุณ login ในชื่อ <strong>{session.user?.name}</strong></span>
              </div>
              <button
                onClick={handleAccept}
                disabled={accepting}
                style={{
                  width: '100%', padding: '14px 24px',
                  background: accepting ? '#94a3b8' : 'linear-gradient(135deg, #4338ca 0%, #6366f1 55%, #818cf8 100%)',
                  color: 'white', border: 'none', borderRadius: 14,
                  fontSize: 14, fontWeight: 800, cursor: accepting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  boxShadow: accepting ? 'none' : '0 6px 22px rgba(67,56,202,0.42)',
                }}
              >
                {accepting ? 'กำลังยอมรับ...' : '✓ ยอมรับคำเชิญและเข้าใช้งาน'}
              </button>
            </>
          )}

          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, fontWeight: 500, textAlign: 'center' }}>
            🔒 คำเชิญจะหมดอายุ {new Date(preview.expiresAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>
    </div>
  )
}
