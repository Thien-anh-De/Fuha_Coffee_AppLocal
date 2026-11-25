import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { userService } from '@/services/userService'
import { ToastContainer, Modal, EmptyState, LoadingSpinner, ConfirmDialog } from '@/components/ui'
import type { Profile, UserRole } from '@/types'
import { Users, Plus, Edit2, UserCheck, UserX, Shield, Trash2, KeyRound, Lock } from 'lucide-react'

const isSystemAdmin = (u?: Profile | null) => {
  if (!u) return false
  const email = u.email?.toLowerCase()
  return (
    u.id === 'user-owner-admin' ||
    u.id === 'user-owner-002' ||
    email === 'admin' ||
    email === 'admin@fuha.vn' ||
    email === 'admin@fuha.com'
  )
}

export default function UsersPage() {
  const { hasRole, profile: currentUser } = useAuth()
  const isCurrentAdmin = isSystemAdmin(currentUser)
  const { toasts, success, error: toastError, removeToast } = useToast()
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editingUser, setEditingUser] = useState<Profile | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Profile | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Reset password
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetTarget, setResetTarget] = useState<Profile | null>(null)
  const [resetNewPw, setResetNewPw] = useState('123456')
  const [resettingPw, setResettingPw] = useState(false)

  // Form
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('123456')
  const [formName, setFormName] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('CASHIER')

  const loadData = useCallback(async () => {
    try {
      const data = await userService.getAll()
      setUsers(data)
    } catch {
      toastError('Không thể tải danh sách')
    } finally {
      setLoading(false)
    }
  }, [toastError])

  useEffect(() => { loadData() }, [loadData])

  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async () => {
    const email = formEmail.trim().toLowerCase()
    const name = formName.trim()

    if (!email || !formPassword || !name) {
      toastError('Vui lòng điền đầy đủ thông tin')
      return
    }

    if (formPassword.length < 6) {
      toastError('Mật khẩu phải có tối thiểu 6 ký tự')
      return
    }

    setSubmitting(true)
    try {
      await userService.createUser(email, formPassword, name, formRole)
      success('Đã thêm tài khoản thành công')
      setShowAdd(false)
      setFormEmail('')
      setFormPassword('123456')
      setFormName('')
      setFormRole('CASHIER')
      loadData()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Lỗi khi thêm tài khoản')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditRole = async () => {
    if (!editingUser) return
    if (isSystemAdmin(editingUser) && !isCurrentAdmin) {
      toastError('Không thể thay đổi thông tin của tài khoản Admin hệ thống')
      setShowEdit(false)
      return
    }
    try {
      await userService.update(editingUser.id, { role: formRole, name: formName.trim() })
      success('Đã cập nhật')
      setShowEdit(false)
      loadData()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Lỗi khi cập nhật')
    }
  }

  const handleToggle = async () => {
    if (!confirmToggle) return
    if (isSystemAdmin(confirmToggle)) {
      toastError('Tài khoản Admin hệ thống luôn hoạt động, không thể khóa')
      setConfirmToggle(null)
      return
    }
    try {
      await userService.toggleStatus(confirmToggle.id, confirmToggle.status)
      success(confirmToggle.status === 'active' ? 'Đã khóa tài khoản' : 'Đã mở khóa')
      setConfirmToggle(null)
      loadData()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Lỗi khi thay đổi trạng thái')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    if (isSystemAdmin(confirmDelete)) {
      toastError('Tài khoản Admin hệ thống được bảo vệ vĩnh viễn, không thể xóa')
      setConfirmDelete(null)
      return
    }
    setDeleting(true)
    try {
      await userService.deleteUser(confirmDelete.id)
      success(`Đã xóa tài khoản "${confirmDelete.name}" thành công`)
      setConfirmDelete(null)
      loadData()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Lỗi khi xóa tài khoản')
    } finally {
      setDeleting(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    if (isSystemAdmin(resetTarget) && !isCurrentAdmin) {
      toastError('Chỉ tài khoản Admin mới có quyền đổi mật khẩu của Admin hệ thống')
      setShowResetPw(false)
      return
    }
    if (!resetNewPw || resetNewPw.length < 6) {
      toastError('Mật khẩu phải có tối thiểu 6 ký tự')
      return
    }
    setResettingPw(true)
    try {
      await userService.resetPassword(resetTarget.id, resetNewPw)
      success(`Đã đặt lại mật khẩu cho "${resetTarget.name}"`)
      setShowResetPw(false)
      setResetTarget(null)
      setResetNewPw('123456')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Lỗi đặt lại mật khẩu')
    } finally {
      setResettingPw(false)
    }
  }

  const openEdit = (u: Profile) => {
    if (isSystemAdmin(u) && !isCurrentAdmin) {
      toastError('Tài khoản Admin hệ thống được bảo vệ')
      return
    }
    setEditingUser(u)
    setFormName(u.name)
    setFormRole(u.role)
    setShowEdit(true)
  }

  const openResetPw = (u: Profile) => {
    if (isSystemAdmin(u) && !isCurrentAdmin) {
      toastError('Chủ quán không thể đổi mật khẩu của tài khoản Admin')
      return
    }
    setResetTarget(u)
    setResetNewPw('123456')
    setShowResetPw(true)
  }

  const roleLabel: Record<UserRole, string> = {
    OWNER: 'Chủ quán',
    MANAGER: 'Quản lý',
    CASHIER: 'Thu ngân',
  }

  const roleBadge: Record<UserRole, string> = {
    OWNER: 'badge-coffee',
    MANAGER: 'badge-info',
    CASHIER: 'badge-success',
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <LoadingSpinner size={32} />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Nhân viên</h1>
          <p className="page-subtitle">{users.length} tài khoản</p>
        </div>
        {hasRole('OWNER', 'MANAGER') && (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
            <Plus size={16} />
            Thêm tài khoản
          </button>
        )}
      </div>

      {users.length === 0 ? (
        <EmptyState icon={<Users size={48} />} title="Chưa có tài khoản nào" />
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tên</th>
                <th>Tài khoản / Email</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, var(--color-coffee-600), var(--color-coffee-800))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          color: 'white',
                          flexShrink: 0,
                        }}
                      >
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      {u.name}
                      {u.id === currentUser?.id && (
                        <span className="badge badge-coffee" style={{ fontSize: '0.625rem' }}>Bạn</span>
                      )}
                    </div>
                  </td>
                  <td>{u.email ?? '—'}</td>
                  <td>
                    {isSystemAdmin(u) ? (
                      <span
                        className="badge"
                        style={{
                          background: 'rgba(124, 58, 237, 0.15)',
                          color: '#8B4513',
                          borderColor: 'rgba(124, 58, 237, 0.3)',
                          fontWeight: 600,
                        }}
                      >
                        <Shield size={10} style={{ marginRight: 4 }} />
                        Admin hệ thống
                      </span>
                    ) : (
                      <span className={`badge ${roleBadge[u.role]}`}>
                        <Shield size={10} style={{ marginRight: 4 }} />
                        {roleLabel[u.role]}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                      {u.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {u.id === currentUser?.id ? null : (
                      isSystemAdmin(u) && !isCurrentAdmin ? (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <span
                            className="badge"
                            style={{
                              fontSize: '0.75rem',
                              padding: '0.3rem 0.625rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              background: 'rgba(124, 58, 237, 0.08)',
                              color: 'var(--color-text-muted)',
                              border: '1px solid rgba(124, 58, 237, 0.2)',
                            }}
                            title="Tài khoản Admin hệ thống được bảo vệ, Chủ quán không thể chỉnh sửa hay xóa"
                          >
                            <Lock size={12} style={{ color: '#8B4513' }} /> Được bảo vệ
                          </span>
                        </div>
                      ) : hasRole('OWNER', 'MANAGER') ? (
                        <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)} title="Sửa thông tin">
                            <Edit2 size={14} />
                          </button>
                          {hasRole('OWNER') && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => openResetPw(u)}
                              title="Đặt lại mật khẩu"
                              style={{ color: '#7B3F00' }}
                            >
                              <KeyRound size={14} />
                            </button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmToggle(u)} title={u.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}>
                            {u.status === 'active' ? <UserX size={14} /> : <UserCheck size={14} />}
                          </button>
                          {hasRole('OWNER') && !isSystemAdmin(u) && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setConfirmDelete(u)}
                              style={{ color: 'var(--color-danger)' }}
                              title="Xóa tài khoản"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ) : null
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Thêm tài khoản">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="input-label">Tên hiển thị</label>
            <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Nguyễn Văn A" />
          </div>
          <div>
            <label className="input-label">Email đăng nhập</label>
            <input className="input" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="nv@fuha.vn" />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
              Dùng email để đăng nhập vào hệ thống
            </span>
          </div>
          <div>
            <label className="input-label">Mật khẩu</label>
            <input className="input" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} placeholder="Tối thiểu 6 ký tự" />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
              Mặc định: 123456
            </span>
          </div>
          <div>
            <label className="input-label">Vai trò</label>
            <select className="select" value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)}>
              <option value="CASHIER">Thu ngân</option>
              <option value="MANAGER">Quản lý</option>
              {hasRole('OWNER') && <option value="OWNER">Chủ quán</option>}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setShowAdd(false)} disabled={submitting}>Hủy</button>
            <button className="btn btn-primary" onClick={handleAdd} disabled={submitting}>
              {submitting ? 'Đang thêm...' : 'Thêm tài khoản'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Sửa — ${editingUser?.name ?? ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="input-label">Tên hiển thị</label>
            <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Vai trò</label>
            <select
              className="select"
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as UserRole)}
              disabled={isSystemAdmin(editingUser)}
            >
              {isSystemAdmin(editingUser) ? (
                <option value="OWNER">Admin hệ thống (Cố định)</option>
              ) : (
                <>
                  <option value="CASHIER">Thu ngân</option>
                  <option value="MANAGER">Quản lý</option>
                  {hasRole('OWNER') && <option value="OWNER">Chủ quán</option>}
                </>
              )}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowEdit(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleEditRole}>Cập nhật</button>
          </div>
        </div>
      </Modal>

      {/* Reset Password Modal */}
      <Modal open={showResetPw} onClose={() => setShowResetPw(false)} title={`Đặt lại mật khẩu — ${resetTarget?.name ?? ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(124,58,237,0.07)',
            border: '1px solid rgba(124,58,237,0.2)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.85rem',
            color: 'var(--color-text-muted)',
          }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>{resetTarget?.email}</strong><br />
            Nhập mật khẩu mới để đặt lại cho tài khoản này.
          </div>
          <div>
            <label className="input-label">Mật khẩu mới</label>
            <input
              className="input"
              type="text"
              value={resetNewPw}
              onChange={(e) => setResetNewPw(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem', display: 'block' }}>
              Mặc định: 123456
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowResetPw(false)} disabled={resettingPw}>Hủy</button>
            <button
              className="btn btn-primary"
              onClick={handleResetPassword}
              disabled={resettingPw}
              style={{ background: '#7B3F00', borderColor: '#7B3F00' }}
            >
              <KeyRound size={14} />
              {resettingPw ? 'Đang đặt lại...' : 'Đặt lại mật khẩu'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Toggle Confirm */}
      <ConfirmDialog
        open={!!confirmToggle}
        title={confirmToggle?.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}
        message={`Bạn có muốn ${confirmToggle?.status === 'active' ? 'khóa' : 'mở khóa'} tài khoản "${confirmToggle?.name}" không?`}
        danger={confirmToggle?.status === 'active'}
        onConfirm={handleToggle}
        onCancel={() => setConfirmToggle(null)}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Xóa tài khoản"
        message={`Bạn có chắc chắn muốn xóa tài khoản "${confirmDelete?.name}"? Thao tác này sẽ xóa tài khoản vĩnh viễn.`}
        confirmText={deleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
