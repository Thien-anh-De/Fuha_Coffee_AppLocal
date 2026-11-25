import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { ChangePasswordModal } from '@/components/ChangePasswordModal'
import {
  CupSoda,
  LayoutDashboard,
  ShoppingCart,
  Grid3X3,
  Package,
  Receipt,
  BarChart3,
  Users,
  LogOut,
  ChevronRight,
  Printer,
  Database,
  Menu,
  X,
  Lock,
  ZoomIn,
  ZoomOut,
  Scale,
} from 'lucide-react'
import { useZoom } from '@/hooks/useZoom'
import type { ReactNode } from 'react'
import type { UserRole } from '@/types'

const navItems: { to: string; icon: typeof ShoppingCart; label: string; roles: UserRole[] }[] = [
  { to: '/overview', icon: LayoutDashboard, label: 'Tổng quan', roles: ['OWNER', 'MANAGER'] },
  { to: '/pos', icon: ShoppingCart, label: 'Bán hàng', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
  { to: '/tables', icon: Grid3X3, label: 'Quản lý bàn', roles: ['OWNER', 'MANAGER'] },
  { to: '/products', icon: Package, label: 'Quản lý món', roles: ['OWNER', 'MANAGER'] },
  { to: '/materials', icon: Scale, label: 'Hao hụt nguyên liệu', roles: ['OWNER', 'MANAGER'] },
  { to: '/invoices', icon: Receipt, label: 'Hóa đơn', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
  { to: '/reports', icon: BarChart3, label: 'Doanh thu', roles: ['OWNER', 'MANAGER'] },
  { to: '/users', icon: Users, label: 'Nhân viên', roles: ['OWNER', 'MANAGER'] },
  { to: '/printer', icon: Printer, label: 'Máy in hóa đơn', roles: ['OWNER', 'MANAGER', 'CASHIER'] },
  { to: '/settings', icon: Database, label: 'Cài đặt & Dữ liệu', roles: ['OWNER', 'MANAGER'] },
]

export function MainLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { zoomPercent, zoomIn, zoomOut, resetZoom } = useZoom()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showChangePw, setShowChangePw] = useState(false)

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const roleLabel = {
    OWNER: 'Chủ quán',
    MANAGER: 'Quản lý',
    CASHIER: 'Thu ngân',
  }

  const currentNav = navItems.find((item) => item.to === location.pathname)
  const pageTitle = currentNav?.label || 'FuHa Cafe'
  const isPos = location.pathname === '/pos'

  return (
    <div className="app-container" style={{ display: 'flex', height: '100%', maxHeight: '100%', overflow: 'hidden' }}>
      {/* Mobile Header */}
      <header className="mobile-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div
            style={{
              width: 34, height: 34,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #8B4513, #D2691E)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <CupSoda size={18} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-coffee-800)', lineHeight: 1.2 }}>
              FuHa Cafe
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{pageTitle}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ padding: '0.5rem' }}>
          {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* ── HOVER SIDEBAR ── */}
      <nav className={`sidebar hover-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem', marginBottom: '1rem', overflow: 'hidden' }}>
          <div
            style={{
              width: 36, height: 36, borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #8B4513, #D2691E)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: '0 3px 10px rgba(139, 69, 19, 0.3)',
            }}
          >
            <CupSoda size={20} color="white" />
          </div>
          <div className="sidebar-expand-content" style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--color-coffee-300)' }}>FuHa Cafe</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>Coffee & Tea</div>
          </div>
          <button
            className="btn btn-ghost btn-sm mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
            style={{ padding: '0.25rem', flexShrink: 0, marginLeft: 'auto' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav Links */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
          {navItems
            .filter((item) => profile && item.roles.includes(profile.role))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <item.icon size={18} style={{ flexShrink: 0 }} />
                <span className="sidebar-expand-content sidebar-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {item.label}
                </span>
                <ChevronRight size={14} className="sidebar-expand-content sidebar-chevron" style={{ opacity: 0.3, flexShrink: 0 }} />
              </NavLink>
            ))}
        </div>
        {/* ── ZOOM CONTROLS (Tỉ lệ màn hình) ── */}
        <div
          className="sidebar-zoom-section"
          style={{
            marginTop: 'auto',
            padding: '0.45rem 0.35rem',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {/* Khi sidebar thu nhỏ (collapsed): Biểu tượng kính lúp */}
          <div
            className="sidebar-collapse-only"
            title={`Tỉ lệ hiển thị: ${zoomPercent}%\n• Phóng to: Ctrl + +\n• Thu nhỏ: Ctrl + -\n• Mặc định: Ctrl + 0`}
            onClick={resetZoom}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: '0.35rem 0',
              borderRadius: 'var(--radius-sm)',
              color: zoomPercent !== 100 ? 'var(--color-coffee-600)' : 'var(--color-text-muted)',
              fontWeight: 700,
            }}
          >
            <ZoomIn size={16} />
          </div>

          {/* Khi sidebar mở rộng (expanded): Nút bấm - 100% + */}
          <div
            className="sidebar-expand-content"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--color-surface, #f8fafc)',
              borderRadius: 'var(--radius-md)',
              padding: '0.2rem 0.35rem',
              border: '1px solid var(--color-border)',
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={zoomOut}
              title="Thu nhỏ màn hình [Ctrl -]"
              style={{ padding: '0.2rem 0.35rem', height: '22px', minWidth: '22px' }}
            >
              <ZoomOut size={13} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={resetZoom}
              title="Bấm để đặt lại 100% [Ctrl 0]"
              style={{
                padding: '0.1rem 0.25rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                color: zoomPercent !== 100 ? 'var(--color-coffee-600)' : 'var(--color-text-secondary)',
                lineHeight: 1,
              }}
            >
              {zoomPercent}%
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={zoomIn}
              title="Phóng to màn hình [Ctrl +]"
              style={{ padding: '0.2rem 0.35rem', height: '22px', minWidth: '22px' }}
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>

        {/* User Info + Actions */}
        <div
          className="sidebar-user-section"
          style={{
            padding: '0.625rem 0.5rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <div className="sidebar-expand-content sidebar-user-info" style={{ marginBottom: '0.375rem', paddingLeft: '0.375rem' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
              {profile?.name ?? 'User'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
              {profile ? roleLabel[profile.role] : ''}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowChangePw(true)}
              title="Đổi mật khẩu"
              style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem' }}
            >
              <Lock size={15} style={{ flexShrink: 0 }} />
              <span className="sidebar-expand-content">Đổi mật khẩu</span>
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleSignOut}
              title="Đăng xuất"
              style={{ width: '100%', justifyContent: 'flex-start', gap: '0.5rem' }}
            >
              <LogOut size={16} style={{ flexShrink: 0 }} />
              <span className="sidebar-expand-content">Đăng xuất</span>
            </button>
          </div>
        </div>
      </nav>

      {showChangePw && <ChangePasswordModal onClose={() => setShowChangePw(false)} />}

      {/* Spacer for fixed sidebar */}
      <div className="sidebar-spacer" />

      {/* Main Content */}
      <main
        className="main-content"
        style={{
          flex: 1,
          padding: isPos ? '0.625rem 0.875rem' : '1.25rem 1.5rem',
          overflowY: isPos ? 'hidden' : 'auto',
          height: '100%',
          maxHeight: '100%',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </main>
    </div>
  )
}
