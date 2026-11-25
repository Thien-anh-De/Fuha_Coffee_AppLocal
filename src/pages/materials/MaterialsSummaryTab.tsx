import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { materialService } from '@/services/materialService'
import { LoadingSpinner, Modal } from '@/components/ui'
import { computeDatePreset, formatCurrency, formatDateTime, type ReportTimePreset } from '@/utils/helpers'
import { exportReportToCsv, exportToPdf } from '@/utils/exportReport'
import { formatQty } from './materialFormatters'
import type { Material, MaterialConsumptionSummary, WastageReason } from '@/types'
import {
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  GitBranch,
  AlertCircle,
  CupSoda,
  Layers,
  FlaskConical,
} from 'lucide-react'

interface Props {
  refreshTrigger: number
  onGoToRecipes: () => void
  onOpenProductRecipe: (productId: string, productName: string) => void
  onChanged: () => void
  onError: (msg: string) => void
  onSuccess: (msg: string) => void
}

export function MaterialsSummaryTab({
  refreshTrigger,
  onGoToRecipes,
  onOpenProductRecipe,
  onChanged,
  onError,
  onSuccess,
}: Props) {
  const { user } = useAuth()
  const [preset, setPreset] = useState<ReportTimePreset>('today')
  const [dateFrom, setDateFrom] = useState(() => computeDatePreset('today').from)
  const [dateTo, setDateTo] = useState(() => computeDatePreset('today').to)
  const [useCurrentRecipes, setUseCurrentRecipes] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<MaterialConsumptionSummary | null>(null)

  // Modal ghi nhận hao hụt thêm (pha hỏng, đổ bỏ...)
  const [showWasteModal, setShowWasteModal] = useState(false)
  const [materials, setMaterials] = useState<Material[]>([])
  const [reasons, setReasons] = useState<WastageReason[]>([])
  const [wasteMatId, setWasteMatId] = useState('')
  const [wasteQty, setWasteQty] = useState('')
  const [wasteReasonId, setWasteReasonId] = useState('')
  const [wasteNote, setWasteNote] = useState('')

  const loadSummary = useCallback(async () => {
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const res = await materialService.getConsumptionSummary({
        from: dateFrom,
        to: dateTo,
        use_current_recipes: useCurrentRecipes,
      })
      setData(res)
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể tải tổng kết nguyên liệu')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, useCurrentRecipes, onError])

  useEffect(() => {
    loadSummary()
  }, [loadSummary, refreshTrigger])

  const applyPreset = (p: ReportTimePreset) => {
    setPreset(p)
    if (p !== 'custom') {
      const r = computeDatePreset(p)
      setDateFrom(r.from)
      setDateTo(r.to)
    }
  }

  const openWasteModal = async () => {
    try {
      const [mats, rList] = await Promise.all([
        materialService.getAll(false),
        materialService.getWastageReasons(),
      ])
      if (mats.length === 0) {
        onError('Chưa có nguyên liệu nào. Hãy thêm nguyên liệu ở tab "Nguyên liệu & Công thức" trước.')
        return
      }
      setMaterials(mats)
      setReasons(rList)
      setWasteMatId(mats[0].id)
      setWasteQty('')
      setWasteReasonId(rList[0]?.id || '')
      setWasteNote('')
      setShowWasteModal(true)
    } catch {
      onError('Không thể tải danh sách nguyên liệu')
    }
  }

  const handleSaveWaste = async () => {
    const qty = Number(wasteQty)
    if (!wasteMatId || !Number.isFinite(qty) || qty <= 0) {
      onError('Vui lòng nhập số lượng hao hụt lớn hơn 0')
      return
    }
    try {
      await materialService.createWastageLog({
        material_id: wasteMatId,
        quantity: qty,
        reason_id: wasteReasonId || undefined,
        note: wasteNote.trim() || undefined,
        user_id: user?.id,
      })
      onSuccess('Đã ghi nhận hao hụt thêm')
      setShowWasteModal(false)
      onChanged()
      loadSummary()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể lưu hao hụt')
    }
  }

  const handleDeleteWaste = async (id: string) => {
    try {
      await materialService.deleteWastageLog(id)
      onSuccess('Đã xóa dòng hao hụt')
      onChanged()
      loadSummary()
    } catch {
      onError('Không thể xóa dòng hao hụt')
    }
  }

  const handleExportCsv = () => {
    if (!data) return
    const headers = ['Nguyên liệu gốc', 'Đơn vị', 'Theo đơn bán', 'Hao hụt thêm', 'Tổng đã dùng', 'Chi phí ước tính (VNĐ)']
    const rows = data.raw_consumption.map((r) => [
      r.material_name,
      r.unit,
      r.sale_qty,
      r.extra_wastage_qty,
      r.total_qty,
      r.total_cost,
    ])
    exportReportToCsv(
      `Tong-ket-nguyen-lieu-${dateFrom}-den-${dateTo}`,
      'TỔNG KẾT NGUYÊN LIỆU ĐÃ SỬ DỤNG',
      `Từ ngày ${dateFrom} đến ngày ${dateTo} (${data.summary.paid_orders} đơn / ${data.summary.total_cups_sold} món)`,
      headers,
      rows,
      ['TỔNG CHI PHÍ ƯỚC TÍNH', '-', '-', '-', '-', data.summary.total_cost]
    )
    onSuccess('Đã xuất file CSV')
  }

  const handleExportPdf = async () => {
    if (!data) return
    const headers = ['Nguyên liệu gốc', 'ĐVT', 'Theo đơn bán', 'Hao hụt thêm', 'Tổng đã dùng', 'Chi phí ước tính']
    const rows = data.raw_consumption.map((r) => [
      r.material_name,
      r.unit,
      formatQty(r.sale_qty),
      formatQty(r.extra_wastage_qty),
      formatQty(r.total_qty),
      r.total_cost > 0 ? formatCurrency(r.total_cost) : '—',
    ])
    const res = await exportToPdf(
      `Tong-ket-nguyen-lieu-${dateFrom}-${dateTo}`,
      'TỔNG KẾT NGUYÊN LIỆU ĐÃ SỬ DỤNG',
      `Từ ngày ${dateFrom} đến ngày ${dateTo} (${data.summary.paid_orders} đơn / ${data.summary.total_cups_sold} món)`,
      headers,
      rows,
      ['TỔNG CỘNG', '-', '-', '-', '-', data.summary.total_cost > 0 ? formatCurrency(data.summary.total_cost) : '—']
    )
    if (res.success) onSuccess('Đã xuất báo cáo PDF')
  }

  const selectedWasteMat = materials.find((m) => m.id === wasteMatId)
  const s = data?.summary

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
      {/* Bộ lọc ngày & thao tác nhanh */}
      <div className="glass-card" style={{ padding: '0.875rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { key: 'today', label: 'Hôm nay' },
            { key: 'yesterday', label: 'Hôm qua' },
            { key: 'last7days', label: '7 ngày' },
            { key: 'thismonth', label: 'Tháng này' },
            { key: 'lastmonth', label: 'Tháng trước' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={`btn btn-sm ${preset === item.key ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => applyPreset(item.key as ReportTimePreset)}
            >
              {item.label}
            </button>
          ))}
          <input
            type="date"
            className="input"
            value={dateFrom}
            onChange={(e) => { setPreset('custom'); setDateFrom(e.target.value) }}
            style={{ width: 140, padding: '0.35rem 0.5rem' }}
          />
          <span style={{ color: 'var(--color-text-muted)' }}>→</span>
          <input
            type="date"
            className="input"
            value={dateTo}
            onChange={(e) => { setPreset('custom'); setDateTo(e.target.value) }}
            style={{ width: 140, padding: '0.35rem 0.5rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={openWasteModal}>
            <Plus size={14} /> Ghi nhận hao hụt thêm
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCsv} disabled={!data || data.raw_consumption.length === 0}>
            <FileSpreadsheet size={14} /> CSV
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportPdf} disabled={!data || data.raw_consumption.length === 0}>
            <FileText size={14} /> PDF
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadSummary} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Tùy chọn tính theo công thức hiện tại */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0 0.25rem' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={useCurrentRecipes}
            onChange={(e) => setUseCurrentRecipes(e.target.checked)}
          />
          Tính lại toàn bộ đơn trong kỳ theo công thức mới nhất hiện tại (bỏ qua công thức cũ lúc bán)
        </label>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <LoadingSpinner size={30} />
        </div>
      ) : data && s ? (
        <>
          {/* 3 Thẻ tóm tắt */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label" style={{ marginTop: 0 }}>Lượng bán trong kỳ</span>
                <CupSoda size={18} color="var(--color-coffee-600)" />
              </div>
              <div className="stat-value" style={{ fontSize: '1.45rem', marginTop: '0.4rem' }}>
                {s.total_cups_sold} cốc / món
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                Từ {s.paid_orders} hóa đơn đã thanh toán
              </div>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label" style={{ marginTop: 0 }}>Nguyên liệu gốc đã dùng</span>
                <Layers size={18} color="#16a34a" />
              </div>
              <div className="stat-value" style={{ fontSize: '1.45rem', color: '#15803d', marginTop: '0.4rem' }}>
                {s.raw_materials_count} loại
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                {s.total_cost > 0 ? `Ước tính chi phí: ${formatCurrency(s.total_cost)}` : 'Chưa nhập đơn giá tham khảo'}
              </div>
            </div>

            <div className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="stat-label" style={{ marginTop: 0 }}>Hao hụt thêm ngoài đơn</span>
                <FlaskConical size={18} color="var(--color-danger)" />
              </div>
              <div className="stat-value" style={{ fontSize: '1.45rem', color: data.extra_wastage_logs.length > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
                {data.extra_wastage_logs.length} lần ghi nhận
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                {s.total_extra_wastage_cost > 0 ? `Ước tính: ${formatCurrency(s.total_extra_wastage_cost)}` : 'Pha hỏng, đổ bỏ, thử vị...'}
              </div>
            </div>
          </div>

          {/* Nhắc nếu có món đã bán nhưng chưa gắn công thức */}
          {data.unconfigured_products.length > 0 && (
            <div
              className="glass-card"
              style={{
                padding: '0.875rem 1.25rem',
                background: '#fffbeb',
                borderColor: '#fde68a',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.84rem', color: '#92400e' }}>
                <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0 }} />
                <span>
                  Có <strong>{data.unconfigured_products.length} món đã bán</strong> trong kỳ chưa gắn công thức nên chưa được cộng vào bảng dưới (VD:{' '}
                  {data.unconfigured_products.slice(0, 3).map((p) => `${p.product_name} ×${p.quantity}`).join(', ')}
                  {data.unconfigured_products.length > 3 ? '...' : ''}).
                </span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onGoToRecipes}>
                Đi gắn công thức ngay
              </button>
            </div>
          )}

          {/* Bảng chính: Tổng kết nguyên liệu gốc đã dùng hết */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <GitBranch size={18} color="#16a34a" />
                  Tổng kết Nguyên liệu gốc đã dùng hết
                </h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  Tự động quy đổi qua các bước pha sẵn / ủ phin trung gian để ra tổng lượng nguyên liệu gốc thực tế đã dùng.
                </p>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nguyên liệu gốc</th>
                    <th>Đơn vị</th>
                    <th style={{ textAlign: 'right' }}>Dùng theo đơn bán</th>
                    <th style={{ textAlign: 'right' }}>Hao hụt thêm</th>
                    <th style={{ textAlign: 'right' }}>Tổng đã dùng</th>
                    <th style={{ textAlign: 'right' }}>Chi phí ước tính</th>
                  </tr>
                </thead>
                <tbody>
                  {data.raw_consumption.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '2rem' }}>
                        Chưa có số liệu tiêu hao nguyên liệu trong khoảng thời gian này. Hãy kiểm tra món đã bán đã được gắn công thức ở tab "Nguyên liệu & Công thức" chưa.
                      </td>
                    </tr>
                  ) : (
                    data.raw_consumption.map((r) => (
                      <tr key={r.material_id}>
                        <td style={{ fontWeight: 600 }}>{r.material_name}</td>
                        <td>{r.unit}</td>
                        <td style={{ textAlign: 'right' }}>{formatQty(r.sale_qty)} {r.unit}</td>
                        <td style={{ textAlign: 'right', color: r.extra_wastage_qty > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                          {r.extra_wastage_qty > 0 ? `+${formatQty(r.extra_wastage_qty)} ${r.unit}` : '0'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: '#15803d' }}>
                          {formatQty(r.total_qty)} {r.unit}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                          {r.total_cost > 0 ? formatCurrency(r.total_cost) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bảng 2: Chi tiết thành phần trung gian trực tiếp */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--color-border)', background: '#fdf8f0' }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-coffee-800)' }}>
                Chi tiết theo thành phần pha trực tiếp (gồm bước trung gian)
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                VD: Tổng lượng "Cà phê chung" đã rót ra để pha các cốc trong kỳ
              </div>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Thành phần</th>
                  <th>Loại</th>
                  <th style={{ textAlign: 'right' }}>Tổng lượng</th>
                </tr>
              </thead>
              <tbody>
                {data.direct_consumption.length === 0 ? (
                  <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Chưa có dữ liệu</td></tr>
                ) : (
                  data.direct_consumption.map((d) => (
                    <tr key={d.material_id}>
                      <td style={{ fontWeight: 600 }}>{d.material_name}</td>
                      <td>
                        <span className={`badge ${d.material_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`}>
                          {d.material_type === 'SEMI_FINISHED' ? 'Trung gian' : 'Gốc'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatQty(d.total_qty)} {d.unit}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Bảng 3: Tổng kết nguyên liệu riêng cho TỪNG MÓN đã bán */}
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CupSoda size={17} color="var(--color-coffee-600)" />
                Tổng kết nguyên liệu riêng theo từng món đã bán ({data.sold_products.length})
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                Xem riêng từng món đã bán bao nhiêu cốc và tốn hết bao nhiêu nguyên liệu (gồm cả Size L nếu có)
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên món</th>
                    <th style={{ textAlign: 'right' }}>Đã bán</th>
                    <th>Thành phần pha trực tiếp</th>
                    <th>Quy đổi nguyên liệu gốc</th>
                    <th style={{ textAlign: 'right' }}>Chi phí ước tính</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sold_products.length === 0 ? (
                    <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem' }}>Chưa bán món nào trong kỳ</td></tr>
                  ) : (
                    data.sold_products.map((sp, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600, verticalAlign: 'top' }}>{sp.product_name}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, verticalAlign: 'top' }}>{sp.quantity}</td>
                        <td style={{ verticalAlign: 'top' }}>
                          {!sp.has_recipe ? (
                            sp.product_id ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: '#d97706', padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                                onClick={() => onOpenProductRecipe(sp.product_id!, sp.product_name)}
                              >
                                + Gắn công thức
                              </button>
                            ) : (
                              <span className="badge badge-danger">Chưa cài</span>
                            )
                          ) : (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {(sp.direct_materials || []).map((dm) => (
                                <span key={dm.material_id} className={`badge ${dm.material_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`}>
                                  {dm.material_name}: {formatQty(dm.quantity)} {dm.unit}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                          {sp.has_recipe ? (
                            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                              {(sp.raw_materials || []).map((rm) => (
                                <span key={rm.material_id} className="badge badge-success">
                                  {rm.material_name}: {formatQty(rm.quantity)} {rm.unit}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'top', fontWeight: 600 }}>
                          {sp.cost_amount > 0 ? formatCurrency(sp.cost_amount) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Nếu có hao hụt thêm ngoài đơn thì mới hiện bảng lịch sử này */}
          {data.extra_wastage_logs.length > 0 && (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--color-border)', fontWeight: 700 }}>
                Chi tiết hao hụt thêm ngoài đơn bán ({data.extra_wastage_logs.length})
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Nguyên liệu</th>
                    <th>Lý do / Ghi chú</th>
                    <th style={{ textAlign: 'right' }}>Số lượng</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {data.extra_wastage_logs.map((w) => (
                    <tr key={w.id}>
                      <td style={{ fontSize: '0.8rem' }}>{formatDateTime(w.created_at)}</td>
                      <td style={{ fontWeight: 600 }}>{w.material_name}</td>
                      <td style={{ fontSize: '0.82rem' }}>
                        <span>{w.reason_name}</span>
                        {w.note && <span style={{ color: 'var(--color-text-muted)' }}> — {w.note}</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)' }}>
                        {formatQty(w.quantity)} {w.unit}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleDeleteWaste(w.id)} title="Xóa">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {/* Modal ghi nhận hao hụt thêm (gọn nhẹ 3 ô) */}
      <Modal open={showWasteModal} onClose={() => setShowWasteModal(false)} title="Ghi nhận hao hụt thêm ngoài đơn">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label className="input-label">Nguyên liệu hoặc Thành phẩm trung gian bị hao hụt</label>
            <select className="select" value={wasteMatId} onChange={(e) => setWasteMatId(e.target.value)}>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.unit})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="input-label">Số lượng ({selectedWasteMat?.unit || ''})</label>
              <input
                type="number"
                step="any"
                min="0"
                className="input"
                value={wasteQty}
                onChange={(e) => setWasteQty(e.target.value)}
                placeholder="VD: 50"
                autoFocus
              />
            </div>
            <div>
              <label className="input-label">Lý do</label>
              <select className="select" value={wasteReasonId} onChange={(e) => setWasteReasonId(e.target.value)}>
                {reasons.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="input-label">Ghi chú (tùy chọn)</label>
            <input className="input" value={wasteNote} onChange={(e) => setWasteNote(e.target.value)} placeholder="VD: Đổ bỏ cốt cafe dư cuối ngày..." />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowWasteModal(false)}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveWaste}>Lưu ghi nhận</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
