import { callDb } from '@/services/localDatabase'
import { normalizeProductItem } from '@/utils/helpers'
import type {
  OverviewSummary,
  HourlyRevenue,
  ProductComparison,
  PaymentBreakdown,
  CashierPerformance,
  CategoryRevenue,
  CancelledOrderSummary,
  ExportReportRow,
  ReportPeriodType,
  ProductReportRow,
  Order,
  Product,
  Category,
} from '@/types'

export type PeriodType = 'today' | 'yesterday' | '7days' | 'this_month' | 'this_year' | 'custom'

export interface OverviewPayload {
  summary: OverviewSummary
  hourly: HourlyRevenue[]
  products: ProductComparison[]
  payments: PaymentBreakdown
  cancelled: CancelledOrderSummary[]
  cashiers: CashierPerformance[]
  categories: CategoryRevenue[]
  currentRange: { from: string; to: string; label: string }
}

export const overviewService = {
  /**
   * Helper to compute ISO start/end for periods & comparison periods
   */
  getPeriodRange(period: PeriodType, customFrom?: string, customTo?: string) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    let currentStart = todayStart
    let currentEnd = todayEnd
    let prevStart = new Date(todayStart.getTime() - 86400000)
    let prevEnd = new Date(todayEnd.getTime() - 86400000)
    let label = 'Hôm nay'

    if (period === 'yesterday') {
      currentStart = new Date(todayStart.getTime() - 86400000)
      currentEnd = new Date(todayEnd.getTime() - 86400000)
      prevStart = new Date(currentStart.getTime() - 86400000)
      prevEnd = new Date(currentEnd.getTime() - 86400000)
      label = 'Hôm qua'
    } else if (period === '7days') {
      currentStart = new Date(todayStart.getTime() - 6 * 86400000)
      currentEnd = todayEnd
      prevStart = new Date(currentStart.getTime() - 7 * 86400000)
      prevEnd = new Date(currentStart.getTime() - 1)
      label = '7 ngày qua'
    } else if (period === 'this_month') {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
      prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      label = `Tháng ${now.getMonth() + 1}/${now.getFullYear()}`
    } else if (period === 'this_year') {
      currentStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0)
      currentEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0)
      prevEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
      label = `Năm ${now.getFullYear()}`
    } else if (period === 'custom' && customFrom && customTo) {
      currentStart = new Date(customFrom + 'T00:00:00')
      currentEnd = new Date(customTo + 'T23:59:59.999')
      const duration = currentEnd.getTime() - currentStart.getTime()
      prevStart = new Date(currentStart.getTime() - duration - 1000)
      prevEnd = new Date(currentStart.getTime() - 1000)
      label = `${customFrom} đến ${customTo}`
    }

    return {
      currentFrom: currentStart.toISOString(),
      currentTo: currentEnd.toISOString(),
      prevFrom: prevStart.toISOString(),
      prevTo: prevEnd.toISOString(),
      label,
    }
  },

  async getOverviewData(
    period: PeriodType = 'today',
    customFrom?: string,
    customTo?: string
  ): Promise<OverviewPayload> {
    const range = this.getPeriodRange(period, customFrom, customTo)
    return callDb<OverviewPayload>('getOverviewData', range)
  },

  async getReportData(
    type: ReportPeriodType,
    options: {
      year: number
      month?: number
      from?: string
      to?: string
    }
  ): Promise<ExportReportRow[]> {
    const { year, month } = options

    if (type === 'daily') {
      const targetMonth = month ? month - 1 : new Date().getMonth()
      const daysInMonth = new Date(year, targetMonth + 1, 0).getDate()
      const startIso = new Date(year, targetMonth, 1, 0, 0, 0).toISOString()
      const endIso = new Date(year, targetMonth, daysInMonth, 23, 59, 59, 999).toISOString()

      const orders = await callDb<Order[]>('getOrders', {
        status: 'PAID',
        from: startIso,
        to: endIso,
      })

      const rows: ExportReportRow[] = []
      for (let d = 1; d <= daysInMonth; d++) {
        const dayPrefix = `${year}-${String(targetMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        const dayOrders = orders.filter((o) => (o.paid_at || o.created_at).startsWith(dayPrefix))

        const net = dayOrders.reduce((s, o) => s + (o.total || 0), 0)
        const gross = dayOrders.reduce((s, o) => s + (o.subtotal || 0), 0)
        const disc = dayOrders.reduce((s, o) => s + (o.discount || 0), 0)
        const count = dayOrders.length

        rows.push({
          period_label: `Ngày ${String(d).padStart(2, '0')}/${String(targetMonth + 1).padStart(2, '0')}/${year}`,
          order_count: count,
          gross_revenue: gross,
          discount: disc,
          net_revenue: net,
          avg_order_value: count > 0 ? Math.round(net / count) : 0,
        })
      }
      return rows
    }

    if (type === 'monthly') {
      const startIso = new Date(year, 0, 1, 0, 0, 0).toISOString()
      const endIso = new Date(year, 11, 31, 23, 59, 59, 999).toISOString()

      const orders = await callDb<Order[]>('getOrders', {
        status: 'PAID',
        from: startIso,
        to: endIso,
      })

      const rows: ExportReportRow[] = []
      for (let m = 0; m < 12; m++) {
        const mPrefix = `${year}-${String(m + 1).padStart(2, '0')}`
        const mOrders = orders.filter((o) => (o.paid_at || o.created_at).startsWith(mPrefix))

        const net = mOrders.reduce((s, o) => s + (o.total || 0), 0)
        const gross = mOrders.reduce((s, o) => s + (o.subtotal || 0), 0)
        const disc = mOrders.reduce((s, o) => s + (o.discount || 0), 0)
        const count = mOrders.length

        rows.push({
          period_label: `Tháng ${String(m + 1).padStart(2, '0')}/${year}`,
          order_count: count,
          gross_revenue: gross,
          discount: disc,
          net_revenue: net,
          avg_order_value: count > 0 ? Math.round(net / count) : 0,
        })
      }
      return rows
    }

    if (type === 'quarterly') {
      const quarters = [
        { name: `Quý 1/${year} (Tháng 1 - 3)`, startM: 0, endM: 2 },
        { name: `Quý 2/${year} (Tháng 4 - 6)`, startM: 3, endM: 5 },
        { name: `Quý 3/${year} (Tháng 7 - 9)`, startM: 6, endM: 8 },
        { name: `Quý 4/${year} (Tháng 10 - 12)`, startM: 9, endM: 11 },
      ]

      const startIso = new Date(year, 0, 1).toISOString()
      const endIso = new Date(year, 11, 31, 23, 59, 59, 999).toISOString()

      const orders = await callDb<Order[]>('getOrders', {
        status: 'PAID',
        from: startIso,
        to: endIso,
      })

      const rows: ExportReportRow[] = []
      for (const q of quarters) {
        const qOrders = orders.filter((o) => {
          const dateStr = o.paid_at || o.created_at
          if (!dateStr) return false
          const m = new Date(dateStr).getMonth()
          return m >= q.startM && m <= q.endM
        })

        const net = qOrders.reduce((s, o) => s + (o.total || 0), 0)
        const gross = qOrders.reduce((s, o) => s + (o.subtotal || 0), 0)
        const disc = qOrders.reduce((s, o) => s + (o.discount || 0), 0)
        const count = qOrders.length

        rows.push({
          period_label: q.name,
          order_count: count,
          gross_revenue: gross,
          discount: disc,
          net_revenue: net,
          avg_order_value: count > 0 ? Math.round(net / count) : 0,
        })
      }
      return rows
    }

    if (type === 'yearly') {
      const currentYear = new Date().getFullYear()
      const years = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear]
      const rows: ExportReportRow[] = []

      for (const y of years) {
        const startIso = new Date(y, 0, 1).toISOString()
        const endIso = new Date(y, 11, 31, 23, 59, 59, 999).toISOString()

        const orders = await callDb<Order[]>('getOrders', {
          status: 'PAID',
          from: startIso,
          to: endIso,
        })

        const net = orders.reduce((s, o) => s + (o.total || 0), 0)
        const gross = orders.reduce((s, o) => s + (o.subtotal || 0), 0)
        const disc = orders.reduce((s, o) => s + (o.discount || 0), 0)
        const count = orders.length

        rows.push({
          period_label: `Năm ${y}`,
          order_count: count,
          gross_revenue: gross,
          discount: disc,
          net_revenue: net,
          avg_order_value: count > 0 ? Math.round(net / count) : 0,
        })
      }
      return rows
    }

    return []
  },

  async getProductReportData(options: {
    year: number
    month?: number
    from?: string
    to?: string
  }): Promise<ProductReportRow[]> {
    const { year, month, from, to } = options
    let startIso: string
    let endIso: string

    if (from && to) {
      startIso = new Date(from + 'T00:00:00').toISOString()
      endIso = new Date(to + 'T23:59:59.999').toISOString()
    } else if (month && month >= 1 && month <= 12) {
      const daysInMonth = new Date(year, month, 0).getDate()
      startIso = new Date(year, month - 1, 1, 0, 0, 0).toISOString()
      endIso = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999).toISOString()
    } else {
      startIso = new Date(year, 0, 1, 0, 0, 0).toISOString()
      endIso = new Date(year, 11, 31, 23, 59, 59, 999).toISOString()
    }

    const orders = await callDb<Order[]>('getOrders', {
      status: 'PAID',
      from: startIso,
      to: endIso,
    })

    if (!orders || orders.length === 0) return []

    const [products, categories] = await Promise.all([
      callDb<Product[]>('getProducts'),
      callDb<Category[]>('getCategories'),
    ])

    const map = new Map<
      string,
      { product_name: string; category_name: string; unit_price: number; quantity: number; revenue: number }
    >()

    let totalAllRevenue = 0

    for (const ord of orders) {
      for (const item of ord.items || []) {
        const info = normalizeProductItem(item, products || [], categories || [])
        const existing = map.get(info.key) ?? {
          product_name: info.product_name,
          category_name: info.category_name,
          unit_price: info.unit_price,
          quantity: 0,
          revenue: 0,
        }
        existing.quantity += item.quantity
        existing.revenue += item.subtotal
        if (info.unit_price > 0) {
          existing.unit_price = info.unit_price
        }
        totalAllRevenue += item.subtotal
        map.set(info.key, existing)
      }
    }

    const results: ProductReportRow[] = []
    for (const val of map.values()) {
      results.push({
        product_name: val.product_name,
        category_name: val.category_name,
        unit_price: val.unit_price,
        quantity: val.quantity,
        total_revenue: val.revenue,
        percentage: totalAllRevenue > 0 ? Number(((val.revenue / totalAllRevenue) * 100).toFixed(1)) : 0,
      })
    }

    results.sort((a, b) => b.quantity - a.quantity || b.total_revenue - a.total_revenue)
    return results
  },
}
