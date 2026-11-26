import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Modal, LoadingSpinner } from '@/components/ui'
import { materialService } from '@/services/materialService'
import { formatCurrency, matchSearchWithAcronym, getAcronym } from '@/utils/helpers'
import { formatQty } from './materialFormatters'
import type { Material, ProductRecipeSummary, ProductVariantGroup } from '@/types'
import { Plus, Trash2, Copy, ChevronRight, ArrowLeft, Layers, FlaskConical, Search, X } from 'lucide-react'

export type RecipeTarget =
  | { kind: 'PRODUCT'; id: string; name: string; price?: number }
  | { kind: 'MATERIAL'; id: string; name: string }

interface RecipeRowDraft {
  material_id: string
  quantity: string
  note: string
}

function SearchableMaterialSelect({
  value,
  materials,
  onChange,
}: {
  value: string
  materials: Material[]
  onChange: (materialId: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedMat = materials.find((m) => m.id === value)

  const filtered = useMemo(() => {
    if (!query.trim()) return materials
    return materials.filter((m) => matchSearchWithAcronym(m.name, query))
  }, [materials, query])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleOpen = () => {
    setQuery('')
    setHighlightIdx(0)
    setIsOpen(true)
  }

  const handleSelect = (m: Material) => {
    onChange(m.id)
    setIsOpen(false)
    setQuery('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev + 1 < filtered.length ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filtered.length - 1)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={handleOpen}
        className="select"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.4rem',
          textAlign: 'left',
          cursor: 'pointer',
          width: '100%',
          padding: '0.45rem 0.65rem',
          background: '#ffffff',
          fontWeight: 500,
          borderColor: isOpen ? 'var(--color-coffee-600)' : 'var(--color-border)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedMat ? (
            <>
              <span className={`badge ${selectedMat.item_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.35rem' }}>
                {selectedMat.item_type === 'SEMI_FINISHED' ? 'Trung gian' : 'Gốc'}
              </span>
              <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{selectedMat.name}</span>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>({selectedMat.unit})</span>
            </>
          ) : (
            <span style={{ color: 'var(--color-text-muted)' }}>-- Chọn nguyên liệu --</span>
          )}
        </span>
        <Search size={14} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 70,
            background: '#ffffff',
            border: '1.5px solid var(--color-coffee-500)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
            padding: '0.35rem',
            width: '100%',
            minWidth: '260px',
            maxWidth: '360px',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '0.35rem' }}>
            <Search size={13} style={{ position: 'absolute', left: '0.55rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              ref={inputRef}
              className="input"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setHighlightIdx(0)
              }}
              onKeyDown={handleKeyDown}
              placeholder="Gõ tên hoặc viết tắt (sd, st, cpg)..."
              style={{
                width: '100%',
                paddingLeft: '1.75rem',
                paddingRight: query ? '1.75rem' : '0.5rem',
                fontSize: '0.8rem',
                height: '30px',
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.35rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                Không tìm thấy nguyên liệu nào khớp "<strong>{query}</strong>"
              </div>
            ) : (
              filtered.map((m, idx) => {
                const isSelected = m.id === value
                const isHighlighted = idx === highlightIdx
                const acronym = getAcronym(m.name)
                return (
                  <div
                    key={m.id}
                    onClick={() => handleSelect(m)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    style={{
                      padding: '0.4rem 0.55rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: isHighlighted ? '#f8fafc' : isSelected ? '#fdf8f0' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.4rem',
                      fontSize: '0.8rem',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', overflow: 'hidden' }}>
                      <span className={`badge ${m.item_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`} style={{ fontSize: '0.62rem', padding: '0.05rem 0.25rem' }}>
                        {m.item_type === 'SEMI_FINISHED' ? 'Trung gian' : 'Gốc'}
                      </span>
                      <span style={{ fontWeight: isSelected ? 700 : 500, color: 'var(--color-text-primary)' }}>
                        {m.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        ({m.unit})
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '0.05rem 0.25rem', borderRadius: '3px', flexShrink: 0 }}>
                      {acronym}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface RecipeEditorModalProps {
  open: boolean
  initialTarget: RecipeTarget | null
  allProductsSummary?: ProductRecipeSummary[]
  onClose: () => void
  onSaved: () => void
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export function RecipeEditorModal({
  open,
  initialTarget,
  allProductsSummary = [],
  onClose,
  onSaved,
  onSuccess,
  onError,
}: RecipeEditorModalProps) {
  const [stack, setStack] = useState<RecipeTarget[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [rows, setRows] = useState<RecipeRowDraft[]>([])
  const [baseRowsCache, setBaseRowsCache] = useState<RecipeRowDraft[]>([])
  const [variants, setVariants] = useState<ProductVariantGroup[]>([])
  const [variantDrafts, setVariantDrafts] = useState<Record<string, RecipeRowDraft[]>>({})
  const [loadedVariantKeywords, setLoadedVariantKeywords] = useState<string[]>([])
  const [activeVariantKeyword, setActiveVariantKeyword] = useState<string | null>(null)
  const [showNewVariantInput, setShowNewVariantInput] = useState(false)
  const [newVariantName, setNewVariantName] = useState('')

  const [yieldQty, setYieldQty] = useState<string>('1')
  const [parentUnit, setParentUnit] = useState<string>('')
  const [cloneSourceId, setCloneSourceId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Quick Search & Add Bar (Tìm kiếm & thêm nhanh nguyên liệu bằng tên hoặc viết tắt)
  const [quickSearch, setQuickSearch] = useState('')
  const [showQuickDropdown, setShowQuickDropdown] = useState(false)
  const [quickHighlightIdx, setQuickHighlightIdx] = useState(0)
  const quickSearchInputRef = useRef<HTMLInputElement>(null)
  const quickDropdownRef = useRef<HTMLDivElement>(null)

  const currentTarget = stack[stack.length - 1] || null

  const loadTargetData = useCallback(
    async (target: RecipeTarget, targetVariantKeyword: string | null = null) => {
      setLoading(true)
      try {
        const mats = await materialService.getAll(true)
        setMaterials(mats)

        if (target.kind === 'PRODUCT') {
          const [items, varGroups] = await Promise.all([
            materialService.getProductRecipe(target.id),
            materialService.getProductVariants(target.id),
          ])
          const baseDrafts = items.map((it) => ({
            material_id: it.material_id,
            quantity: String(it.quantity),
            note: it.note || '',
          }))
          setBaseRowsCache(baseDrafts)
          setVariants(varGroups)
          const draftsMap: Record<string, RecipeRowDraft[]> = {}
          for (const vg of varGroups) {
            draftsMap[vg.variant_keyword] = vg.items.map((it) => ({
              material_id: it.material_id,
              quantity: String(it.quantity),
              note: it.note || '',
            }))
          }
          setVariantDrafts(draftsMap)
          setLoadedVariantKeywords(varGroups.map((vg) => vg.variant_keyword))
          setActiveVariantKeyword(targetVariantKeyword)

          if (targetVariantKeyword) {
            setRows(draftsMap[targetVariantKeyword] ? draftsMap[targetVariantKeyword].map((d) => ({ ...d })) : baseDrafts.map((b) => ({ ...b })))
          } else {
            setRows(baseDrafts)
          }
        } else {
          setVariants([])
          setVariantDrafts({})
          setLoadedVariantKeywords([])
          setActiveVariantKeyword(null)
          const detail = await materialService.getMaterialRecipe(target.id)
          setYieldQty(String(detail.parent.yield_qty || 1))
          setParentUnit(detail.parent.unit)
          setRows(
            detail.items.map((it) => ({
              material_id: it.ingredient_material_id,
              quantity: String(it.quantity),
              note: it.note || '',
            }))
          )
        }
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : 'Không thể tải công thức')
      } finally {
        setLoading(false)
      }
    },
    [onError]
  )

  useEffect(() => {
    if (open && initialTarget) {
      setStack([initialTarget])
      setCloneSourceId('')
      setShowNewVariantInput(false)
      setNewVariantName('')
      setQuickSearch('')
      setShowQuickDropdown(false)
      loadTargetData(initialTarget, null)
    } else if (!open) {
      setStack([])
      setRows([])
      setBaseRowsCache([])
      setVariants([])
      setVariantDrafts({})
      setLoadedVariantKeywords([])
      setActiveVariantKeyword(null)
      setQuickSearch('')
      setShowQuickDropdown(false)
    }
  }, [open, initialTarget, loadTargetData])

  const materialMap = new Map(materials.map((m) => [m.id, m]))

  const availableMaterials = materials.filter((m) => {
    if (!m.active) return false
    if (currentTarget?.kind === 'MATERIAL' && m.id === currentTarget.id) return false
    return true
  })

  // Tìm kiếm nhanh nguyên liệu với viết tắt
  const filteredQuickMaterials = useMemo(() => {
    if (!quickSearch.trim()) return []
    return availableMaterials.filter((m) => matchSearchWithAcronym(m.name, quickSearch))
  }, [availableMaterials, quickSearch])

  const handleSelectQuickMaterial = (mat: Material) => {
    const existingIdx = rows.findIndex((r) => r.material_id === mat.id)
    if (existingIdx >= 0) {
      onSuccess(`"${mat.name}" đã có trong bảng ở dòng ${existingIdx + 1}`)
    } else {
      setRows((prev) => [...prev, { material_id: mat.id, quantity: '', note: '' }])
      onSuccess(`Đã thêm "${mat.name}" (${mat.unit})`)
    }
    setQuickSearch('')
    setShowQuickDropdown(false)
  }

  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if (!showQuickDropdown || filteredQuickMaterials.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setQuickHighlightIdx((prev) => (prev + 1 < filteredQuickMaterials.length ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setQuickHighlightIdx((prev) => (prev - 1 >= 0 ? prev - 1 : Math.max(0, filteredQuickMaterials.length - 1)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredQuickMaterials[quickHighlightIdx]) {
        handleSelectQuickMaterial(filteredQuickMaterials[quickHighlightIdx])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setShowQuickDropdown(false)
    }
  }

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (
        quickDropdownRef.current &&
        !quickDropdownRef.current.contains(e.target as Node) &&
        quickSearchInputRef.current &&
        !quickSearchInputRef.current.contains(e.target as Node)
      ) {
        setShowQuickDropdown(false)
      }
    }
    if (showQuickDropdown) {
      document.addEventListener('mousedown', handleOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [showQuickDropdown])

  const handleSwitchVariantTab = (kw: string | null) => {
    if (kw === activeVariantKeyword) return

    const nextBase = activeVariantKeyword === null ? rows : baseRowsCache
    const nextVariantDrafts =
      activeVariantKeyword !== null
        ? { ...variantDrafts, [activeVariantKeyword]: rows }
        : variantDrafts

    if (activeVariantKeyword === null) {
      setBaseRowsCache(rows)
    } else {
      setVariantDrafts(nextVariantDrafts)
    }

    setActiveVariantKeyword(kw)
    setShowNewVariantInput(false)
    if (kw === null) {
      setRows(nextBase)
    } else if (nextVariantDrafts[kw]) {
      setRows(nextVariantDrafts[kw])
    } else {
      setRows(nextBase.map((r) => ({ ...r })))
    }
  }

  const handleStartVariant = (kwRaw: string) => {
    const kw = kwRaw.trim()
    if (!kw) {
      onError('Vui lòng nhập từ khóa biến thể (VD: Size L)')
      return
    }
    const nextBase = activeVariantKeyword === null ? rows : baseRowsCache
    const nextVariantDrafts =
      activeVariantKeyword !== null
        ? { ...variantDrafts, [activeVariantKeyword]: rows }
        : { ...variantDrafts }

    if (activeVariantKeyword === null) {
      setBaseRowsCache(rows)
    }

    const existing = variants.find((v) => v.variant_keyword.toLowerCase() === kw.toLowerCase())
    const resolvedKw = existing ? existing.variant_keyword : kw

    if (!existing) {
      setVariants((prev) => [...prev, { variant_keyword: resolvedKw, items: [] }])
    }

    const targetRows =
      nextVariantDrafts[resolvedKw] && nextVariantDrafts[resolvedKw].length > 0
        ? nextVariantDrafts[resolvedKw]
        : nextBase.map((r) => ({ ...r }))

    nextVariantDrafts[resolvedKw] = targetRows
    setVariantDrafts(nextVariantDrafts)
    setActiveVariantKeyword(resolvedKw)
    setRows(targetRows)
    setShowNewVariantInput(false)
    setNewVariantName('')
  }

  const handleDeleteVariant = async () => {
    if (!currentTarget || currentTarget.kind !== 'PRODUCT' || !activeVariantKeyword) return
    try {
      await materialService.deleteProductVariant(currentTarget.id, activeVariantKeyword)
      onSuccess(`Đã xóa công thức biến thể "${activeVariantKeyword}"`)
      onSaved()
      await loadTargetData(currentTarget, null)
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể xóa biến thể')
    }
  }

  const handleAddRow = () => {
    const usedIds = new Set(rows.map((r) => r.material_id))
    const candidate = availableMaterials.find((m) => !usedIds.has(m.id)) || availableMaterials[0]
    if (!candidate) {
      onError('Chưa có nguyên vật liệu nào. Hãy thêm nguyên vật liệu trước.')
      return
    }
    setRows([...rows, { material_id: candidate.id, quantity: '', note: '' }])
  }

  const handleUpdateRow = (idx: number, patch: Partial<RecipeRowDraft>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const handleRemoveRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleDrillDown = (mat: Material) => {
    const next: RecipeTarget = { kind: 'MATERIAL', id: mat.id, name: mat.name }
    setStack((prev) => [...prev, next])
    loadTargetData(next, null)
  }

  const handleBackStack = () => {
    if (stack.length <= 1) return
    const nextStack = stack.slice(0, -1)
    setStack(nextStack)
    loadTargetData(nextStack[nextStack.length - 1], null)
  }

  const handleClone = async () => {
    if (!currentTarget || currentTarget.kind !== 'PRODUCT' || !cloneSourceId) return
    try {
      const sourceItems = await materialService.getProductRecipe(cloneSourceId)
      if (sourceItems.length === 0) {
        onError('Món nguồn chưa có công thức để sao chép')
        return
      }
      setRows(
        sourceItems.map((it) => ({
          material_id: it.material_id,
          quantity: String(it.quantity),
          note: it.note || '',
        }))
      )
      onSuccess('Đã chép công thức vào nháp — bấm "Lưu công thức" để xác nhận')
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi sao chép công thức')
    }
  }

  const handleCopyFromBase = () => {
    if (baseRowsCache.length === 0) {
      onError('Công thức chuẩn của món này hiện đang trống')
      return
    }
    setRows(baseRowsCache.map((r) => ({ ...r })))
    onSuccess('Đã chép từ công thức chuẩn — bạn sửa định lượng rồi bấm Lưu')
  }

  const handleSave = async () => {
    if (!currentTarget) return

    const validateRows = (list: RecipeRowDraft[], label?: string): boolean => {
      for (const r of list) {
        if (!r.material_id) {
          onError(`${label ? `[${label}] ` : ''}Vui lòng chọn nguyên vật liệu cho tất cả các dòng`)
          return false
        }
        const q = Number(r.quantity)
        if (!Number.isFinite(q) || q <= 0) {
          const m = materialMap.get(r.material_id)
          onError(`${label ? `[${label}] ` : ''}Định lượng của "${m?.name || 'nguyên liệu'}" phải lớn hơn 0`)
          return false
        }
      }
      return true
    }

    if (currentTarget.kind === 'PRODUCT') {
      const finalBaseRows = activeVariantKeyword === null ? rows : baseRowsCache
      const finalVariantDrafts: Record<string, RecipeRowDraft[]> =
        activeVariantKeyword !== null
          ? { ...variantDrafts, [activeVariantKeyword]: rows }
          : { ...variantDrafts }

      if (!validateRows(finalBaseRows, 'Công thức chuẩn')) return
      for (const [kw, vRows] of Object.entries(finalVariantDrafts)) {
        if (vRows.length > 0 && !validateRows(vRows, kw)) return
      }

      setSaving(true)
      try {
        const basePayload = finalBaseRows.map((r) => ({
          material_id: r.material_id,
          quantity: Number(r.quantity),
          note: r.note || undefined,
        }))
        await materialService.saveProductRecipe(currentTarget.id, basePayload)

        const savedVariants: string[] = []
        for (const [kw, vRows] of Object.entries(finalVariantDrafts)) {
          if (vRows.length > 0) {
            const vPayload = vRows.map((r) => ({
              material_id: r.material_id,
              quantity: Number(r.quantity),
              note: r.note || undefined,
            }))
            await materialService.saveProductVariantRecipe(currentTarget.id, kw, vPayload)
            savedVariants.push(kw)
          } else if (loadedVariantKeywords.includes(kw)) {
            await materialService.deleteProductVariant(currentTarget.id, kw)
          }
        }

        onSuccess(
          savedVariants.length > 0
            ? `Đã lưu công thức (Chuẩn & ${savedVariants.join(', ')}) cho món "${currentTarget.name}"`
            : `Đã lưu công thức cho món "${currentTarget.name}"`
        )
        onSaved()
        if (stack.length > 1) {
          handleBackStack()
        } else {
          onClose()
        }
      } catch (err: unknown) {
        onError(err instanceof Error ? err.message : 'Không thể lưu công thức')
      } finally {
        setSaving(false)
      }
      return
    }

    if (!validateRows(rows)) return

    setSaving(true)
    try {
      const y = Number(yieldQty)
      if (!Number.isFinite(y) || y <= 0) {
        onError('Sản lượng thành phẩm thu được của 1 mẻ phải lớn hơn 0')
        setSaving(false)
        return
      }
      await materialService.saveMaterialRecipe(
        currentTarget.id,
        rows.map((r) => ({ ingredient_material_id: r.material_id, quantity: Number(r.quantity), note: r.note || undefined })),
        y
      )
      onSuccess(`Đã lưu công thức mẻ cho "${currentTarget.name}"`)
      onSaved()
      if (stack.length > 1) {
        handleBackStack()
      } else {
        onClose()
      }
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Không thể lưu công thức')
    } finally {
      setSaving(false)
    }
  }

  const draftCost = rows.reduce((sum, r) => {
    const mat = materialMap.get(r.material_id)
    const q = Number(r.quantity) || 0
    if (!mat || q <= 0) return sum
    return sum + q * (mat.effective_unit_cost || mat.unit_cost || 0)
  }, 0)

  const parsedYield = Number(yieldQty) > 0 ? Number(yieldQty) : 1
  const clonableProducts = allProductsSummary.filter(
    (p) => p.ingredients_count > 0 && currentTarget?.kind === 'PRODUCT' && p.product_id !== currentTarget.id
  )
  const hasSizeLVariant = variants.some((v) => v.variant_keyword.toLowerCase() === 'size l')

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      contentStyle={{ maxWidth: '56rem' }}
      title={
        currentTarget?.kind === 'PRODUCT'
          ? `Công thức định lượng: ${currentTarget.name}`
          : `Công thức mẻ bán thành phẩm: ${currentTarget?.name || ''}`
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
          <LoadingSpinner size={30} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Breadcrumb khi drill-down qua nhiều bước trung gian */}
          {stack.length > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: '#fdf8f0',
                border: '1px solid var(--color-coffee-200)',
                fontSize: '0.82rem',
                flexWrap: 'wrap',
              }}
            >
              <button type="button" className="btn btn-ghost btn-sm" onClick={handleBackStack} style={{ padding: '0.2rem 0.5rem' }}>
                <ArrowLeft size={14} /> Quay lại
              </button>
              {stack.map((s, idx) => (
                <span key={`${s.kind}-${s.id}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                  {idx > 0 && <ChevronRight size={13} color="var(--color-text-muted)" />}
                  <strong style={{ color: idx === stack.length - 1 ? 'var(--color-coffee-700)' : 'var(--color-text-secondary)' }}>
                    {s.name}
                  </strong>
                </span>
              ))}
            </div>
          )}

          {/* Header riêng cho Bán thành phẩm hoặc Sản phẩm (kèm tab Biến thể Size L) */}
          {currentTarget?.kind === 'MATERIAL' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '1rem',
                alignItems: 'end',
                padding: '0.875rem',
                borderRadius: 'var(--radius-lg)',
                background: '#fffbeb',
                border: '1px solid #fde68a',
              }}
            >
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <FlaskConical size={15} />
                  Thành phẩm thu được sau 1 mẻ sơ chế / ủ phin ({parentUnit})
                </div>
                <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                  Ví dụ: Ủ 300g Cafe A + 200g Cafe B thu được thực tế <strong>800 ml</strong> cốt Cà phê chung.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 180 }}>
                <input
                  type="number"
                  step="any"
                  min="0.001"
                  className="input"
                  value={yieldQty}
                  onChange={(e) => setYieldQty(e.target.value)}
                  style={{ fontWeight: 700, textAlign: 'right' }}
                />
                <span style={{ fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap' }}>{parentUnit}</span>
              </div>
            </div>
          ) : (
            <>
              {/* Tab chọn Công thức chuẩn vs Biến thể (Size L...) */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', paddingBottom: '0.25rem', borderBottom: '1px solid var(--color-border-light)' }}>
                <button
                  type="button"
                  className={`btn btn-sm ${activeVariantKeyword === null ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleSwitchVariantTab(null)}
                >
                  Công thức chuẩn
                </button>
                {variants.map((v) => (
                  <button
                    key={v.variant_keyword}
                    type="button"
                    className={`btn btn-sm ${activeVariantKeyword === v.variant_keyword ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => handleSwitchVariantTab(v.variant_keyword)}
                  >
                    {v.variant_keyword} {v.items.length > 0 ? `(${v.items.length})` : ''}
                  </button>
                ))}
                {!hasSizeLVariant && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ border: '1px dashed var(--color-coffee-400)', color: 'var(--color-coffee-700)' }}
                    onClick={() => handleStartVariant('Size L')}
                  >
                    <Plus size={13} /> Thêm Size L
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowNewVariantInput((s) => !s)}
                >
                  <Plus size={13} /> Biến thể khác
                </button>
              </div>

              {showNewVariantInput && (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', background: '#f8fafc', padding: '0.625rem', borderRadius: 'var(--radius-md)' }}>
                  <input
                    className="input"
                    value={newVariantName}
                    onChange={(e) => setNewVariantName(e.target.value)}
                    placeholder="Nhập tên Topping / ghi chú nhận diện (VD: Size XL, Nóng...)"
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => handleStartVariant(newVariantName)}>
                    Tạo biến thể
                  </button>
                </div>
              )}

              {activeVariantKeyword ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-md)', background: '#fffbeb', border: '1px solid #fde68a', fontSize: '0.8rem', color: '#92400e' }}>
                  <span>
                    Khi thu ngân chọn kèm <strong>{activeVariantKeyword}</strong> (Topping/ghi chú), hệ thống sẽ dùng công thức bên dưới thay cho công thức chuẩn.
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCopyFromBase}>
                      <Copy size={13} /> Chép từ chuẩn
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={handleDeleteVariant}>
                      <Trash2 size={13} /> Xóa biến thể
                    </button>
                  </div>
                </div>
              ) : (
                clonableProducts.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select
                      className="select"
                      value={cloneSourceId}
                      onChange={(e) => setCloneSourceId(e.target.value)}
                      style={{ flex: 1, minWidth: 220 }}
                    >
                      <option value="">-- Sao chép nhanh từ món đã có công thức --</option>
                      {clonableProducts.map((p) => (
                        <option key={p.product_id} value={p.product_id}>
                          [{getAcronym(p.product_name)}] {p.product_name} ({p.ingredients_count} thành phần)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={!cloneSourceId}
                      onClick={handleClone}
                    >
                      <Copy size={14} /> Chép vào nháp
                    </button>
                  </div>
                )
              )}
            </>
          )}

          {/* Thanh tìm kiếm & thêm nhanh nguyên liệu (Hỗ trợ viết tắt) */}
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
                <input
                  ref={quickSearchInputRef}
                  className="input"
                  value={quickSearch}
                  onChange={(e) => {
                    setQuickSearch(e.target.value)
                    setShowQuickDropdown(true)
                    setQuickHighlightIdx(0)
                  }}
                  onFocus={() => {
                    if (quickSearch.trim()) setShowQuickDropdown(true)
                  }}
                  onKeyDown={handleQuickKeyDown}
                  placeholder="🔍 Gõ tên hoặc viết tắt để thêm nhanh (VD: sd, st, cpg, đường, sữa)..."
                  style={{
                    paddingLeft: '2.25rem',
                    paddingRight: quickSearch ? '2rem' : '0.75rem',
                    height: '38px',
                    fontSize: '0.875rem',
                  }}
                />
                {quickSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuickSearch('')
                      setShowQuickDropdown(false)
                    }}
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
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAddRow}
                style={{ height: '38px', whiteSpace: 'nowrap' }}
                title="Thêm một dòng trống thủ công"
              >
                <Plus size={15} /> + Dòng trống
              </button>
            </div>

            {/* Dropdown danh sách nguyên liệu khớp với từ khóa / viết tắt */}
            {showQuickDropdown && quickSearch.trim().length > 0 && (
              <div
                ref={quickDropdownRef}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 4px)',
                  left: 0,
                  right: 0,
                  zIndex: 80,
                  background: '#ffffff',
                  border: '1.5px solid var(--color-coffee-500)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2)',
                  maxHeight: '260px',
                  overflowY: 'auto',
                }}
              >
                {filteredQuickMaterials.length === 0 ? (
                  <div style={{ padding: '0.875rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    Không tìm thấy nguyên liệu nào khớp với "<strong>{quickSearch}</strong>"
                  </div>
                ) : (
                  filteredQuickMaterials.map((m, idx) => {
                    const isHighlighted = idx === quickHighlightIdx
                    const acronym = getAcronym(m.name)
                    const isAlreadyAdded = rows.some((r) => r.material_id === m.id)
                    return (
                      <div
                        key={m.id}
                        onClick={() => handleSelectQuickMaterial(m)}
                        onMouseEnter={() => setQuickHighlightIdx(idx)}
                        style={{
                          padding: '0.625rem 0.875rem',
                          cursor: 'pointer',
                          background: isHighlighted ? '#f8fafc' : '#ffffff',
                          borderBottom: '1px solid var(--color-border-light)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`badge ${m.item_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`} style={{ fontSize: '0.7rem' }}>
                            {m.item_type === 'SEMI_FINISHED' ? 'Trung gian' : 'Gốc'}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                            {m.name}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                            {acronym}
                          </span>
                          {isAlreadyAdded && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-coffee-600)', fontWeight: 600 }}>
                              (đã có)
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span>{formatCurrency(m.effective_unit_cost || m.unit_cost || 0)} / {m.unit}</span>
                          <span className="btn btn-secondary btn-sm" style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem' }}>
                            + Thêm
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>

          {/* Bảng thành phần */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'visible' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Nguyên liệu / Trung gian</th>
                  <th style={{ width: '22%' }}>Định lượng</th>
                  <th style={{ width: '16%' }}>Giá vốn</th>
                  <th style={{ width: '22%', textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: '1.5rem' }}>
                      Chưa có thành phần nào. Gõ vào ô tìm kiếm ở trên hoặc bấm "+ Dòng trống" để nhập công thức.
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const mat = materialMap.get(row.material_id)
                    const q = Number(row.quantity) || 0
                    const unitCost = mat ? mat.effective_unit_cost || mat.unit_cost || 0 : 0
                    const lineCost = Math.round(q * unitCost)
                    return (
                      <tr key={idx}>
                        <td style={{ overflow: 'visible' }}>
                          <SearchableMaterialSelect
                            value={row.material_id}
                            materials={availableMaterials}
                            onChange={(newId) => handleUpdateRow(idx, { material_id: newId })}
                          />
                          {mat?.item_type === 'SEMI_FINISHED' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-coffee-600)', marginTop: '0.25rem' }}>
                              1 mẻ tạo {formatQty(mat.yield_qty)} {mat.unit} · {mat.recipe_ingredients_count} thành phần
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              className="input"
                              placeholder="0"
                              value={row.quantity}
                              onChange={(e) => handleUpdateRow(idx, { quantity: e.target.value })}
                              style={{ textAlign: 'right' }}
                            />
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-secondary)', minWidth: 28 }}>
                              {mat?.unit || ''}
                            </span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                          {lineCost > 0 ? formatCurrency(lineCost) : <span style={{ color: 'var(--color-text-muted)' }}>—</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                            {mat?.item_type === 'SEMI_FINISHED' && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                title="Xem / sửa công thức của bước trung gian này"
                                onClick={() => handleDrillDown(mat)}
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                <Layers size={13} /> Sửa mẻ
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--color-danger)' }}
                              onClick={() => handleRemoveRow(idx)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddRow}>
              <Plus size={15} /> Thêm nguyên liệu
            </button>

            {draftCost > 0 && (
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textAlign: 'right' }}>
                {currentTarget?.kind === 'PRODUCT' ? (
                  <>
                    Giá vốn ước tính / phần:{' '}
                    <strong style={{ color: 'var(--color-coffee-700)', fontSize: '1rem' }}>
                      {formatCurrency(Math.round(draftCost))}
                    </strong>
                    {currentTarget.price && currentTarget.price > 0 ? (
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        ({Math.round((draftCost / currentTarget.price) * 1000) / 10}% giá bán)
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    Chi phí 1 mẻ ({formatQty(parsedYield)} {parentUnit}):{' '}
                    <strong style={{ color: 'var(--color-coffee-700)' }}>{formatCurrency(Math.round(draftCost))}</strong>
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      (≈ {formatCurrency(Math.round(draftCost / parsedYield))} / {parentUnit})
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Đóng
            </button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? 'Đang lưu...' : 'Lưu công thức'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
