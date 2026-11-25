import { useState, useEffect, useCallback } from 'react'
import { materialService } from '@/services/materialService'
import { Modal, ConfirmDialog, EmptyState, LoadingSpinner } from '@/components/ui'
import { formatCurrency, matchSearchWithAcronym, getAcronym } from '@/utils/helpers'
import { formatQty } from './materialFormatters'
import type { Material, MeasurementUnit, MaterialItemType, ProductRecipeSummary } from '@/types'
import type { RecipeTarget } from './RecipeEditorModal'
import {
  Plus,
  Search,
  X,
  Edit2,
  Trash2,
  Ruler,
  Layers,
  Sparkles,
  FlaskConical,
  CupSoda,
} from 'lucide-react'

interface Props {
  refreshTrigger: number
  onChanged: () => void
  onOpenRecipe: (target: RecipeTarget, allProductsSummary?: ProductRecipeSummary[]) => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export function MaterialsSetupTab({
  refreshTrigger,
  onChanged,
  onOpenRecipe,
  onSuccess,
  onError,
}: Props) {
  const [step, setStep] = useState<'MATERIALS' | 'PRODUCTS'>('MATERIALS')
  const [loading, setLoading] = useState(true)

  const [materials, setMaterials] = useState<Material[]>([])
  const [units, setUnits] = useState<MeasurementUnit[]>([])
  const [productsSummary, setProductsSummary] = useState<ProductRecipeSummary[]>([])

  // Filters
  const [matSearch, setMatSearch] = useState('')
  const [matTypeFilter, setMatTypeFilter] = useState<'ALL' | MaterialItemType>('ALL')
  const [prodSearch, setProdSearch] = useState('')
  const [prodCatFilter, setProdCatFilter] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)

  // Modal Thêm / Sửa Nguyên liệu (Siêu tối giản)
  const [showMatModal, setShowMatModal] = useState(false)
  const [editingMat, setEditingMat] = useState<Material | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState<MaterialItemType>('RAW')
  const [formUnit, setFormUnit] = useState('ml')
  const [formYieldQty, setFormYieldQty] = useState('800')
  const [formUnitCost, setFormUnitCost] = useState('0')
  const [formNote, setFormNote] = useState('')

  // Modal Đơn vị tính
  const [showUnitsModal, setShowUnitsModal] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')

  // Confirm delete
  const [confirmDeleteMat, setConfirmDeleteMat] = useState<Material | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [mats, uList, pSum] = await Promise.all([
        materialService.getAll(true),
        materialService.getUnits(),
        materialService.getAllProductRecipesSummary(),
      ])
      setMaterials(mats)
      setUnits(uList)
      setProductsSummary(pSum)
    } catch {
      onError('Không thể tải dữ liệu nguyên liệu & công thức')
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    loadData()
  }, [loadData, refreshTrigger])

  const openCreateMat = (defaultType: MaterialItemType = 'RAW') => {
    setEditingMat(null)
    setFormName('')
    setFormType(defaultType)
    setFormUnit(units[0]?.name || 'ml')
    setFormYieldQty(defaultType === 'SEMI_FINISHED' ? '800' : '1')
    setFormUnitCost('0')
    setFormNote('')
    setShowMatModal(true)
  }

  const openEditMat = (m: Material) => {
    setEditingMat(m)
    setFormName(m.name)
    setFormType(m.item_type)
    setFormUnit(m.unit)
    setFormYieldQty(String(m.yield_qty || 1))
    setFormUnitCost(String(m.unit_cost || 0))
    setFormNote(m.note || '')
    setShowMatModal(true)
  }

  const handleSaveMaterial = async () => {
    if (!formName.trim()) {
      onError('Vui lòng nhập tên nguyên liệu')
      return
    }
    if (!formUnit.trim()) {
      onError('Vui lòng nhập đơn vị tính')
      return
    }
    try {
      const payload = {
        name: formName.trim(),
        item_type: formType,
        unit: formUnit.trim(),
        purchase_unit: formUnit.trim(),
        conversion_factor: 1,
        yield_qty: formType === 'SEMI_FINISHED' && Number(formYieldQty) > 0 ? Number(formYieldQty) : 1,
        deduction_mode: 'EXPLODE_ON_SALE' as const,
        unit_cost: Number(formUnitCost) || 0,
        note: formNote.trim() || undefined,
      }
      if (editingMat) {
        await materialService.update(editingMat.id, payload)
        onSuccess('Đã cập nhật nguyên liệu')
      } else {
        const created = await materialService.create(payload)
        onSuccess('Đã thêm nguyên liệu mới')
        if (created.item_type === 'SEMI_FINISHED') {
          setShowMatModal(false)
          onChanged()
          loadData()
          onOpenRecipe({ kind: 'MATERIAL', id: created.id, name: created.name }, productsSummary)
          return
        }
      }
      setShowMatModal(false)
      onChanged()
      loadData()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi khi lưu nguyên liệu')
    }
  }

  const handleDeleteMat = async () => {
    if (!confirmDeleteMat) return
    try {
      await materialService.delete(confirmDeleteMat.id)
      onSuccess(`Đã xóa "${confirmDeleteMat.name}"`)
      setConfirmDeleteMat(null)
      onChanged()
      loadData()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể xóa nguyên liệu')
      setConfirmDeleteMat(null)
    }
  }

  const handleAddUnit = async () => {
    if (!newUnitName.trim()) return
    try {
      await materialService.saveUnit({ name: newUnitName.trim() })
      setNewUnitName('')
      onSuccess('Đã thêm đơn vị tính')
      loadData()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể thêm đơn vị')
    }
  }

  const handleDeleteUnit = async (u: MeasurementUnit) => {
    try {
      await materialService.deleteUnit(u.id)
      onSuccess(`Đã xóa đơn vị "${u.name}"`)
      loadData()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể xóa đơn vị')
    }
  }

  const handleSeedExample = async () => {
    try {
      const res = await materialService.seedExampleMaterials()
      onSuccess(
        res.matchedProductId
          ? 'Đã tạo ví dụ mẫu (Cà phê nâu → Cà phê chung → Robusta & Arabica)'
          : 'Đã tạo nguyên liệu mẫu. Sang Bước 2 để gắn vào món!'
      )
      onChanged()
      loadData()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể nạp ví dụ mẫu')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <LoadingSpinner size={30} />
      </div>
    )
  }

  const configuredProductsCount = productsSummary.filter((p) => p.ingredients_count > 0).length
  const filteredMaterials = materials.filter((m) => {
    const matchQ = matchSearchWithAcronym(m.name, matSearch)
    const matchType = matTypeFilter === 'ALL' || m.item_type === matTypeFilter
    return matchQ && matchType
  })
  const categories = Array.from(new Set(productsSummary.map((p) => p.category_name))).sort()
  const filteredProducts = productsSummary.filter((p) => {
    const matchQ = matchSearchWithAcronym(p.product_name, prodSearch)
    const matchCat = !prodCatFilter || p.category_name === prodCatFilter
    const matchMissing = !onlyMissing || p.ingredients_count === 0
    return matchQ && matchCat && matchMissing
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Thanh chuyển 2 bước rõ ràng */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={() => setStep('MATERIALS')}
          className="glass-card"
          style={{
            padding: '0.875rem 1.125rem',
            textAlign: 'left',
            cursor: 'pointer',
            borderWidth: 2,
            borderColor: step === 'MATERIALS' ? 'var(--color-coffee-600)' : 'var(--color-border)',
            background: step === 'MATERIALS' ? '#fdf8f0' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: '999px', background: step === 'MATERIALS' ? 'var(--color-coffee-600)' : '#e2e8f0', color: step === 'MATERIALS' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
            1
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
              Nguyên liệu gốc & Pha sẵn ({materials.length})
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Khai báo sữa đặc, hạt cafe... và các bước trung gian như Cà phê chung
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setStep('PRODUCTS')}
          className="glass-card"
          style={{
            padding: '0.875rem 1.125rem',
            textAlign: 'left',
            cursor: 'pointer',
            borderWidth: 2,
            borderColor: step === 'PRODUCTS' ? 'var(--color-coffee-600)' : 'var(--color-border)',
            background: step === 'PRODUCTS' ? '#fdf8f0' : '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ width: 32, height: 32, borderRadius: '999px', background: step === 'PRODUCTS' ? 'var(--color-coffee-600)' : '#e2e8f0', color: step === 'PRODUCTS' ? '#fff' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
            2
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
              Gắn công thức cho Món bán ({configuredProductsCount}/{productsSummary.length} món)
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Chọn từng món trên menu (Cà phê nâu = 20ml sữa đặc + 50ml cà phê chung...)
            </div>
          </div>
        </button>
      </div>

      {/* BƯỚC 1: NGUYÊN LIỆU & PHA SẴN */}
      {step === 'MATERIALS' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  className="input"
                  placeholder="Tìm nguyên liệu (gõ sd, st, cpg)..."
                  value={matSearch}
                  onChange={(e) => setMatSearch(e.target.value)}
                  style={{ paddingLeft: '2.25rem', paddingRight: matSearch ? '2rem' : '0.75rem' }}
                />
                {matSearch && (
                  <button
                    type="button"
                    onClick={() => setMatSearch('')}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                    }}
                    title="Xóa tìm kiếm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <select className="select" value={matTypeFilter} onChange={(e) => setMatTypeFilter(e.target.value as 'ALL' | MaterialItemType)} style={{ width: 210 }}>
                <option value="ALL">Tất cả ({materials.length})</option>
                <option value="RAW">Nguyên liệu gốc</option>
                <option value="SEMI_FINISHED">Pha sẵn / Trung gian</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowUnitsModal(true)}>
                <Ruler size={14} /> Đơn vị ({units.length})
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openCreateMat('SEMI_FINISHED')}>
                <FlaskConical size={14} /> + Nguyên liệu trung gian
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => openCreateMat('RAW')}>
                <Plus size={14} /> + Nguyên liệu gốc
              </button>
            </div>
          </div>

          {materials.length === 0 ? (
            <div className="glass-card" style={{ padding: '2rem' }}>
              <EmptyState
                icon={<Layers size={48} />}
                title="Chưa có nguyên liệu nào"
                description="Bạn có thể tự thêm nguyên liệu gốc (Sữa đặc, Cà phê...) và nguyên liệu trung gian (Cà phê chung), hoặc bấm nạp ví dụ mẫu để xem thử ngay."
                action={
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary" onClick={() => openCreateMat('RAW')}>
                      <Plus size={16} /> Tự thêm nguyên liệu
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleSeedExample}>
                      <Sparkles size={16} /> Nạp ví dụ mẫu (Cà phê nâu & Cà phê chung)
                    </button>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tên nguyên liệu</th>
                    <th>Phân loại</th>
                    <th>Đơn vị</th>
                    <th>Công thức pha sẵn (nếu là trung gian)</th>
                    <th style={{ textAlign: 'right' }}>Đơn giá tham khảo</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMaterials.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600 }}>{m.name}</span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '0.05rem 0.35rem', borderRadius: '4px' }} title="Từ viết tắt">
                            {getAcronym(m.name)}
                          </span>
                        </div>
                        {m.note && <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{m.note}</div>}
                      </td>
                      <td>
                        <span className={`badge ${m.item_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`}>
                          {m.item_type === 'SEMI_FINISHED' ? 'Trung gian / Pha sẵn' : 'Nguyên liệu gốc'}
                        </span>
                      </td>
                      <td><strong>{m.unit}</strong></td>
                      <td>
                        {m.item_type === 'SEMI_FINISHED' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.84rem' }}>
                              1 mẻ thu <strong>{formatQty(m.yield_qty)} {m.unit}</strong> ({m.recipe_ingredients_count} thành phần)
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                              onClick={() => onOpenRecipe({ kind: 'MATERIAL', id: m.id, name: m.name }, productsSummary)}
                            >
                              <FlaskConical size={12} /> {m.recipe_ingredients_count > 0 ? 'Sửa mẻ' : 'Nhập công thức mẻ'}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {m.effective_unit_cost > 0 || m.unit_cost > 0
                          ? `${formatCurrency(Math.round(m.effective_unit_cost || m.unit_cost))} / ${m.unit}`
                          : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEditMat(m)} title="Sửa">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setConfirmDeleteMat(m)} title="Xóa">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* BƯỚC 2: GẮN CÔNG THỨC CHO TỪNG MÓN BÁN */}
      {step === 'PRODUCTS' && (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
              <CupSoda size={17} color="var(--color-coffee-600)" />
              Danh sách món trên menu ({filteredProducts.length})
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: 280 }}>
                <Search size={14} style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  className="input"
                  placeholder="Tìm món (gõ cfn, cf, st, tc)..."
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  style={{ paddingLeft: '2rem', paddingRight: prodSearch ? '2rem' : '0.75rem' }}
                />
                {prodSearch && (
                  <button
                    type="button"
                    onClick={() => setProdSearch('')}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                    }}
                    title="Xóa tìm kiếm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <select className="select" value={prodCatFilter} onChange={(e) => setProdCatFilter(e.target.value)} style={{ width: 180 }}>
                <option value="">Tất cả danh mục</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
                Chưa có công thức
              </label>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tên món / Topping</th>
                  <th>Danh mục</th>
                  <th>Định mức nguyên liệu cho 1 cốc</th>
                  <th style={{ textAlign: 'right' }}>Giá vốn ước tính</th>
                  <th style={{ textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.product_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600 }}>{p.product_name}</span>
                        <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '0.05rem 0.35rem', borderRadius: '4px' }} title="Viết tắt">
                          {getAcronym(p.product_name)}
                        </span>
                      </div>
                    </td>
                    <td>{p.category_name}</td>
                    <td>
                      {p.ingredients_count === 0 && p.variants_count === 0 ? (
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>Chưa cài công thức</span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {p.ingredients.map((ing) => (
                              <span key={ing.material_id} className={`badge ${ing.material_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`}>
                                {ing.material_name}: {formatQty(ing.quantity)} {ing.unit}
                              </span>
                            ))}
                          </div>
                          {p.variants.map((v) => (
                            <div key={v.variant_keyword} style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <span className="badge badge-info">{v.variant_keyword}</span>
                              {v.ingredients.map((ing) => (
                                <span key={`${v.variant_keyword}-${ing.material_id}`} className="badge" style={{ background: '#f1f5f9', color: '#334155' }}>
                                  {ing.material_name}: {formatQty(ing.quantity)} {ing.unit}
                                </span>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {p.estimated_cost > 0 ? formatCurrency(p.estimated_cost) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${p.ingredients_count > 0 ? 'btn-secondary' : 'btn-primary'}`}
                        onClick={() => onOpenRecipe({ kind: 'PRODUCT', id: p.product_id, name: p.product_name, price: p.price }, productsSummary)}
                      >
                        <Edit2 size={13} /> {p.ingredients_count > 0 ? 'Sửa công thức' : 'Gắn công thức'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Thêm / Sửa Nguyên liệu (Gọn nhẹ) */}
      <Modal
        open={showMatModal}
        onClose={() => setShowMatModal(false)}
        title={editingMat ? `Sửa: ${editingMat.name}` : 'Thêm nguyên liệu'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label className="input-label">Loại nguyên liệu</label>
            <select className="select" value={formType} onChange={(e) => setFormType(e.target.value as MaterialItemType)}>
              <option value="RAW">Nguyên liệu gốc (Sữa đặc, Cà phê hạt, Đường...)</option>
              <option value="SEMI_FINISHED">Trung gian / Pha sẵn (Cà phê chung sau ủ phin, Cốt trà...)</option>
            </select>
          </div>

          <div>
            <label className="input-label">Tên nguyên liệu *</label>
            <input
              className="input"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={formType === 'SEMI_FINISHED' ? 'VD: Cà phê chung (sau ủ phin)' : 'VD: Sữa đặc, Cà phê Robusta...'}
              autoFocus
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label className="input-label">Đơn vị tính *</label>
              <input
                list="fuha-simple-units"
                className="input"
                value={formUnit}
                onChange={(e) => setFormUnit(e.target.value)}
                placeholder="ml, g, cái..."
              />
              <datalist id="fuha-simple-units">
                {units.map((u) => <option key={u.id} value={u.name} />)}
              </datalist>
            </div>

            {formType === 'SEMI_FINISHED' ? (
              <div>
                <label className="input-label">1 mẻ pha/ủ thu được ({formUnit})</label>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  className="input"
                  value={formYieldQty}
                  onChange={(e) => setFormYieldQty(e.target.value)}
                  placeholder="VD: 800"
                />
              </div>
            ) : (
              <div>
                <label className="input-label">Đơn giá / 1 {formUnit} (tùy chọn)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  className="input"
                  value={formUnitCost}
                  onChange={(e) => setFormUnitCost(e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div>
            <label className="input-label">Ghi chú (tùy chọn)</label>
            <input className="input" value={formNote} onChange={(e) => setFormNote(e.target.value)} placeholder="VD: Ủ 300g loại 1 + 200g loại 2..." />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowMatModal(false)}>Hủy</button>
            <button type="button" className="btn btn-primary" onClick={handleSaveMaterial}>
              {editingMat ? 'Lưu thay đổi' : formType === 'SEMI_FINISHED' ? 'Lưu & Nhập công thức mẻ' : 'Thêm mới'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Đơn vị tính */}
      <Modal open={showUnitsModal} onClose={() => setShowUnitsModal(false)} title="Đơn vị tính">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" value={newUnitName} onChange={(e) => setNewUnitName(e.target.value)} placeholder="Thêm đơn vị (VD: chai, gói...)" />
            <button type="button" className="btn btn-primary" onClick={handleAddUnit}>Thêm</button>
          </div>
          <div style={{ maxHeight: '45vh', overflowY: 'auto' }}>
            <table className="data-table">
              <tbody>
                {units.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleDeleteUnit(u)}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteMat}
        danger
        title="Xóa nguyên liệu"
        message={`Bạn có chắc muốn xóa "${confirmDeleteMat?.name}"?`}
        onConfirm={handleDeleteMat}
        onCancel={() => setConfirmDeleteMat(null)}
      />
    </div>
  )
}
