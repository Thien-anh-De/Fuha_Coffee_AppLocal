import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Lock, Eye, EyeOff, X, ShieldCheck } from 'lucide-react'
import { userService } from '@/services/userService'
import { useAuth } from '@/hooks/useAuth'

interface Props {
  onClose: () => void
}

export function ChangePasswordModal({ onClose }: Props) {
  const { user } = useAuth()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!currentPw || !newPw || !confirmPw) {
      setError('Vui lòng điền đầy đủ thông tin')
      return
    }
    if (newPw.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }
    if (newPw !== confirmPw) {
      setError('Xác nhận mật khẩu không khớp')
      return
    }
    if (!user?.id) {
      setError('Không tìm thấy phiên đăng nhập')
      return
    }

    setLoading(true)
    try {
      await userService.changePassword(user.id, currentPw, newPw)
      setSuccess(true)
      setTimeout(() => onClose(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi đổi mật khẩu')
    } finally {
      setLoading(false)
    }
  }

  const content = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
          width: '100%',
          maxWidth: 420,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(236,72,153,0.06))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <Lock size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Đổi Mật Khẩu</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}>
            <X size={18} style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {success ? (
            <div style={{
              textAlign: 'center', padding: '1.5rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
            }}>
              <ShieldCheck size={48} style={{ color: '#10b981' }} />
              <p style={{ fontWeight: 600, fontSize: '1rem', color: '#10b981' }}>Đổi mật khẩu thành công!</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Cửa sổ sẽ tự đóng...</p>
            </div>
          ) : (
            <>
              {/* Mật khẩu hiện tại */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Mật khẩu hiện tại
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    className="input"
                    style={{ width: '100%', paddingRight: '2.5rem' }}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Nhập mật khẩu hiện tại"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                  >
                    {showCurrent ? <EyeOff size={16} style={{ color: 'var(--color-text-muted)' }} /> : <Eye size={16} style={{ color: 'var(--color-text-muted)' }} />}
                  </button>
                </div>
              </div>

              {/* Mật khẩu mới */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Mật khẩu mới
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNew ? 'text' : 'password'}
                    className="input"
                    style={{ width: '100%', paddingRight: '2.5rem' }}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="Tối thiểu 6 ký tự"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                  >
                    {showNew ? <EyeOff size={16} style={{ color: 'var(--color-text-muted)' }} /> : <Eye size={16} style={{ color: 'var(--color-text-muted)' }} />}
                  </button>
                </div>
              </div>

              {/* Xác nhận mật khẩu mới */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                  Xác nhận mật khẩu mới
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    className="input"
                    style={{ width: '100%', paddingRight: '2.5rem' }}
                    value={confirmPw}
                    onChange={(e) => setConfirmPw(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 }}
                  >
                    {showConfirm ? <EyeOff size={16} style={{ color: 'var(--color-text-muted)' }} /> : <Eye size={16} style={{ color: 'var(--color-text-muted)' }} />}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{
                  padding: '0.625rem 0.875rem',
                  background: '#fef2f2', color: '#991b1b',
                  border: '1px solid #fecaca', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>
                  Hủy
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                  {loading ? 'Đang lưu...' : 'Đổi mật khẩu'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
