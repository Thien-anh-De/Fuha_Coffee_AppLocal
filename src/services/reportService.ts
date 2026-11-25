import { callDb } from '@/services/localDatabase'
import { normalizeProductItem } from '@/utils/helpers'
import type {
  RevenueData,
  TopProduct,
  MonthlyRevenue,
  DayTypeFilter,
  HourlyRevenue,
  DayOfWeekRevenue,
  DailyTimelineRevenue,
  WeekendComparison,
  ProductPerformance,
  Order,
  Product,
} from '@/types'

export interface DetailedAnalyticsResult {
  summary: RevenueData & {
    cash_amount: number
    cash_orders: number
    bank_amount: number
    bank_orders: number
  }
  hourly: HourlyRevenue[]
  day_of_week: DayOfWeekRevenue[]
  daily_timeline: DailyTimelineRevenue[]
  weekend_comparison: WeekendComparison
}

export interface ProductRankingsResult {
  all_products: ProductPerformance[]
  top_high: ProductPerformance[]
  top_low: ProductPerformance[]
  total_sales_revenue: number
  total_sales_quantity: number
}

export const reportService = {
  async getRevenue(from: string, to: string): Promise<RevenueData> {
    const orders = await callDb<Order[]>('getOrders', {
      status: 'PAID',
      from,
      to,
    })

    const total_revenue = orders.reduce((sum, o) => sum + Number(o.total), 0)
    const total_orders = orders.length
    const avg_order_value = total_orders > 0 ? Math.round(total_revenue / total_orders) : 0

    return { total_revenue, total_orders, avg_order_value }
  },

  async getTodayRevenue(): Promise<RevenueData> {
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString()
    return this.getRevenue(start, end)
  },

  async getMonthlyRevenue(year: number): Promise<MonthlyRevenue[]> {
    const results: MonthlyRevenue[] = []

    for (let month = 1; month <= 12; month++) {
      const start = new Date(year, month - 1, 1).toISOString()
      const end = new Date(year, month, 1).toISOString()

      const orders = await callDb<Order[]>('getOrders', {
        status: 'PAID',
        from: start,
        to: end,
      })

      results.push({
        month,
        year,
        total_revenue: orders.reduce((sum, o) => sum + Number(o.total), 0),
        total_orders: orders.length,
      })
    }

    return results
  },

  async getYearlyRevenue(year: number): Promise<RevenueData> {
    const start = new Date(year, 0, 1).toISOString()
    const end = new Date(year + 1, 0, 1).toISOString()
    return this.getRevenue(start, end)
  },

  async getTopProducts(from: string, to: string, limit = 10): Promise<TopProduct[]> {
    const [orders, menuProducts] = await Promise.all([
      callDb<Order[]>('getOrders', {
        status: 'PAID',
        from,
        to,
      }),
      callDb<Product[]>('getProducts'),
    ])

    const map = new Map<string, { product_name: string; quantity: number; revenue: number }>()
    for (const o of orders) {
      for (const item of o.items || []) {
        const info = normalizeProductItem(item, menuProducts || [], [])
        const existing = map.get(info.key) ?? { product_name: info.product_name, quantity: 0, revenue: 0 }
        existing.quantity += item.quantity
        existing.revenue += Number(item.subtotal)
        map.set(info.key, existing)
      }
    }

    const results: TopProduct[] = []
    for (const val of map.values()) {
      results.push({
        product_name: val.product_name,
        total_quantity: val.quantity,
        total_revenue: val.revenue,
      })
    }

    results.sort((a, b) => b.total_quantity - a.total_quantity)
    return results.slice(0, limit)
  },

  async getDetailedAnalytics(
    from: string,
    to: string,
    filterType: DayTypeFilter = 'ALL'
  ): Promise<DetailedAnalyticsResult> {
    const allPaidOrders = await callDb<Order[]>('getOrders', {
      status: 'PAID',
      from,
      to,
    })

    let weekdayRev = 0
    let weekdayOrders = 0
    const weekdayDaysSet = new Set<string>()

    let weekendRev = 0
    let weekendOrders = 0
    const weekendDaysSet = new Set<string>()

    allPaidOrders.forEach((ord) => {
      const dateStr = ord.paid_at || ord.created_at
      if (!dateStr) return
      const d = new Date(dateStr)
      const dayOfWeek = d.getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      const dateKey = dateStr.substring(0, 10)
      const amt = Number(ord.total) || 0

      if (isWeekend) {
        weekendRev += amt
        weekendOrders += 1
        weekendDaysSet.add(dateKey)
      } else {
        weekdayRev += amt
        weekdayOrders += 1
        weekdayDaysSet.add(dateKey)
      }
    })

    const weekdayDaysCount = Math.max(weekdayDaysSet.size, 1)
    const weekendDaysCount = Math.max(weekendDaysSet.size, 1)
    const totalAllRev = weekdayRev + weekendRev
    const weekendRatio = totalAllRev > 0 ? Math.round((weekendRev / totalAllRev) * 100) : 0

    const weekend_comparison: WeekendComparison = {
      weekday_revenue: weekdayRev,
      weekday_orders: weekdayOrders,
      weekday_days_count: weekdayDaysCount,
      weekday_avg_daily: Math.round(weekdayRev / weekdayDaysCount),
      weekend_revenue: weekendRev,
      weekend_orders: weekendOrders,
      weekend_days_count: weekendDaysCount,
      weekend_avg_daily: Math.round(weekendRev / weekendDaysCount),
      weekend_ratio: weekendRatio,
    }

    const filteredOrders = allPaidOrders.filter((ord) => {
      const dateStr = ord.paid_at || ord.created_at
      if (!dateStr) return false
      if (filterType === 'ALL') return true
      const dayOfWeek = new Date(dateStr).getDay()
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      return filterType === 'WEEKEND' ? isWeekend : !isWeekend
    })

    let total_revenue = 0
    let cash_amount = 0
    let cash_orders = 0
    let bank_amount = 0
    let bank_orders = 0

    filteredOrders.forEach((ord) => {
      const tot = Number(ord.total) || 0
      total_revenue += tot

      const method = ord.payment?.method || 'CASH'
      if (method === 'CASH') {
        cash_amount += tot
        cash_orders += 1
      } else {
        bank_amount += tot
        bank_orders += 1
      }
    })

    const total_orders = filteredOrders.length
    const avg_order_value = total_orders > 0 ? Math.round(total_revenue / total_orders) : 0

    const hourlyMap = new Map<number, { revenue: number; count: number }>()
    for (let h = 6; h <= 23; h++) {
      hourlyMap.set(h, { revenue: 0, count: 0 })
    }

    filteredOrders.forEach((ord) => {
      const dateStr = ord.paid_at || ord.created_at
      if (!dateStr) return
      const h = new Date(dateStr).getHours()
      const cur = hourlyMap.get(h) ?? { revenue: 0, count: 0 }
      cur.revenue += Number(ord.total) || 0
      cur.count += 1
      hourlyMap.set(h, cur)
    })

    const hourly: HourlyRevenue[] = Array.from(hourlyMap.entries()).map(([hour, val]) => ({
      hour,
      label: `${hour}:00 - ${hour + 1}:00`,
      revenue: val.revenue,
      order_count: val.count,
    }))

    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
    const dayOfWeekMap = new Map<number, { revenue: number; count: number }>()
    for (let d = 0; d <= 6; d++) {
      dayOfWeekMap.set(d, { revenue: 0, count: 0 })
    }

    filteredOrders.forEach((ord) => {
      const dateStr = ord.paid_at || ord.created_at
      if (!dateStr) return
      const d = new Date(dateStr).getDay()
      const cur = dayOfWeekMap.get(d) ?? { revenue: 0, count: 0 }
      cur.revenue += Number(ord.total) || 0
      cur.count += 1
      dayOfWeekMap.set(d, cur)
    })

    const orderedDays = [1, 2, 3, 4, 5, 6, 0]
    const day_of_week: DayOfWeekRevenue[] = orderedDays.map((idx) => {
      const data = dayOfWeekMap.get(idx) ?? { revenue: 0, count: 0 }
      return {
        day_index: idx,
        day_name: dayNames[idx],
        revenue: data.revenue,
        order_count: data.count,
        avg_revenue: data.count > 0 ? Math.round(data.revenue / data.count) : 0,
        share_percent: total_revenue > 0 ? Math.round((data.revenue / total_revenue) * 100) : 0,
      }
    })

    const dailyMap = new Map<string, { revenue: number; count: number; isWeekend: boolean }>()
    filteredOrders.forEach((ord) => {
      const dateStr = ord.paid_at || ord.created_at
      if (!dateStr) return
      const d = new Date(dateStr)
      const dateKey = dateStr.substring(0, 10)
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      const cur = dailyMap.get(dateKey) ?? { revenue: 0, count: 0, isWeekend }
      cur.revenue += Number(ord.total) || 0
      cur.count += 1
      dailyMap.set(dateKey, cur)
    })

    const daily_timeline: DailyTimelineRevenue[] = Array.from(dailyMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, val]) => {
        const parts = dateKey.split('-')
        const label = `${parts[2]}/${parts[1]}/${parts[0]}`
        return {
          date_str: dateKey,
          label,
          revenue: val.revenue,
          order_count: val.count,
          is_weekend: val.isWeekend,
        }
      })

    return {
      summary: {
        total_revenue,
        total_orders,
        avg_order_value,
        cash_amount,
        cash_orders,
        bank_amount,
        bank_orders,
      },
      hourly,
      day_of_week,
      daily_timeline,
      weekend_comparison,
    }
  },

  async getProductRankings(
    from: string,
    to: string,
    filterType: DayTypeFilter = 'ALL'
  ): Promise<ProductRankingsResult> {
    const menuProducts = await callDb<Product[]>('getProducts')
    const allOrders = await callDb<Order[]>('getOrders', {
      status: 'PAID',
      from,
      to,
    })

    const validOrders = allOrders.filter((ord) => {
      const dateStr = ord.paid_at || ord.created_at
      if (!dateStr) return false
      if (filterType === 'ALL') return true
      const day = new Date(dateStr).getDay()
      const isWeekend = day === 0 || day === 6
      return filterType === 'WEEKEND' ? isWeekend : !isWeekend
    })

    const salesMap = new Map<string, { qty: number; revenue: number }>()
    let total_sales_revenue = 0
    let total_sales_quantity = 0

    validOrders.forEach((o) => {
      ;(o.items ?? []).forEach((it) => {
        const info = normalizeProductItem(it, menuProducts || [], [])
        const cur = salesMap.get(info.product_name) ?? { qty: 0, revenue: 0 }
        cur.qty += it.quantity
        cur.revenue += Number(it.subtotal) || 0
        salesMap.set(info.product_name, cur)

        total_sales_revenue += Number(it.subtotal) || 0
        total_sales_quantity += it.quantity
      })
    })

    const all_products: ProductPerformance[] = []
    const processedNames = new Set<string>()

    menuProducts.forEach((p) => {
      processedNames.add(p.name)
      const sales = salesMap.get(p.name) ?? { qty: 0, revenue: 0 }
      const unit_price = Number(p.price) || 0
      const share_percent =
        total_sales_revenue > 0 ? Math.round((sales.revenue / total_sales_revenue) * 100) : 0

      all_products.push({
        product_id: p.id,
        product_name: p.name,
        category_name: p.category?.name || 'Chưa phân loại',
        unit_price,
        quantity: sales.qty,
        revenue: sales.revenue,
        share_percent,
      })
    })

    for (const [name, sales] of salesMap.entries()) {
      if (!processedNames.has(name)) {
        const unit_price = sales.qty > 0 ? Math.round(sales.revenue / sales.qty) : 0
        const share_percent =
          total_sales_revenue > 0 ? Math.round((sales.revenue / total_sales_revenue) * 100) : 0

        all_products.push({
          product_name: name,
          category_name: 'Món khác',
          unit_price,
          quantity: sales.qty,
          revenue: sales.revenue,
          share_percent,
        })
      }
    }

    const top_high = [...all_products]
      .filter((p) => p.revenue > 0 || p.quantity > 0)
      .sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)

    const top_low = [...all_products].sort(
      (a, b) => a.revenue - b.revenue || a.quantity - b.quantity
    )

    return {
      all_products,
      top_high,
      top_low,
      total_sales_revenue,
      total_sales_quantity,
    }
  },

  async getDailySalesSheet(dateStr: string, cashierFilter?: string) {
    const startIso = new Date(`${dateStr}T00:00:00.000`).toISOString()
    const endIso = new Date(`${dateStr}T23:59:59.999`).toISOString()

    const orders = await callDb<Order[]>('getOrders', {
      status: 'PAID',
      from: startIso,
      to: endIso,
    })

    const cashiersSet = new Set<string>()
    orders.forEach((o: any) => {
      const cName = o.cashier?.name || 'Chủ quán'
      cashiersSet.add(cName)
    })

    const filteredOrders = cashierFilter && cashierFilter !== 'ALL'
      ? orders.filter((o: any) => (o.cashier?.name || 'Chủ quán') === cashierFilter)
      : orders

    const processedOrders = filteredOrders.map((o: any) => {
      const itemsList = (o.items ?? []).map((it: any) => ({
        id: it.id,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: Number(it.unit_price) || 0,
        subtotal: Number(it.subtotal) || 0,
        note: it.note,
      }))

      const totalQty = itemsList.reduce((s: number, i: any) => s + i.quantity, 0)
      const payMethod = o.payment?.method || 'CASH'

      return {
        id: o.id,
        invoice_number: o.invoice_number || `HD-${o.id.substring(0, 6).toUpperCase()}`,
        paid_at: o.paid_at || o.created_at,
        table_name: o.table?.name || 'Mang về',
        cashier_name: o.cashier?.name || 'Chủ quán',
        item_count: totalQty,
        subtotal: Number(o.subtotal) || 0,
        discount: Number(o.discount) || 0,
        total: Number(o.total) || 0,
        payment_method: payMethod,
        items: itemsList,
      }
    })

    const hourMap = new Map<string, typeof processedOrders>()
    processedOrders.forEach((ord) => {
      const d = new Date(ord.paid_at)
      const hour = d.getHours()
      const hourKey = `${String(hour).padStart(2, '0')}:00`
      const list = hourMap.get(hourKey) ?? []
      list.push(ord)
      hourMap.set(hourKey, list)
    })

    const sortedHours = Array.from(hourMap.keys()).sort((a, b) => b.localeCompare(a))

    const hour_groups = sortedHours.map((hourKey) => {
      const groupOrders = hourMap.get(hourKey)!
      const grpQty = groupOrders.reduce((s, o) => s + o.item_count, 0)
      const grpRev = groupOrders.reduce((s, o) => s + o.total, 0)
      return {
        hour_str: hourKey,
        orders: groupOrders,
        total_qty: grpQty,
        total_revenue: grpRev,
        total_payment: grpRev,
      }
    })

    const total_revenue = processedOrders.reduce((s, o) => s + o.total, 0)
    const total_items = processedOrders.reduce((s, o) => s + o.item_count, 0)

    let cash_amount = 0
    let cash_orders = 0
    let bank_amount = 0
    let bank_orders = 0

    processedOrders.forEach((o) => {
      if (o.payment_method === 'CASH') {
        cash_amount += o.total
        cash_orders += 1
      } else {
        bank_amount += o.total
        bank_orders += 1
      }
    })

    const now = new Date()
    const report_generated_at = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    return {
      date_str: dateStr,
      report_generated_at,
      branch_name: 'FuHa Cafe',
      total_orders: processedOrders.length,
      total_items,
      total_revenue,
      total_other_income: 0,
      total_tax: 0,
      total_return_fee: 0,
      total_payment: total_revenue,
      cash_amount,
      cash_orders,
      bank_amount,
      bank_orders,
      hour_groups,
      all_orders: processedOrders,
      cashiers: Array.from(cashiersSet),
    }
  },
}
