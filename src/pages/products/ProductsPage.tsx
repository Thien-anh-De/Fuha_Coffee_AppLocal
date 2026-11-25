import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/useToast'
import { productService } from '@/services/productService'
import { categoryService } from '@/services/categoryService'
import { materialService } from '@/services/materialService'
import { ToastContainer, Modal, EmptyState, LoadingSpinner, ConfirmDialog } from '@/components/ui'
import { RecipeEditorModal, type RecipeTarget } from '@/pages/materials/RecipeEditorModal'
import { formatCurrency, matchSearchWithAcronym } from '@/utils/helpers'
import type { Product, Category, ProductRecipeSummary } from '@/types'
import { Package, Plus, Edit2, Eye, EyeOff, FolderPlus, Search, X, Trash2, FlaskConical } from 'lucide-react'

export default function ProductsPage() {
  const { toasts, success, error: toastError, removeToast } = useToast()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recipesSummary, setRecipesSummary] = useState<ProductRecipeSummary[]>([])
  const [recipeTarget, setRecipeTarget] = useState<RecipeTarget | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('')

  // Modals
  const [showProductModal, setShowProductModal] = useState(false)
  const [showCatModal, setShowCatModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [confirmToggle, setConfirmToggle] = useState<Product | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Product | null>(null)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPrice, setFormPrice] = useState(0)
  const [formCatId, setFormCatId] = useState('')
  const [catName, setCatName] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [p, c, rSum] = await Promise.all([
        productService.getAll(),
        categoryService.getAll(),
        materialService.getAllProductRecipesSummary().catch(() => []),
      ])
      setProducts(p)
      setCategories(c)
      setRecipesSummary(rSum)
    } catch {
      toastError('Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [toastError])

  useEffect(() => { loadData() }, [loadData])

  const openAddProduct = () => {
    if (categories.length === 0) {
      toastError('Chưa có danh mục nào! Vui lòng bấm "Thêm danh mục" trước hoặc chạy seed.sql.')
      return
    }
    setEditingProduct(null)
    setFormName('')
    setFormPrice(0)
    setFormCatId(categories[0]?.id ?? '')
    setShowProductModal(true)
  }

  const openEditProduct = (p: Product) => {
    setEditingProduct(p)
    setFormName(p.name)
    setFormPrice(p.price)
    setFormCatId(p.category_id)
    setShowProductModal(true)
  }

  const handleSaveProduct = async () => {
    if (!formName.trim()) {
      toastError('Vui lòng nhập tên món')
      return
    }
    if (formPrice < 0) {
      toastError('Giá món không được âm')
      return
    }
    if (!formCatId) {
      toastError('Vui lòng chọn danh mục cho món')
      return
    }
    try {
      if (editingProduct) {
        await productService.update(editingProduct.id, {
          name: formName.trim(),
          price: formPrice,
          category_id: formCatId,
        })
        success('Đã cập nhật món')
      } else {
        await productService.create({ name: formName.trim(), price: formPrice, category_id: formCatId })
        success('Đã thêm món mới')
      }
      setShowProductModal(false)
      loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi lưu món'
      toastError(msg)
    }
  }

  const handleToggleProduct = async () => {
    if (!confirmToggle) return
    try {
      await productService.update(confirmToggle.id, { active: !confirmToggle.active })
      success(confirmToggle.active ? 'Đã ẩn món' : 'Đã hiện món')
      setConfirmToggle(null)
      loadData()
    } catch {
      toastError('Lỗi')
    }
  }

  const handleDeleteProduct = async () => {
    if (!confirmDelete) return
    try {
      await productService.delete(confirmDelete.id)
      success('Đã xóa món vĩnh viễn')
      setConfirmDelete(null)
      loadData()
    } catch {
      toastError('Lỗi khi xóa món')
    }
  }

  const handleAddCategory = async () => {
    if (!catName.trim()) return
    try {
      await categoryService.create(catName.trim(), categories.length + 1)
      success('Đã thêm danh mục')
      setCatName('')
      loadData()
    } catch {
      toastError('Lỗi khi thêm danh mục')
    }
  }

  const handleUpdateCategory = async () => {
    if (!editCatName.trim() || !editingCatId) return
    try {
      await categoryService.update(editingCatId, { name: editCatName.trim() })
      success('Đã cập nhật danh mục')
      setEditingCatId(null)
      loadData()
    } catch {
      toastError('Lỗi cập nhật danh mục')
    }
  }

  const handleDeleteCategory = async () => {
    if (!confirmDeleteCat) return
    try {
      await categoryService.delete(confirmDeleteCat.id)
      success('Đã xóa danh mục')
      setConfirmDeleteCat(null)
      loadData()
    } catch {
      toastError('Lỗi xóa danh mục')
    }
  }

  const filtered = products.filter((p) => {
    const matchSearch = matchSearchWithAcronym(p.name, search)
    const matchCat = !filterCat || p.category_id === filterCat
    return matchSearch && matchCat
  })

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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Quản lý món</h1>
          <p className="page-subtitle">{products.length} món · {categories.length} danh mục</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => setShowCatModal(true)}>
            <FolderPlus size={16} />
            Quản lý danh mục
          </button>
          <button className="btn btn-primary" onClick={openAddProduct}>
            <Plus size={16} />
            Thêm món
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            className="input"
            placeholder="Tìm món (gõ cfn, cf, st, trà me)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.25rem', paddingRight: search ? '2rem' : '0.75rem' }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
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
              <X size={15} />
            </button>
          )}
        </div>
        <select className="select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} style={{ width: 200 }}>
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Products Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="Không có món nào" description="Thêm món mới để bắt đầu" />
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Tên món</th>
                <th>Danh mục</th>
                <th>Giá</th>
                <th>Công thức nguyên liệu</th>
                <th>Trạng thái</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const rec = recipesSummary.find((r) => r.product_id === p.id)
                return (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.name}</td>
                  <td>{p.category?.name ?? '—'}</td>
                  <td style={{ color: 'var(--color-coffee-400)', fontWeight: 500 }}>{formatCurrency(p.price)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                      onClick={() => setRecipeTarget({ kind: 'PRODUCT', id: p.id, name: p.name, price: p.price })}
                      title="Thiết lập công thức nguyên vật liệu cho món này"
                    >
                      <FlaskConical size={13} />
                      {rec && rec.ingredients_count > 0 ? (
                        <span>
                          {rec.ingredients_count} TP
                          {rec.variants_count > 0 ? ` (+${rec.variants_count} size)` : ''}
                          {rec.estimated_cost > 0 ? <> · <strong>{formatCurrency(rec.estimated_cost)}</strong></> : null}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>+ Gắn công thức</span>
                      )}
                    </button>
                  </td>
                  <td>
                    <span className={`badge ${p.active ? 'badge-success' : 'badge-danger'}`}>
                      {p.active ? 'Đang bán' : 'Đã ẩn'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditProduct(p)}>
                        <Edit2 size={14} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setConfirmToggle(p)}>
                        {p.active ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setConfirmDelete(p)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Modal */}
      <Modal open={showProductModal} onClose={() => setShowProductModal(false)} title={editingProduct ? 'Sửa món' : 'Thêm món mới'}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="input-label">Tên món</label>
            <input className="input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ví dụ: Cà phê sữa" />
          </div>
          <div>
            <label className="input-label">Giá (VNĐ)</label>
            <input className="input" type="number" value={formPrice || ''} onChange={(e) => setFormPrice(Number(e.target.value))} placeholder="30000" />
          </div>
          <div>
            <label className="input-label">Danh mục</label>
            <select className="select" value={formCatId} onChange={(e) => setFormCatId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowProductModal(false)}>Hủy</button>
            <button className="btn btn-primary" onClick={handleSaveProduct}>
              {editingProduct ? 'Cập nhật' : 'Thêm'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Category Modal */}
      <Modal open={showCatModal} onClose={() => setShowCatModal(false)} title="Quản lý danh mục">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 350 }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input className="input" style={{ flex: 1 }} value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Tên danh mục mới..." />
            <button className="btn btn-primary" onClick={handleAddCategory}>Thêm</button>
          </div>
          
          <div style={{ maxHeight: '40vh', overflowY: 'auto' }}>
            <table className="data-table">
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td>
                      {editingCatId === c.id ? (
                        <input autoFocus className="input" value={editCatName} onChange={e => setEditCatName(e.target.value)} />
                      ) : (
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', width: 100 }}>
                      <div style={{ display: 'flex', gap: '0.25rem', justifyContent: 'flex-end' }}>
                        {editingCatId === c.id ? (
                          <>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-success)' }} onClick={handleUpdateCategory}>Lưu</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditingCatId(null)}>Hủy</button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditingCatId(c.id); setEditCatName(c.name); }}>
                              <Edit2 size={14} />
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setConfirmDeleteCat(c)}>
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {categories.length === 0 && (
                  <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Chưa có danh mục</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteCat}
        title="Xóa danh mục"
        message={`Bạn có chắc muốn xóa danh mục "${confirmDeleteCat?.name}"? Các món thuộc danh mục này sẽ mất phân loại.`}
        onConfirm={handleDeleteCategory}
        onCancel={() => setConfirmDeleteCat(null)}
      />

      <ConfirmDialog
        open={!!confirmToggle}
        title={confirmToggle?.active ? 'Ẩn món' : 'Hiện món'}
        message={`Bạn có muốn ${confirmToggle?.active ? 'ẩn' : 'hiện'} món "${confirmToggle?.name}" không?`}
        onConfirm={handleToggleProduct}
        onCancel={() => setConfirmToggle(null)}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Xóa món"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn món "${confirmDelete?.name}"? Các đơn hàng cũ chứa món này có thể bị ảnh hưởng phần hiển thị chi tiết.`}
        onConfirm={handleDeleteProduct}
        onCancel={() => setConfirmDelete(null)}
      />

      <RecipeEditorModal
        open={!!recipeTarget}
        initialTarget={recipeTarget}
        allProductsSummary={recipesSummary}
        onClose={() => setRecipeTarget(null)}
        onSaved={loadData}
        onSuccess={success}
        onError={toastError}
      />
    </div>
  )
}
