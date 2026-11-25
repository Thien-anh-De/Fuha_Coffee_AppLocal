import { useState, useEffect, useCallback } from 'react'
import { materialService } from '@/services/materialService'
import { LoadingSpinner } from '@/components/ui'
import { formatCurrency, getAcronym } from '@/utils/helpers'
import { formatQty } from './materialFormatters'
import type { ProductRecipeSummary, BomSimulationResult, BomTreeNode, Material, PosModifierRule } from '@/types'
import {
  Calculator,
  Plus,
  Trash2,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
} from 'lucide-react'

function BomTreeView({ nodes }: { nodes: BomTreeNode[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {nodes.map((node, idx) => (
        <div key={`${node.material_id}-${idx}`} style={{ paddingLeft: node.depth > 1 ? '1.15rem' : 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              padding: '0.35rem 0.625rem',
              borderRadius: 'var(--radius-md)',
              background: node.item_type === 'SEMI_FINISHED' ? '#fffbeb' : '#f8fafc',
              border: `1px solid ${node.item_type === 'SEMI_FINISHED' ? '#fde68a' : 'var(--color-border-light)'}`,
              fontSize: '0.82rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              {node.depth > 1 && <ChevronRight size={13} color="var(--color-text-muted)" />}
              <span style={{ fontWeight: 600 }}>{node.material_name}</span>
              <span className={`badge ${node.item_type === 'SEMI_FINISHED' ? 'badge-warning' : 'badge-coffee'}`}>
                {node.item_type === 'SEMI_FINISHED' ? 'Trung gian' : 'Gốc'}
              </span>
            </div>
            <strong>{formatQty(node.quantity)} {node.unit}</strong>
          </div>
          {node.children.length > 0 && (
            <div style={{ marginTop: '0.25rem', borderLeft: '2px dashed #f59e0b', marginLeft: '0.625rem' }}>
              <BomTreeView nodes={node.children} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface Props {
  refreshTrigger: number
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export function SimulatorTab({ refreshTrigger, onSuccess, onError }: Props) {
  const [productsSummary, setProductsSummary] = useState<ProductRecipeSummary[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [rules, setRules] = useState<PosModifierRule[]>([])
  const [loading, setLoading] = useState(true)

  const [simRows, setSimRows] = useState<{ product_id: string; quantity: string; note: string }[]>([])
  const [simResult, setSimResult] = useState<BomSimulationResult | null>(null)
  const [showAdvancedRules, setShowAdvancedRules] = useState(false)

  // Advanced rule form
  const [keyword, setKeyword] = useState('')
  const [ruleMatId, setRuleMatId] = useState('')
  const [deltaQty, setDeltaQty] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [prods, mats, rList] = await Promise.all([
        materialService.getAllProductRecipesSummary(),
        materialService.getAll(false),
        materialService.getModifierRules(),
      ])
      setProductsSummary(prods)
      setMaterials(mats)
      setRules(rList)
      if (!ruleMatId && mats.length > 0) setRuleMatId(mats[0].id)
      setSimRows((prev) => {
        if (prev.length > 0) return prev
        const defaultProd = prods.find((p) => p.ingredients_count > 0) || prods[0]
        return defaultProd ? [{ product_id: defaultProd.product_id, quantity: '4', note: '' }] : []
      })
    } catch {
      onError('Không thể tải dữ liệu tính thử')
    } finally {
      setLoading(false)
    }
  }, [onError, ruleMatId])

  useEffect(() => {
    loadData()
  }, [loadData, refreshTrigger])

  const runSimulation = useCallback(async () => {
    const valid = simRows
      .filter((r) => r.product_id && Number(r.quantity) > 0)
      .map((r) => ({ product_id: r.product_id, quantity: Number(r.quantity), note: r.note }))
    if (valid.length === 0) {
      setSimResult(null)
      return
    }
    try {
      const res = await materialService.simulate(valid)
      setSimResult(res)
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi tính thử')
    }
  }, [simRows, onError])

  useEffect(() => {
    if (!loading) {
      runSimulation()
    }
  }, [loading, refreshTrigger, runSimulation])

  const handleAddRule = async () => {
    const dq = Number(deltaQty)
    if (!keyword.trim() || !ruleMatId || !Number.isFinite(dq) || dq === 0) {
      onError('Nhập đầy đủ từ khóa ghi chú POS và lượng cộng/trừ khác 0')
      return
    }
    try {
      await materialService.saveModifierRule({ keyword: keyword.trim(), material_id: ruleMatId, delta_qty: dq })
      setKeyword('')
      setDeltaQty('')
      onSuccess('Đã thêm quy tắc ghi chú POS')
      loadData()
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Lỗi lưu quy tắc')
    }
  }

  const handleDeleteRule = async (id: string) => {
    try {
      await materialService.deleteModifierRule(id)
      onSuccess('Đã xóa quy tắc')
      loadData()
    } catch {
      onError('Lỗi xóa quy tắc')
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <LoadingSpinner size={30} />
      </div>
    )
  }

  const selectedRuleMat = materials.find((m) => m.id === ruleMatId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
      <div className="glass-card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calculator size={18} color="var(--color-coffee-600)" />
              Tính thử lượng nguyên liệu theo số cốc
            </h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Chọn món và nhập số lượng (VD: 4 cốc Cà phê nâu) để xem máy tự nhân và quy đổi qua các bước trung gian.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const first = productsSummary[0]
              if (first) setSimRows([...simRows, { product_id: first.product_id, quantity: '1', note: '' }])
            }}
          >
            <Plus size={14} /> Thêm món
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {simRows.map((row, idx) => {
            const isSizeL = /\bsize\s*l\b/i.test(row.note)
            return (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 95px auto 1.3fr auto', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="select"
                value={row.product_id}
                onChange={(e) => setSimRows((prev) => prev.map((r, i) => (i === idx ? { ...r, product_id: e.target.value } : r)))}
              >
                {productsSummary.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    [{getAcronym(p.product_name)}] {p.product_name} {p.ingredients_count > 0 ? `(${p.ingredients_count} TP${p.variants_count > 0 ? ` + ${p.variants_count} size` : ''})` : '(chưa cài công thức)'}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                className="input"
                value={row.quantity}
                onChange={(e) => setSimRows((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))}
                placeholder="Số cốc"
                style={{ textAlign: 'right', fontWeight: 700 }}
              />
              <button
                type="button"
                className={`btn btn-sm ${isSizeL ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() =>
                  setSimRows((prev) =>
                    prev.map((r, i) => {
                      if (i !== idx) return r
                      const cleaned = r.note.replace(/\bsize\s*l\b/gi, '').replace(/[•,]/g, ' ').replace(/\s+/g, ' ').trim()
                      return { ...r, note: isSizeL ? cleaned : [cleaned, 'Size L'].filter(Boolean).join(' • ') }
                    })
                  )
                }
                title="Bật/tắt thử nghiệm công thức Size L"
              >
                Size L
              </button>
              <input
                className="input"
                value={row.note}
                onChange={(e) => setSimRows((prev) => prev.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r)))}
                placeholder="Ghi chú thêm (VD: + Kem muối, Nhiều sữa)"
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => setSimRows((prev) => prev.filter((_, i) => i !== idx))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            )
          })}
        </div>

        {simResult && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.875rem', paddingTop: '0.875rem', borderTop: '1px dashed var(--color-border)' }}>
            <div style={{ background: '#fdf8f0', padding: '0.875rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-coffee-200)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--color-coffee-800)', marginBottom: '0.5rem' }}>
                1. Dùng trực tiếp trên món
              </div>
              {simResult.directSummary.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Món này chưa gắn công thức.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.86rem' }}>
                  {simResult.directSummary.map((d) => (
                    <div key={d.material_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{d.material_name}</span>
                      <strong>{formatQty(d.quantity)} {d.unit}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#f0fdf4', padding: '0.875rem', borderRadius: 'var(--radius-lg)', border: '1px solid #bbf7d0' }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#166534', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                <span>2. Quy đổi về Nguyên liệu gốc</span>
                {simResult.totalCost > 0 && <span>{formatCurrency(simResult.totalCost)}</span>}
              </div>
              {simResult.rawLeafSummary.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Chưa có dữ liệu.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.86rem' }}>
                  {simResult.rawLeafSummary.map((r) => (
                    <div key={r.material_id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{r.material_name}</span>
                      <strong>{formatQty(r.quantity)} {r.unit}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#ffffff', padding: '0.875rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: '0.5rem' }}>
                3. Chi tiết qua các bước trung gian
              </div>
              {simResult.itemBreakdowns.map((ib, i) => (
                <div key={i} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--color-coffee-700)' }}>
                    {ib.product_name} × {ib.quantity}
                  </div>
                  {ib.tree.length === 0 ? (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Chưa có công thức</div>
                  ) : (
                    <BomTreeView nodes={ib.tree} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tùy chọn nâng cao thu gọn: Quy tắc ghi chú POS */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setShowAdvancedRules((v) => !v)}
          style={{
            width: '100%',
            padding: '0.875rem 1.25rem',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
            <SlidersHorizontal size={16} />
            Tùy chọn nâng cao: Cộng/trừ nguyên liệu khi thu ngân chọn ghi chú POS ({rules.length} quy tắc)
          </span>
          {showAdvancedRules ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {showAdvancedRules && (
          <div style={{ padding: '0 1.25rem 1.25rem 1.25rem', borderTop: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: '0.875rem', paddingTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.5fr 1fr auto', gap: '0.5rem', alignItems: 'end' }}>
              <div>
                <label className="input-label">Từ khóa ghi chú (VD: Nhiều sữa, Đậm cà phê)</label>
                <input className="input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Nhiều sữa" />
              </div>
              <div>
                <label className="input-label">Nguyên liệu tác động</label>
                <select className="select" value={ruleMatId} onChange={(e) => setRuleMatId(e.target.value)}>
                  {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </select>
              </div>
              <div>
                <label className="input-label">Tăng / Giảm ({selectedRuleMat?.unit || ''})</label>
                <input type="number" step="any" className="input" value={deltaQty} onChange={(e) => setDeltaQty(e.target.value)} placeholder="+10 hoặc -5" />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleAddRule}>
                <Plus size={14} /> Thêm
              </button>
            </div>

            {rules.length > 0 && (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Từ khóa POS</th>
                    <th>Nguyên liệu</th>
                    <th style={{ textAlign: 'right' }}>Điều chỉnh</th>
                    <th style={{ textAlign: 'right' }}>Xóa</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.keyword}</td>
                      <td>{r.material_name}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        {r.delta_qty > 0 ? `+${formatQty(r.delta_qty)}` : formatQty(r.delta_qty)} {r.material_unit}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => handleDeleteRule(r.id)}>
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
