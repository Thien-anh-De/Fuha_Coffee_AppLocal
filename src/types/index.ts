/* ============================================================
   POS 1994 Coffee — Type Definitions
   ============================================================ */

// ── Roles & Auth ──────────────────────────────────────────────
export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER'
export type ProfileStatus = 'active' | 'disabled'

export interface Profile {
  id: string
  name: string
  email?: string
  role: UserRole
  status: ProfileStatus
  created_at: string
}

// ── Categories ────────────────────────────────────────────────
export interface Category {
  id: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
}

// ── Products ──────────────────────────────────────────────────
export interface Product {
  id: string
  category_id: string
  name: string
  price: number
  active: boolean
  created_at: string
  updated_at: string
  category?: Category
}

// ── Tables ────────────────────────────────────────────────────
export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'DISABLED'

export interface CoffeeTable {
  id: string
  name: string
  status: TableStatus
  sort_order: number
  active: boolean
  created_at: string
}

// ── Orders ────────────────────────────────────────────────────
export type OrderStatus = 'OPEN' | 'PAID' | 'CANCELLED'

export interface Order {
  id: string
  table_id: string
  cashier_id: string
  invoice_number: string
  status: OrderStatus
  subtotal: number
  discount: number
  total: number
  note?: string
  created_at: string
  paid_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  table?: CoffeeTable
  cashier?: Profile
  items?: OrderItem[]
  payment?: Payment
  payments?: Payment[]
}

// ── Order Items ───────────────────────────────────────────────
export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  note?: string
}

// ── Payments ──────────────────────────────────────────────────
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER'

export interface Payment {
  id: string
  order_id: string
  method: PaymentMethod | 'MIXED'
  amount: number
  paid_at: string
  cashier_id: string
}

// ── Audit Logs ────────────────────────────────────────────────
export interface AuditLog {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string
  details?: string
  created_at: string
  user?: Profile
}

// ── Revenue/Report Types ──────────────────────────────────────
export interface RevenueData {
  total_revenue: number
  total_orders: number
  avg_order_value: number
}

export interface TopProduct {
  product_name: string
  total_quantity: number
  total_revenue: number
}

export interface MonthlyRevenue {
  month: number
  year: number
  total_revenue: number
  total_orders: number
}

// ── Overview & Management Dashboard Types ─────────────────────
export interface HourlyRevenue {
  hour: number
  label: string
  revenue: number
  order_count: number
}

export interface ProductComparison {
  product_name: string
  current_qty: number
  current_revenue: number
  prev_qty: number
  prev_revenue: number
  diff_qty: number
  pct_change: number
  trend: 'up' | 'down' | 'same' | 'new'
}

export interface PaymentBreakdown {
  cash_amount: number
  cash_orders: number
  bank_amount: number
  bank_orders: number
}

export interface CashierPerformance {
  cashier_id: string
  cashier_name: string
  total_orders: number
  total_revenue: number
  avg_order_value: number
}

export interface CategoryRevenue {
  category_name: string
  total_quantity: number
  total_revenue: number
  percentage: number
}

export interface CancelledOrderSummary {
  id: string
  invoice_number: string
  table_name: string
  cancelled_by_name: string
  total: number
  cancel_reason: string
  cancelled_at: string
}

export interface OverviewSummary {
  net_revenue: number
  gross_revenue: number
  discount_total: number
  total_orders: number
  avg_order_value: number
  prev_net_revenue: number
  prev_orders: number
  revenue_growth_pct: number
  orders_growth_pct: number
  peak_hour: number | null
  peak_hour_revenue: number
}

export type ReportPeriodType = 'daily' | 'monthly' | 'quarterly' | 'yearly' | 'product'

export interface ExportReportRow {
  period_label: string
  order_count: number
  gross_revenue: number
  discount: number
  net_revenue: number
  avg_order_value: number
  note?: string
}

export interface ProductReportRow {
  product_name: string
  category_name: string
  unit_price: number
  quantity: number
  total_revenue: number
  percentage: number
}

export interface ShiftClosingData {
  closing_time: string
  period_title: string
  cashier_name: string
  net_revenue: number
  gross_revenue: number
  discount_total: number
  total_orders: number
  cash_amount: number
  cash_orders: number
  bank_amount: number
  bank_orders: number
  cancelled_orders_count: number
  cancelled_orders_amount: number
  top_items: { name: string; qty: number; revenue: number }[]
}

// ── UI / Cart ─────────────────────────────────────────────────
export interface CartItem {
  product_id: string
  product_name: string
  unit_price: number
  quantity: number
  subtotal: number
  note?: string
}

export interface ToppingOption {
  id: string
  name: string
  price: number
}

// ── Advanced Sales & Profitability Types ──────────────────────
export type DayTypeFilter = 'ALL' | 'WEEKDAY' | 'WEEKEND'

export interface ProductPerformance {
  product_id?: string
  product_name: string
  category_name?: string
  unit_price: number
  quantity: number
  revenue: number
  share_percent: number
}

export interface DayOfWeekRevenue {
  day_index: number
  day_name: string
  revenue: number
  order_count: number
  avg_revenue: number
  share_percent: number
}

export interface DailyTimelineRevenue {
  date_str: string
  label: string
  revenue: number
  order_count: number
  is_weekend: boolean
}

export interface WeekendComparison {
  weekday_revenue: number
  weekday_orders: number
  weekday_days_count: number
  weekday_avg_daily: number
  weekend_revenue: number
  weekend_orders: number
  weekend_days_count: number
  weekend_avg_daily: number
  weekend_ratio: number
}

// ── Materials, Multi-level Recipes & Wastage Management ───────
export type MaterialItemType = 'RAW' | 'SEMI_FINISHED'
export type DeductionMode = 'EXPLODE_ON_SALE' | 'BATCH_STOCK'
export type StockMovementType =
  | 'IMPORT'
  | 'SALE_DEDUCTION'
  | 'SALE_REVERSAL'
  | 'PREP_CONSUME'
  | 'PREP_OUTPUT'
  | 'WASTAGE'
  | 'STOCKTAKE_ADJUST'

export interface MeasurementUnit {
  id: string
  name: string
  sort_order: number
  active: boolean
  created_at: string
}

export interface WastageReason {
  id: string
  name: string
  color: string
  sort_order: number
  active: boolean
  created_at: string
}

export interface PosModifierRule {
  id: string
  keyword: string
  material_id: string
  material_name: string
  material_unit: string
  delta_qty: number
  active: boolean
  note?: string
  created_at: string
}

export interface Material {
  id: string
  code?: string | null
  name: string
  item_type: MaterialItemType
  unit: string
  purchase_unit?: string | null
  conversion_factor: number
  yield_qty: number
  deduction_mode: DeductionMode
  current_stock: number
  min_stock: number
  unit_cost: number
  effective_unit_cost: number
  recipe_ingredients_count: number
  active: boolean
  note?: string | null
  created_at: string
  updated_at: string
}

export interface MaterialRecipeItem {
  id: string
  parent_material_id: string
  ingredient_material_id: string
  ingredient_name: string
  ingredient_unit: string
  ingredient_type: MaterialItemType
  quantity: number
  effective_unit_cost: number
  line_cost: number
  note?: string | null
}

export interface MaterialRecipeDetail {
  parent: Material
  items: MaterialRecipeItem[]
}

export interface ProductRecipeItem {
  id: string
  product_id: string
  material_id: string
  material_name: string
  material_unit: string
  material_type: MaterialItemType
  material_yield_qty: number
  quantity: number
  effective_unit_cost: number
  line_cost: number
  note?: string | null
}

export interface ProductVariantGroup {
  variant_keyword: string
  items: (ProductRecipeItem & { variant_keyword: string })[]
}

export interface ProductRecipeSummary {
  product_id: string
  product_name: string
  category_id: string
  category_name: string
  price: number
  active: boolean
  ingredients_count: number
  estimated_cost: number
  food_cost_pct: number
  ingredients: {
    material_id: string
    material_name: string
    material_type: MaterialItemType
    unit: string
    quantity: number
    line_cost: number
  }[]
  variants_count: number
  variants: {
    variant_keyword: string
    ingredients_count: number
    estimated_cost: number
    ingredients: {
      material_id: string
      material_name: string
      material_type: MaterialItemType
      unit: string
      quantity: number
      line_cost: number
    }[]
  }[]
}

export interface BomTreeNode {
  material_id: string
  material_name: string
  item_type: MaterialItemType
  unit: string
  deduction_mode?: DeductionMode
  yield_qty?: number
  quantity: number
  depth: number
  cost_amount: number
  children: BomTreeNode[]
}

export interface BomSummaryEntry {
  material_id: string
  material_name: string
  item_type: MaterialItemType
  unit: string
  deduction_mode: DeductionMode
  quantity: number
  cost_amount: number
}

export interface BomSimulationResult {
  directSummary: BomSummaryEntry[]
  intermediateSummary: BomSummaryEntry[]
  rawLeafSummary: BomSummaryEntry[]
  stockDeductions: BomSummaryEntry[]
  itemBreakdowns: {
    product_id: string | null
    product_name: string
    quantity: number
    note: string
    tree: BomTreeNode[]
  }[]
  totalCost: number
}

export interface PrepBatch {
  id: string
  material_id: string
  material_name: string
  unit: string
  batch_multiplier: number
  expected_yield_qty: number
  actual_yield_qty: number
  loss_qty: number
  total_cost: number
  inputs: {
    material_id: string
    material_name: string
    unit: string
    quantity: number
    cost: number
  }[]
  created_by?: string | null
  created_by_name?: string | null
  note?: string | null
  created_at: string
}

export interface WastageLog {
  id: string
  material_id: string
  material_name: string
  unit: string
  quantity: number
  reason_id?: string | null
  reason_name: string
  cost_amount: number
  note?: string | null
  created_by?: string | null
  created_by_name?: string | null
  created_at: string
}

export interface StocktakeItem {
  id: string
  stocktake_id: string
  material_id: string
  material_name: string
  unit: string
  system_stock: number
  actual_stock: number
  variance_qty: number
  unit_cost: number
  variance_cost: number
  note?: string | null
}

export interface Stocktake {
  id: string
  title: string
  status: 'DRAFT' | 'COMPLETED'
  total_variance_cost: number
  note?: string | null
  created_by?: string | null
  created_by_name?: string | null
  completed_at?: string | null
  created_at: string
  items: StocktakeItem[]
}

export interface StockMovement {
  id: string
  material_id: string
  material_name: string
  unit: string
  movement_type: StockMovementType
  qty_change: number
  balance_after: number
  unit_cost: number
  total_cost: number
  reference_type?: string | null
  reference_id?: string | null
  created_by?: string | null
  created_by_name?: string | null
  note?: string | null
  created_at: string
}

export interface MaterialLedgerRow {
  material_id: string
  material_name: string
  item_type: MaterialItemType
  unit: string
  deduction_mode: DeductionMode
  opening_stock: number
  imported_qty: number
  sold_qty: number
  prep_consumed_qty: number
  prep_output_qty: number
  wastage_qty: number
  stocktake_adjust_qty: number
  closing_stock: number
  sold_cost: number
  wastage_cost: number
  stocktake_loss_cost: number
}

export interface MaterialWastageReport {
  range: { from: string; to: string }
  summary: {
    net_revenue: number
    paid_orders: number
    total_sale_material_cost: number
    total_wastage_cost: number
    total_prep_loss_cost: number
    total_prep_loss_qty: number
    total_stocktake_loss_cost: number
  }
  sold_products: {
    product_name: string
    quantity: number
    cost_amount: number
  }[]
  direct_consumption: {
    material_id: string
    material_name: string
    material_type: MaterialItemType
    unit: string
    total_qty: number
  }[]
  exploded_raw_consumption: {
    material_id: string
    material_name: string
    material_type: MaterialItemType
    unit: string
    total_qty: number
    total_cost: number
  }[]
  inventory_ledger: MaterialLedgerRow[]
  wastage_by_reason: {
    reason_name: string
    count: number
    total_cost: number
  }[]
  prep_batches: PrepBatch[]
}

export interface MaterialConsumptionSummary {
  range: { from: string; to: string }
  summary: {
    paid_orders: number
    total_cups_sold: number
    net_revenue: number
    raw_materials_count: number
    total_sale_cost: number
    total_extra_wastage_cost: number
    total_cost: number
  }
  raw_consumption: {
    material_id: string
    material_name: string
    unit: string
    sale_qty: number
    extra_wastage_qty: number
    total_qty: number
    sale_cost: number
    extra_wastage_cost: number
    total_cost: number
  }[]
  direct_consumption: {
    material_id: string
    material_name: string
    material_type: MaterialItemType
    unit: string
    sale_qty: number
    extra_wastage_qty: number
    total_qty: number
  }[]
  sold_products: {
    product_id: string | null
    product_name: string
    quantity: number
    has_recipe: boolean
    cost_amount: number
    direct_materials: {
      material_id: string
      material_name: string
      material_type: MaterialItemType
      unit: string
      quantity: number
    }[]
    raw_materials: {
      material_id: string
      material_name: string
      unit: string
      quantity: number
      cost_amount: number
    }[]
  }[]
  unconfigured_products: {
    product_id: string | null
    product_name: string
    quantity: number
    has_recipe: boolean
    cost_amount: number
  }[]
  extra_wastage_logs: WastageLog[]
}

