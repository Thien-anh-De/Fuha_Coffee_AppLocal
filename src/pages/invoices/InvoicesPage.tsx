import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { orderService } from '@/services/orderService'
import { ToastContainer, EmptyState, LoadingSpinner, Modal, ConfirmDialog } from '@/components/ui'
import { formatCurrency, formatDateTime } from '@/utils/helpers'
import type { Order } from '@/types'
import { Receipt, Search, Calendar, Eye, XCircle, Filter, Printer, Lock, User, Trash2, Edit2, FileText } from 'lucide-react'
import { printReceipt, type PrintableOrder } from '@/utils/printer'
import SalesReportVerticalHorizontal from '@/components/SalesReportVerticalHorizontal'

export default function InvoicesPage() {
  const { user, hasRole } = useAuth()
  const isEmployee = !hasRole('OWNER', 'MANAGER')

  const getTodayStr = () => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  const { toasts, success, error: toastError, removeToast } = useToast()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [showReportModal, setShowReportModal] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [cashierFilter, setCashierFilter] = useState('ALL')

  // Detail modal
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)

  // Cancel
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  // Edit / Delete for OWNER
  const [deleteOrder, setDeleteOrder] = useState<Order | null>(null)
  const [editOrder, setEditOrder] = useState<Order | null>(null)
  const [editDiscount, setEditDiscount] = useState<number>(0)
  const [editTotal, setEditTotal] = useState<number>(0)
  const [editNote, setEditNote] = useState<string>('')
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>('CASH')

  const loadOrders = useCallback(async () => {
    try {
      const today = getTodayStr()
      const effectiveFrom = isEmployee ? today : dateFrom
      const effectiveTo = isEmployee ? today : dateTo

      const data = await orderService.getAll({
        status: statusFilter || undefined,
        from: effectiveFrom ? new Date(`${effectiveFrom}T00:00:00`).toISOString() : undefined,
        to: effectiveTo ? new Date(`${effectiveTo}T23:59:59.999`).toISOString() : undefined,
        search: search || undefined,
      })
      setOrders(data)
    } catch {
      toastError('Không thể tải hóa đơn')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, dateFrom, dateTo, search, isEmployee, toastError])

  useEffect(() => { loadOrders() }, [loadOrders])

  const uniqueCashiers = useMemo(() => {
    const s = new Set<string>()
    orders.forEach(o => {
      s.add(o.cashier?.name || 'Chủ quán')
    })
    return Array.from(s)
  }, [orders])

  const displayOrders = useMemo(() => {
    if (cashierFilter === 'ALL') return orders
    return orders.filter(o => (o.cashier?.name || 'Chủ quán') === cashierFilter)
  }, [orders, cashierFilter])

  const handleCancel = async () => {
    if (!cancelOrder || !user || !cancelReason.trim()) {
      toastError('Vui lòng nhập lý do hủy')
      return
    }
    try {
      await orderService.cancel(cancelOrder.id, user.id, cancelReason.trim())
      success('Đã hủy hóa đơn')
      setCancelOrder(null)
      setCancelReason('')
      loadOrders()
    } catch {
      toastError('Lỗi khi hủy hóa đơn')
    }
  }

  const handleDelete = async () => {
    if (!deleteOrder || !user) return
    try {
      await orderService.delete(deleteOrder.id, user.id, 'Chủ quán xóa vĩnh viễn')
      success('Đã xóa hóa đơn vĩnh viễn')
      setDeleteOrder(null)
      loadOrders()
    } catch {
      toastError('Lỗi khi xóa hóa đơn')
    }
  }

  const openEdit = (order: Order) => {
    setEditOrder(order)
    setEditDiscount(order.discount)
    setEditTotal(order.total)
    setEditNote(order.cancel_reason || '')
    setEditPaymentMethod(order.payment?.method || 'CASH')
  }

  const handleEdit = async () => {
    if (!editOrder || !user) return
    try {
      await orderService.update(editOrder.id, {
        discount: editDiscount,
        total: editTotal,
        note: editNote,
        payment_method: editPaymentMethod,
      })
      success('Đã cập nhật hóa đơn')
      setEditOrder(null)
      loadOrders()
    } catch {
      toastError('Lỗi khi cập nhật hóa đơn')
    }
  }

  const handlePrintOrder = (order: Order) => {
    const printable: PrintableOrder = {
      invoice_number: order.invoice_number,
      table_name: order.table?.name ?? 'Mang về',
      cashier_name: order.cashier?.name ?? 'Chủ quán',
      created_at: order.created_at,
      items: (order.items ?? []).map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
        note: i.note,
      })),
      subtotal: order.subtotal,
      discount: order.discount,
      total: order.total,
      payment_method: order.payment?.method ?? (order.status === 'PAID' ? 'CASH' : undefined),
    }
    printReceipt(printable, undefined, order.status !== 'PAID')
    success(`Đã gửi lệnh in hóa đơn ${order.invoice_number}`)
  }

  const statusLabel: Record<string, string> = {
    OPEN: 'Đang mở',
    PAID: 'Đã thanh toán',
    CANCELLED: 'Đã hủy',
  }

  const statusBadge: Record<string, string> = {
    OPEN: 'badge-warning',
    PAID: 'badge-success',
    CANCELLED: 'badge-danger',
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

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">Hóa đơn</h1>
          <p className="page-subtitle">
            {orders.length} hóa đơn {isEmployee ? 'trong ngày hôm nay' : ''}
          </p>
        </div>
        {!isEmployee && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowReportModal(true)}
            style={{ gap: '0.45rem', fontWeight: 600, border: '1px solid var(--color-coffee-400)', color: 'var(--color-coffee-800)' }}
          >
            <FileText size={16} color="var(--color-coffee-600)" />
            Báo cáo bán hàng (Khổ Dọc / Ngang)
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: '1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="input-label"><Search size={12} style={{ display: 'inline', marginRight: 4 }} />Tìm mã HĐ</label>
            <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="INV-..." />
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <label className="input-label"><Filter size={12} style={{ display: 'inline', marginRight: 4 }} />Trạng thái</label>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tất cả</option>
              <option value="PAID">Đã thanh toán</option>
              <option value="OPEN">Đang mở</option>
              <option value="CANCELLED">Đã hủy</option>
            </select>
          </div>
          {uniqueCashiers.length > 0 && (
            <div style={{ flex: '0 1 170px' }}>
              <label className="input-label"><User size={12} style={{ display: 'inline', marginRight: 4 }} />Người nhập</label>
              <select className="select" value={cashierFilter} onChange={(e) => setCashierFilter(e.target.value)}>
                <option value="ALL">Tất cả người nhập</option>
                {uniqueCashiers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}
          {isEmployee ? (
            <div style={{ flex: '0 1 240px' }}>
              <label className="input-label">
                <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                Thời gian (Thu ngân)
              </label>
              <div
                title="Quyền nhân viên: Chỉ xem hóa đơn trong ngày hôm nay"
                style={{
                  height: 38,
                  padding: '0 0.75rem',
                  background: 'rgba(139, 92, 246, 0.08)',
                  border: '1px solid rgba(139, 92, 246, 0.25)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  boxSizing: 'border-box',
                  cursor: 'default',
                }}
              >
                <Lock size={14} />
                <span>Hôm nay ({new Date().toLocaleDateString('vi-VN')})</span>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: '0 1 160px' }}>
                <label className="input-label"><Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />Từ ngày</label>
                <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div style={{ flex: '0 1 160px' }}>
                <label className="input-label">Đến ngày</label>
                <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {displayOrders.length === 0 ? (
        <EmptyState icon={<Receipt size={48} />} title="Không có hóa đơn" description="Thay đổi bộ lọc hoặc tạo order mới" />
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã hóa đơn</th>
                <th>Bàn</th>
                <th>Tổng tiền</th>
                <th>Trạng thái</th>
                <th>Thời gian</th>
                <th>Người nhập</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map((order) => (
                <tr key={order.id}>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{order.invoice_number}</td>
                  <td>{order.table?.name ?? '—'}</td>
                  <td style={{ color: 'var(--color-coffee-400)', fontWeight: 500 }}>{formatCurrency(order.total)}</td>
                  <td>
                    <span className={`badge ${statusBadge[order.status]}`}>{statusLabel[order.status]}</span>
                  </td>
                  <td style={{ fontSize: '0.8125rem' }}>{formatDateTime(order.created_at)}</td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'rgba(124, 58, 237, 0.08)',
                        color: '#7B3F00',
                        border: '1px solid rgba(124, 58, 237, 0.2)',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <User size={12} />
                      {order.cashier?.name || 'Chủ quán'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => handlePrintOrder(order)} title="In hóa đơn">
                        <Printer size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedOrder(order)} title="Xem chi tiết">
                        <Eye size={14} />
                      </button>
                      {order.status === 'PAID' && hasRole('OWNER', 'MANAGER') && (
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-warning)' }} onClick={() => setCancelOrder(order)} title="Hủy hóa đơn">
                          <XCircle size={14} />
                        </button>
                      )}
                      {hasRole('OWNER') && (
                        <>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-info)' }} onClick={() => openEdit(order)} title="Sửa thông tin">
                            <Edit2 size={14} />
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setDeleteOrder(order)} title="Xóa vĩnh viễn">
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={!!selectedOrder} onClose={() => setSelectedOrder(null)} title={`Hóa đơn ${selectedOrder?.invoice_number ?? ''}`} wide>
        {selectedOrder && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div>
                <div className="input-label">Bàn</div>
                <div style={{ fontSize: '0.875rem' }}>{selectedOrder.table?.name ?? '—'}</div>
              </div>
              <div>
                <div className="input-label">Người nhập đơn</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#7B3F00' }}>
                  <User size={14} />
                  {selectedOrder.cashier?.name || 'Chủ quán'}
                </div>
              </div>
              <div>
                <div className="input-label">Trạng thái</div>
                <span className={`badge ${statusBadge[selectedOrder.status]}`}>{statusLabel[selectedOrder.status]}</span>
              </div>
              <div>
                <div className="input-label">Thời gian</div>
                <div style={{ fontSize: '0.875rem' }}>{formatDateTime(selectedOrder.created_at)}</div>
              </div>
            </div>

            <hr className="divider" />

            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Chi tiết đơn</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Món</th>
                  <th style={{ textAlign: 'right' }}>Đơn giá</th>
                  <th style={{ textAlign: 'center' }}>SL</th>
                  <th style={{ textAlign: 'right' }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {(selectedOrder.items ?? []).map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 500 }}>
                      <div>{item.product_name}</div>
                      {item.note && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-coffee-300)', marginTop: '0.125rem' }}>
                          {item.note}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(item.unit_price)}</td>
                    <td style={{ textAlign: 'center' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <hr className="divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Tạm tính</span>
                <span>{formatCurrency(selectedOrder.subtotal)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div style={{ display: 'flex', gap: '2rem', fontSize: '0.875rem', color: 'var(--color-danger)' }}>
                  <span>Giảm giá</span>
                  <span>-{formatCurrency(selectedOrder.discount)}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: '2rem', fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-coffee-300)' }}>
                <span>Tổng cộng</span>
                <span>{formatCurrency(selectedOrder.total)}</span>
              </div>
            </div>

            {selectedOrder.cancel_reason && (
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(248, 113, 113, 0.1)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(248, 113, 113, 0.2)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-danger)', marginBottom: '0.25rem' }}>Lý do hủy</div>
                <div style={{ fontSize: '0.875rem' }}>{selectedOrder.cancel_reason}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedOrder(null)}>
                Đóng
              </button>
              <button className="btn btn-primary" onClick={() => handlePrintOrder(selectedOrder)}>
                <Printer size={16} />
                In hóa đơn
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel Confirm */}
      <ConfirmDialog
        open={!!cancelOrder}
        title="Hủy hóa đơn"
        message={`Bạn có chắc muốn hủy hóa đơn ${cancelOrder?.invoice_number ?? ''}? Hành động này không thể hoàn tác.`}
        confirmText="Hủy hóa đơn"
        danger
        onConfirm={handleCancel}
        onCancel={() => { setCancelOrder(null); setCancelReason('') }}
      >
        <div style={{ marginTop: '0.75rem' }}>
          <label className="input-label">Lý do hủy *</label>
          <input
            className="input"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Nhập lý do hủy hóa đơn..."
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteOrder}
        title="Xóa vĩnh viễn hóa đơn"
        message={`Cảnh báo: Hành động này sẽ xóa vĩnh viễn hóa đơn ${deleteOrder?.invoice_number} khỏi hệ thống và không thể phục hồi. Doanh thu cũng sẽ bị trừ đi. Có chắc chắn xóa?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOrder(null)}
      />

      <Modal open={!!editOrder} onClose={() => setEditOrder(null)} title="Sửa hóa đơn (Quyền Chủ quán)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="input-label">Giảm giá (VNĐ)</label>
            <input className="input" type="number" value={editDiscount} onChange={(e) => setEditDiscount(Number(e.target.value))} />
          </div>
          <div>
            <label className="input-label">Tổng tiền cuối (VNĐ)</label>
            <input className="input" type="number" value={editTotal} onChange={(e) => setEditTotal(Number(e.target.value))} />
          </div>
          <div>
            <label className="input-label">Hình thức thanh toán</label>
            <select className="select" value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)}>
              <option value="CASH">Tiền mặt</option>
              <option value="BANK_TRANSFER">Chuyển khoản</option>
            </select>
          </div>
          <div>
            <label className="input-label">Ghi chú / Lý do sửa</label>
            <input className="input" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Nhập ghi chú..." />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setEditOrder(null)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleEdit}>Lưu thay đổi</button>
          </div>
        </div>
      </Modal>

      {/* Modal Báo Cáo Bán Hàng Dọc / Ngang */}
      {showReportModal && !isEmployee && (
        <div
          className="daily-report-modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            overflowY: 'auto',
          }}
          onClick={() => setShowReportModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '1360px',
              maxHeight: '94vh',
              overflowY: 'auto',
              borderRadius: 'var(--radius-xl)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <SalesReportVerticalHorizontal
              isModal
              onClose={() => setShowReportModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
