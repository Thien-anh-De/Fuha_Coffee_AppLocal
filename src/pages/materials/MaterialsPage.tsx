import { useState, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { ToastContainer } from '@/components/ui'
import type { ProductRecipeSummary } from '@/types'
import { MaterialsSummaryTab } from './MaterialsSummaryTab'
import { MaterialsSetupTab } from './MaterialsSetupTab'
import { SimulatorTab } from './SimulatorTab'
import { RecipeEditorModal, type RecipeTarget } from './RecipeEditorModal'
import {
  Scale,
  BarChart3,
  Layers,
  Calculator,
} from 'lucide-react'

type MainTab = 'summary' | 'setup' | 'simulator'

export default function MaterialsPage() {
  const { hasRole } = useAuth()
  if (!hasRole('OWNER', 'MANAGER')) {
    return <Navigate to="/pos" replace />
  }

  const { toasts, success, error: toastError, removeToast } = useToast()
  const [activeTab, setActiveTab] = useState<MainTab>('summary')
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const [recipeOpen, setRecipeOpen] = useState(false)
  const [recipeTarget, setRecipeTarget] = useState<RecipeTarget | null>(null)
  const [productsSummaryCache, setProductsSummaryCache] = useState<ProductRecipeSummary[]>([])

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((n) => n + 1)
  }, [])

  const handleOpenRecipe = useCallback((target: RecipeTarget, summaryList?: ProductRecipeSummary[]) => {
    if (summaryList) setProductsSummaryCache(summaryList)
    setRecipeTarget(target)
    setRecipeOpen(true)
  }, [])

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '2.5rem' }}>
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <Scale color="var(--color-coffee-600)" size={26} />
          Tổng Kết Nguyên Liệu & Hao Hụt
        </h1>
        <p className="page-subtitle">
          Thiết lập định mức nhiều bước trung gian và tổng kết lượng nguyên liệu đã dùng theo bán hàng
        </p>
      </div>

      {/* 3 Tab rõ ràng, gọn nhẹ */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[
          { id: 'summary', label: '1. Tổng kết đã dùng', icon: BarChart3 },
          { id: 'setup', label: '2. Nguyên liệu & Công thức', icon: Layers },
          { id: 'simulator', label: '3. Tính thử theo số cốc', icon: Calculator },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn ${activeTab === tab.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab.id as MainTab)}
            style={{ borderRadius: 'var(--radius-lg)', fontWeight: activeTab === tab.id ? 700 : 600 }}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && (
        <MaterialsSummaryTab
          refreshTrigger={refreshTrigger}
          onGoToRecipes={() => setActiveTab('setup')}
          onOpenProductRecipe={(productId, productName) =>
            handleOpenRecipe({ kind: 'PRODUCT', id: productId, name: productName })
          }
          onChanged={triggerRefresh}
          onError={toastError}
          onSuccess={success}
        />
      )}

      {activeTab === 'setup' && (
        <MaterialsSetupTab
          refreshTrigger={refreshTrigger}
          onChanged={triggerRefresh}
          onOpenRecipe={handleOpenRecipe}
          onSuccess={success}
          onError={toastError}
        />
      )}

      {activeTab === 'simulator' && (
        <SimulatorTab
          refreshTrigger={refreshTrigger}
          onSuccess={success}
          onError={toastError}
        />
      )}

      <RecipeEditorModal
        open={recipeOpen}
        initialTarget={recipeTarget}
        allProductsSummary={productsSummaryCache}
        onClose={() => setRecipeOpen(false)}
        onSaved={triggerRefresh}
        onSuccess={success}
        onError={toastError}
      />
    </div>
  )
}
