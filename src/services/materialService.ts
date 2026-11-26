import { callDb } from '@/services/localDatabase'
import type {
  MeasurementUnit,
  WastageReason,
  PosModifierRule,
  Material,
  MaterialItemType,
  DeductionMode,
  MaterialRecipeDetail,
  ProductRecipeItem,
  ProductVariantGroup,
  ProductRecipeSummary,
  BomSimulationResult,
  PrepBatch,
  WastageLog,
  Stocktake,
  StockMovement,
  StockMovementType,
  MaterialWastageReport,
  MaterialConsumptionSummary,
} from '@/types'

export interface MaterialInput {
  code?: string
  name: string
  item_type: MaterialItemType
  unit: string
  purchase_unit?: string
  conversion_factor?: number
  yield_qty?: number
  deduction_mode?: DeductionMode
  current_stock?: number
  min_stock?: number
  unit_cost?: number
  active?: boolean
  note?: string
}

export const materialService = {
  // ── Units & Reasons & POS Modifier Rules ────────────────────
  async getUnits(): Promise<MeasurementUnit[]> {
    return callDb<MeasurementUnit[]>('getUnits')
  },

  async saveUnit(data: { id?: string; name: string; sort_order?: number }): Promise<MeasurementUnit> {
    return callDb<MeasurementUnit>('saveUnit', data)
  },

  async deleteUnit(id: string): Promise<void> {
    await callDb('deleteUnit', id)
  },

  async getWastageReasons(): Promise<WastageReason[]> {
    return callDb<WastageReason[]>('getWastageReasons')
  },

  async saveWastageReason(data: { id?: string; name: string; color?: string }): Promise<WastageReason> {
    return callDb<WastageReason>('saveWastageReason', data)
  },

  async deleteWastageReason(id: string): Promise<void> {
    await callDb('deleteWastageReason', id)
  },

  async getModifierRules(): Promise<PosModifierRule[]> {
    return callDb<PosModifierRule[]>('getModifierRules')
  },

  async saveModifierRule(data: {
    id?: string
    keyword: string
    material_id: string
    delta_qty: number
    active?: boolean
    note?: string
  }): Promise<PosModifierRule[]> {
    return callDb<PosModifierRule[]>('saveModifierRule', data)
  },

  async deleteModifierRule(id: string): Promise<void> {
    await callDb('deleteModifierRule', id)
  },

  // ── Materials & Semi-finished ───────────────────────────────
  async getAll(includeInactive = true): Promise<Material[]> {
    return callDb<Material[]>('getMaterials', includeInactive)
  },

  async create(data: MaterialInput): Promise<Material> {
    return callDb<Material>('createMaterial', data)
  },

  async update(id: string, updates: Partial<MaterialInput>): Promise<Material> {
    return callDb<Material>('updateMaterial', id, updates)
  },

  async delete(id: string): Promise<void> {
    await callDb('deleteMaterial', id)
  },

  // ── Recipes (Multi-level) ───────────────────────────────────
  async getMaterialRecipe(parentMaterialId: string): Promise<MaterialRecipeDetail> {
    return callDb<MaterialRecipeDetail>('getMaterialRecipe', parentMaterialId)
  },

  async saveMaterialRecipe(
    parentMaterialId: string,
    items: { ingredient_material_id: string; quantity: number; note?: string }[],
    yieldQty?: number
  ): Promise<MaterialRecipeDetail> {
    return callDb<MaterialRecipeDetail>('saveMaterialRecipe', parentMaterialId, items, yieldQty)
  },

  async getProductRecipe(productId: string): Promise<ProductRecipeItem[]> {
    return callDb<ProductRecipeItem[]>('getProductRecipe', productId)
  },

  async getAllProductRecipesSummary(): Promise<ProductRecipeSummary[]> {
    return callDb<ProductRecipeSummary[]>('getAllProductRecipesSummary')
  },

  async saveProductRecipe(
    productId: string,
    items: { material_id: string; quantity: number; note?: string }[]
  ): Promise<ProductRecipeItem[]> {
    return callDb<ProductRecipeItem[]>('saveProductRecipe', productId, items)
  },

  async getProductVariants(productId: string): Promise<ProductVariantGroup[]> {
    return callDb<ProductVariantGroup[]>('getProductVariants', productId)
  },

  async saveProductVariantRecipe(
    productId: string,
    variantKeyword: string,
    items: { material_id: string; quantity: number; note?: string }[]
  ): Promise<ProductVariantGroup[]> {
    return callDb<ProductVariantGroup[]>('saveProductVariantRecipe', productId, variantKeyword, items)
  },

  async deleteProductVariant(productId: string, variantKeyword: string): Promise<ProductVariantGroup[]> {
    return callDb<ProductVariantGroup[]>('deleteProductVariant', productId, variantKeyword)
  },

  async cloneProductRecipe(sourceProductId: string, targetProductId: string): Promise<ProductRecipeItem[]> {
    return callDb<ProductRecipeItem[]>('cloneProductRecipe', sourceProductId, targetProductId)
  },

  async simulate(
    items: { product_id: string; product_name?: string; quantity: number; note?: string }[]
  ): Promise<BomSimulationResult> {
    return callDb<BomSimulationResult>('simulateRecipeConsumption', items)
  },

  // ── Stock, Prep Batches, Wastage & Stocktakes ───────────────
  async importStock(payload: {
    material_id: string
    input_qty: number
    use_purchase_unit?: boolean
    total_cost?: number
    note?: string
    user_id?: string
  }): Promise<Material> {
    return callDb<Material>('importMaterialStock', payload)
  },

  async createPrepBatch(payload: {
    material_id: string
    batch_multiplier: number
    actual_yield_qty: number
    custom_inputs?: { material_id: string; quantity: number }[]
    note?: string
    user_id?: string
  }): Promise<PrepBatch> {
    return callDb<PrepBatch>('createPrepBatch', payload)
  },

  async getPrepBatches(filters?: { from?: string; to?: string; material_id?: string }): Promise<PrepBatch[]> {
    return callDb<PrepBatch[]>('getPrepBatches', filters || {})
  },

  async createWastageLog(payload: {
    material_id: string
    quantity: number
    reason_id?: string
    reason_name?: string
    note?: string
    user_id?: string
  }): Promise<WastageLog> {
    return callDb<WastageLog>('createWastageLog', payload)
  },

  async getWastageLogs(filters?: { from?: string; to?: string; reason_id?: string }): Promise<WastageLog[]> {
    return callDb<WastageLog[]>('getWastageLogs', filters || {})
  },

  async deleteWastageLog(id: string): Promise<void> {
    await callDb('deleteWastageLog', id)
  },

  async createStocktake(payload: {
    title: string
    items: { material_id: string; actual_stock: number; note?: string }[]
    note?: string
    user_id?: string
  }): Promise<Stocktake> {
    return callDb<Stocktake>('createStocktake', payload)
  },

  async getStocktakes(): Promise<Stocktake[]> {
    return callDb<Stocktake[]>('getStocktakes')
  },

  async getStockMovements(filters?: {
    material_id?: string
    movement_type?: StockMovementType
    from?: string
    to?: string
  }): Promise<StockMovement[]> {
    return callDb<StockMovement[]>('getStockMovements', filters || {})
  },

  async getWastageReport(filters?: { from?: string; to?: string }): Promise<MaterialWastageReport> {
    return callDb<MaterialWastageReport>('getMaterialWastageReport', filters || {})
  },

  async getConsumptionSummary(filters?: {
    from?: string
    to?: string
    use_current_recipes?: boolean
  }): Promise<MaterialConsumptionSummary> {
    return callDb<MaterialConsumptionSummary>('getMaterialConsumptionSummary', filters || {})
  },

  async seedExampleMaterials(): Promise<{ success: boolean; matchedProductId: string | null }> {
    return callDb<{ success: boolean; matchedProductId: string | null }>('seedExampleMaterials')
  },

  async exportRecipesJson(): Promise<Record<string, unknown>> {
    return callDb<Record<string, unknown>>('exportMaterialsAndRecipes')
  },

  async importRecipesJson(payload: Record<string, unknown>): Promise<{
    success: boolean
    addedMaterials: number
    addedMaterialRecipes: number
    addedProductRecipes: number
  }> {
    return callDb('importMaterialsAndRecipes', payload)
  },
}
