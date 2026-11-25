import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Printer,
  FileSpreadsheet,
  RotateCw,
  Search,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Banknote,
  Package,
  Receipt,
  Maximize2,
  Minimize2,
  ArrowLeftRight,
  ArrowUpDown,
  X,
  BarChart3,
  TrendingUp,
  Layers,
  Award,
  Trophy,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
} from 'lucide-react'
import { callDb } from '@/services/localDatabase'
import {
  formatCurrency,
  formatDateTime,
  normalizeProductItem,
  computeDatePreset,
  computePreviousDateRange,
  type ReportTimePreset,
} from '@/utils/helpers'
import { exportReportToCsv } from '@/utils/exportReport'
import { LoadingSpinner } from '@/components/ui'
import { useAuth } from '@/hooks/useAuth'
import type { Order, Product, Category } from '@/types'

type ActiveReportType = 'invoices' | 'products'
type ReportOrientation = 'landscape' | 'portrait'
type TimePreset = ReportTimePreset
type MainViewTab = 'analytics' | 'report_table'

interface SalesReportVerticalHorizontalProps {
  initialDateFrom?: string
  initialDateTo?: string
  isModal?: boolean
  onClose?: () => void
}

export default function SalesReportVerticalHorizontal({
  initialDateFrom,
  initialDateTo,
  isModal = false,
  onClose,
}: SalesReportVerticalHorizontalProps) {
  const { hasRole } = useAuth()
  const isEmployee = !hasRole('OWNER', 'MANAGER')

  // ── States ──────────────────────────────────────────────────────────
  const [activeView, setActiveView] = useState<MainViewTab>('analytics')
  const [reportType, setReportType] = useState<ActiveReportType>('invoices')
  const [orientation, setOrientation] = useState<ReportOrientation>('landscape')
  const [preset, setPreset] = useState<TimePreset>('today')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [printIncludeChart, setPrintIncludeChart] = useState(false)

  // Chart States
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'all_products' | 'categories' | 'timeline' | 'payment'>('all_products')
  const [productChartScope, setProductChartScope] = useState<'all' | 'top10' | 'top20' | 'low_sales'>('all')
  const [productChartSort, setProductChartSort] = useState<'revenue_desc' | 'qty_desc' | 'name_asc'>('revenue_desc')
  const [productChartCategory, setProductChartCategory] = useState<string>('ALL')
  const [productMeasure, setProductMeasure] = useState<'revenue' | 'quantity'>('revenue')
  const [includeZeroSales, setIncludeZeroSales] = useState<boolean>(true)
  const [hoveredBarKey, setHoveredBarKey] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCashier, setSelectedCashier] = useState('ALL')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'ALL' | 'CASH' | 'BANK'>('ALL')
  const [selectedCategory, setSelectedCategory] = useState('ALL')
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({})

  // Data
  const [orders, setOrders] = useState<Order[]>([])
  const [prevOrders, setPrevOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  // ── Date Presets ────────────────────────────────────────────────────
  const applyPreset = useCallback((p: TimePreset) => {
    if (p === 'custom') return
    const res = computeDatePreset(p)
    setDateFrom(res.from)
    setDateTo(res.to)
  }, [])

  useEffect(() => {
    if (initialDateFrom && initialDateTo) {
      setDateFrom(initialDateFrom)
      setDateTo(initialDateTo)
      setPreset('custom')
    } else {
      applyPreset('today')
    }
  }, [initialDateFrom, initialDateTo, applyPreset])

  // ── Load Data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (isEmployee) return
    if (!dateFrom || !dateTo) return
    setLoading(true)
    try {
      const startIso = new Date(`${dateFrom}T00:00:00.000`).toISOString()
      const endIso = new Date(`${dateTo}T23:59:59.999`).toISOString()

      const prevRange = computePreviousDateRange(preset, dateFrom, dateTo)
      const prevStartIso = new Date(`${prevRange.from}T00:00:00.000`).toISOString()
      const prevEndIso = new Date(`${prevRange.to}T23:59:59.999`).toISOString()

      const [ordersData, prevOrdersData, prodsData, catsData] = await Promise.all([
        callDb<Order[]>('getOrders', {
          status: 'PAID',
          from: startIso,
          to: endIso,
        }),
        callDb<Order[]>('getOrders', {
          status: 'PAID',
          from: prevStartIso,
          to: prevEndIso,
        }),
        callDb<Product[]>('getProducts'),
        callDb<Category[]>('getCategories'),
      ])

      setOrders(ordersData || [])
      setPrevOrders(prevOrdersData || [])
      setProducts(prodsData || [])
      setCategories(catsData || [])
    } catch (err) {
      console.error('Lỗi tải dữ liệu báo cáo bán hàng:', err)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, preset])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── List of Unique Cashiers ─────────────────────────────────────────
  const cashierList = useMemo(() => {
    const set = new Set<string>()
    orders.forEach((o) => {
      const name = o.cashier?.name || 'Chủ quán'
      set.add(name)
    })
    return Array.from(set)
  }, [orders])

  // ── Filtered Orders (Báo cáo Hóa đơn) ────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // Cashier
      if (selectedCashier !== 'ALL') {
        const cName = o.cashier?.name || 'Chủ quán'
        if (cName !== selectedCashier) return false
      }
      // Payment Method
      if (selectedPaymentMethod !== 'ALL') {
        const pMethod = o.payment?.method || 'CASH'
        if (pMethod !== selectedPaymentMethod) return false
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const inv = (o.invoice_number || '').toLowerCase()
        const tbl = (o.table?.name || 'mang về').toLowerCase()
        const cashier = (o.cashier?.name || '').toLowerCase()
        const hasItem = (o.items || []).some((it) => it.product_name.toLowerCase().includes(q))
        if (!inv.includes(q) && !tbl.includes(q) && !cashier.includes(q) && !hasItem) {
          return false
        }
      }
      return true
    })
  }, [orders, selectedCashier, selectedPaymentMethod, searchQuery])

  // ── Invoice Summary KPIs ────────────────────────────────────────────
  const invoiceSummary = useMemo(() => {
    let totalRev = 0
    let totalSubtotal = 0
    let totalDiscount = 0
    let totalItems = 0
    let cashRev = 0
    let cashCount = 0
    let bankRev = 0
    let bankCount = 0

    filteredOrders.forEach((o) => {
      const tot = Number(o.total) || 0
      const sub = Number(o.subtotal) || 0
      const dis = Number(o.discount) || 0
      const itemsCount = (o.items || []).reduce((sum, it) => sum + it.quantity, 0)

      totalRev += tot
      totalSubtotal += sub
      totalDiscount += dis
      totalItems += itemsCount

      const method = o.payment?.method || 'CASH'
      if (method === 'CASH') {
        cashRev += tot
        cashCount += 1
      } else {
        bankRev += tot
        bankCount += 1
      }
    })

    const orderCount = filteredOrders.length
    const aov = orderCount > 0 ? Math.round(totalRev / orderCount) : 0

    return {
      orderCount,
      totalRev,
      totalSubtotal,
      totalDiscount,
      totalItems,
      cashRev,
      cashCount,
      bankRev,
      bankCount,
      aov,
    }
  }, [filteredOrders])

  // ── Previous Period Summary & Growth Comparison ────────────────────
  const prevSummary = useMemo(() => {
    let rev = 0
    let items = 0
    prevOrders.forEach((o) => {
      rev += Number(o.total) || 0
      ;(o.items || []).forEach((it) => {
        items += it.quantity
      })
    })
    return {
      revenue: rev,
      orders: prevOrders.length,
      items,
    }
  }, [prevOrders])

  const growth = useMemo(() => {
    const curRev = invoiceSummary.totalRev
    const curOrders = invoiceSummary.orderCount
    const curItems = invoiceSummary.totalItems

    const revDiff = curRev - prevSummary.revenue
    const revPct = prevSummary.revenue > 0 ? Math.round((revDiff / prevSummary.revenue) * 1000) / 10 : 0

    const ordersDiff = curOrders - prevSummary.orders
    const ordersPct = prevSummary.orders > 0 ? Math.round((ordersDiff / prevSummary.orders) * 1000) / 10 : 0

    const itemsDiff = curItems - prevSummary.items
    const itemsPct = prevSummary.items > 0 ? Math.round((itemsDiff / prevSummary.items) * 1000) / 10 : 0

    const prevRange = computePreviousDateRange(preset, dateFrom, dateTo)

    return {
      revDiff,
      revPct,
      ordersDiff,
      ordersPct,
      itemsDiff,
      itemsPct,
      prevLabel: prevRange.label,
      prevRevenue: prevSummary.revenue,
    }
  }, [invoiceSummary, prevSummary, preset, dateFrom, dateTo])

  // ── Product Sales Aggregation (Báo cáo Hàng hóa) ────────────────────
  const productSalesList = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string
        product_id?: string
        product_name: string
        category_name: string
        unit_price: number
        quantity: number
        revenue: number
      }
    >()

    // Duyệt qua tất cả hóa đơn thỏa mãn bộ lọc thu ngân / PTTT
    filteredOrders.forEach((o) => {
      ;(o.items || []).forEach((it) => {
        const info = normalizeProductItem(it, products, categories)
        const key = info.key

        const existing = map.get(key) || {
          key,
          product_id: info.product_id,
          product_name: info.product_name,
          category_name: info.category_name,
          unit_price: info.unit_price,
          quantity: 0,
          revenue: 0,
        }

        existing.quantity += it.quantity
        existing.revenue += Number(it.subtotal) || (Number(it.unit_price) || 0) * it.quantity
        map.set(key, existing)
      })
    })

    let totalProdRev = 0
    let totalProdQty = 0
    map.forEach((val) => {
      totalProdRev += val.revenue
      totalProdQty += val.quantity
    })

    const list = Array.from(map.values()).map((p) => {
      const sharePercent = totalProdRev > 0 ? (p.revenue / totalProdRev) * 100 : 0
      return {
        ...p,
        share_percent: Math.round(sharePercent * 10) / 10,
      }
    })

    // Filter by Category
    const filtered = list.filter((p) => {
      if (selectedCategory !== 'ALL' && p.category_name !== selectedCategory) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        if (!p.product_name.toLowerCase().includes(q) && !p.category_name.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })

    // Sort by revenue desc
    filtered.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)

    return {
      items: filtered,
      totalRevenue: totalProdRev,
      totalQuantity: totalProdQty,
      itemCount: filtered.length,
      topItem: filtered[0] || null,
    }
  }, [filteredOrders, products, categories, selectedCategory, searchQuery])

  // ── Helper: Format compact number for chart columns ─────────────────
  const formatCompactNumber = (num: number) => {
    if (num === 0) return '0'
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1).replace('.0', '')}tr`
    }
    if (num >= 1000) {
      return `${Math.round(num / 1000)}k`
    }
    return `${num}`
  }

  // ── Data for Invoice Column Chart ───────────────────────────────────
  const invoiceChartData = useMemo(() => {
    const isSingleDay = dateFrom === dateTo

    if (isSingleDay) {
      // Group by hour 6 -> 23
      const hourMap = new Map<number, { revenue: number; orders: number; cash: number; bank: number }>()
      for (let h = 6; h <= 23; h++) {
        hourMap.set(h, { revenue: 0, orders: 0, cash: 0, bank: 0 })
      }

      filteredOrders.forEach((o) => {
        const dStr = o.paid_at || o.created_at
        if (!dStr) return
        const h = new Date(dStr).getHours()
        const cur = hourMap.get(h) || { revenue: 0, orders: 0, cash: 0, bank: 0 }
        const tot = Number(o.total) || 0
        cur.revenue += tot
        cur.orders += 1
        if ((o.payment?.method || 'CASH') === 'CASH') {
          cur.cash += tot
        } else {
          cur.bank += tot
        }
        hourMap.set(h, cur)
      })

      const bars = Array.from(hourMap.entries()).map(([h, val]) => ({
        key: `h-${h}`,
        label: `${h}:00`,
        fullLabel: `Khung giờ ${h}:00 - ${h + 1}:00`,
        revenue: val.revenue,
        orders: val.orders,
        cash: val.cash,
        bank: val.bank,
      }))

      const maxRev = Math.max(...bars.map((b) => b.revenue), 1)
      const maxOrders = Math.max(...bars.map((b) => b.orders), 1)

      return {
        type: 'hourly',
        title: `Doanh thu theo khung giờ (Ngày ${dateFrom})`,
        bars,
        maxRev,
        maxOrders,
      }
    } else {
      // Group by day YYYY-MM-DD
      const dayMap = new Map<string, { revenue: number; orders: number; cash: number; bank: number }>()

      filteredOrders.forEach((o) => {
        const dStr = o.paid_at || o.created_at
        if (!dStr) return
        const dayKey = dStr.substring(0, 10)
        const cur = dayMap.get(dayKey) || { revenue: 0, orders: 0, cash: 0, bank: 0 }
        const tot = Number(o.total) || 0
        cur.revenue += tot
        cur.orders += 1
        if ((o.payment?.method || 'CASH') === 'CASH') {
          cur.cash += tot
        } else {
          cur.bank += tot
        }
        dayMap.set(dayKey, cur)
      })

      const sortedKeys = Array.from(dayMap.keys()).sort((a, b) => a.localeCompare(b))
      const bars = sortedKeys.map((dayKey) => {
        const val = dayMap.get(dayKey)!
        const parts = dayKey.split('-')
        const shortLabel = parts.length === 3 ? `${parts[2]}/${parts[1]}` : dayKey
        return {
          key: `d-${dayKey}`,
          label: shortLabel,
          fullLabel: `Ngày ${shortLabel}/${parts[0]}`,
          revenue: val.revenue,
          orders: val.orders,
          cash: val.cash,
          bank: val.bank,
        }
      })

      const maxRev = Math.max(...bars.map((b) => b.revenue), 1)
      const maxOrders = Math.max(...bars.map((b) => b.orders), 1)

      return {
        type: 'daily',
        title: `Doanh thu theo từng ngày (${dateFrom} → ${dateTo})`,
        bars,
        maxRev,
        maxOrders,
      }
    }
  }, [filteredOrders, dateFrom, dateTo])

  // ── Data for Product (Drink) Column Chart (TẤT CẢ CÁC MÓN) ───────────
  const productChartData = useMemo(() => {
    // 1. Gather all items sold
    const map = new Map<string, {
      key: string
      product_id?: string
      product_name: string
      category_name: string
      unit_price: number
      quantity: number
      revenue: number
      share_percent: number
    }>()

    productSalesList.items.forEach((it) => {
      map.set(it.key, { ...it })
    })

    // 2. Include unsold menu items (0 ly) if enabled
    if (includeZeroSales && products.length > 0) {
      products.forEach((p) => {
        const info = normalizeProductItem(
          { product_id: p.id, product_name: p.name, unit_price: p.price },
          products,
          categories
        )
        if (!map.has(info.key)) {
          map.set(info.key, {
            key: info.key,
            product_id: info.product_id,
            product_name: info.product_name,
            category_name: info.category_name,
            unit_price: info.unit_price,
            quantity: 0,
            revenue: 0,
            share_percent: 0,
          })
        }
      })
    }

    let allItems = Array.from(map.values())

    // 3. Category Filter
    if (productChartCategory !== 'ALL') {
      allItems = allItems.filter((p) => p.category_name === productChartCategory)
    }

    // 4. Search Filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      allItems = allItems.filter(
        (p) => p.product_name.toLowerCase().includes(q) || p.category_name.toLowerCase().includes(q)
      )
    }

    // 5. Sorting
    if (productChartSort === 'revenue_desc') {
      allItems.sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity)
    } else if (productChartSort === 'qty_desc') {
      allItems.sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
    } else if (productChartSort === 'name_asc') {
      allItems.sort((a, b) => a.product_name.localeCompare(b.product_name, 'vi'))
    }

    // 6. Scope Filter (All vs Top 10 vs Top 20 vs Low sales)
    let displayItems = allItems
    if (productChartScope === 'top10') {
      displayItems = allItems.slice(0, 10)
    } else if (productChartScope === 'top20') {
      displayItems = allItems.slice(0, 20)
    } else if (productChartScope === 'low_sales') {
      displayItems = allItems.filter((p) => p.quantity <= 2)
    }

    const maxRev = Math.max(...displayItems.map((p) => p.revenue), 1)
    const maxQty = Math.max(...displayItems.map((p) => p.quantity), 1)

    // Category aggregation
    const catMap = new Map<string, { category_name: string; revenue: number; quantity: number }>()
    productSalesList.items.forEach((p) => {
      const cName = p.category_name || 'Khác'
      const cur = catMap.get(cName) || { category_name: cName, revenue: 0, quantity: 0 }
      cur.revenue += p.revenue
      cur.quantity += p.quantity
      catMap.set(cName, cur)
    })
    const categoriesList = Array.from(catMap.values()).sort((a, b) => b.revenue - a.revenue)
    const maxCatRev = Math.max(...categoriesList.map((c) => c.revenue), 1)
    const maxCatQty = Math.max(...categoriesList.map((c) => c.quantity), 1)

    // Statistics for managers
    const starItems = allItems.filter((p) => p.share_percent >= 15 || p.quantity >= 5)
    const lowSalesItems = allItems.filter((p) => p.quantity <= 1)
    const zeroSalesCount = allItems.filter((p) => p.quantity === 0).length

    return {
      allItems,
      displayItems,
      top10: allItems.slice(0, 10),
      totalCount: allItems.length,
      displayedCount: displayItems.length,
      maxRev,
      maxQty,
      categoriesList,
      maxCatRev,
      maxCatQty,
      starItems,
      lowSalesItems,
      zeroSalesCount,
    }
  }, [
    productSalesList,
    products,
    categories,
    includeZeroSales,
    productChartCategory,
    searchQuery,
    productChartSort,
    productChartScope,
  ])

  // ── Toggle Single Order Detail ──────────────────────────────────────
  const toggleOrder = (id: string) => {
    setExpandedOrders((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const toggleAllOrders = () => {
    const allExpanded = filteredOrders.every((o) => expandedOrders[o.id])
    const next: Record<string, boolean> = {}
    filteredOrders.forEach((o) => {
      next[o.id] = !allExpanded
    })
    setExpandedOrders(next)
  }

  // ── Actions: Print & Export ─────────────────────────────────────────
  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const subtitle = `Từ ngày: ${dateFrom} Đến ngày: ${dateTo} (Bộ lọc: ${
      reportType === 'invoices' ? 'Theo Hóa đơn' : 'Theo Hàng hóa'
    })`

    if (reportType === 'invoices') {
      const headers = [
        'STT',
        'Mã hóa đơn',
        'Thời gian',
        'Phòng / Bàn',
        'Thu ngân',
        'Chi tiết món',
        'Tổng tiền món',
        'Giảm giá',
        'Khách trả',
        'Phương thức',
        'Ghi chú',
      ]
      const rows = filteredOrders.map((o, idx) => {
        const itemsStr = (o.items || []).map((it) => `${it.product_name} (${it.quantity})`).join('; ')
        const pMethod = (o.payment?.method || 'CASH') === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'
        return [
          idx + 1,
          o.invoice_number || `HD-${o.id.slice(0, 6)}`,
          formatDateTime(o.paid_at || o.created_at),
          o.table?.name || 'Mang về',
          o.cashier?.name || 'Chủ quán',
          itemsStr,
          o.subtotal || 0,
          o.discount || 0,
          o.total || 0,
          pMethod,
          o.note || '',
        ]
      })

      const summaryRow = [
        'TỔNG CỘNG',
        `${invoiceSummary.orderCount} hóa đơn`,
        '',
        '',
        '',
        `${invoiceSummary.totalItems} món`,
        invoiceSummary.totalSubtotal,
        invoiceSummary.totalDiscount,
        invoiceSummary.totalRev,
        `TM: ${formatCurrency(invoiceSummary.cashRev)} | CK: ${formatCurrency(invoiceSummary.bankRev)}`,
        '',
      ]

      exportReportToCsv(`BaoCao_HoaDon_${dateFrom}_${dateTo}`, 'BÁO CÁO BÁN HÀNG THEO HÓA ĐƠN', subtitle, headers, rows, summaryRow)
    } else {
      const headers = ['STT', 'Tên hàng hóa / Món', 'Nhóm danh mục', 'Đơn giá niêm yết', 'Số lượng bán (SL)', 'Doanh thu thuần', 'Tỷ trọng %']
      const rows = productSalesList.items.map((p, idx) => [
        idx + 1,
        p.product_name,
        p.category_name,
        p.unit_price,
        p.quantity,
        p.revenue,
        `${p.share_percent}%`,
      ])

      const summaryRow = [
        'TỔNG CỘNG',
        `${productSalesList.itemCount} mặt hàng`,
        '',
        '',
        productSalesList.totalQuantity,
        productSalesList.totalRevenue,
        '100%',
      ]

      exportReportToCsv(`BaoCao_HangHoa_${dateFrom}_${dateTo}`, 'BÁO CÁO DOANH THU THEO HÀNG HÓA', subtitle, headers, rows, summaryRow)
    }
  }

  if (isEmployee) {
    return (
      <div style={{ padding: '3rem 2rem', textAlign: 'center', background: '#ffffff', borderRadius: 'var(--radius-xl)' }}>
        <p style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-danger, #ef4444)' }}>
          Bạn không có quyền truy cập tính năng báo cáo bán hàng!
        </p>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem', fontSize: '0.925rem' }}>
          Tính năng xem báo cáo chỉ dành cho Quản lý và Chủ quán.
        </p>
        {isModal && onClose && (
          <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: '1.25rem' }}>
            Đóng
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className={`animate-fade-in ${isFullscreen ? 'report-sheet-fullscreen' : ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        width: '100%',
      }}
    >
      {/* ── DYNAMIC INLINE PRINT CSS FOR PORTRAIT / LANDSCAPE ── */}
      <style>{`
        @page {
          size: ${orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
          margin: ${orientation === 'landscape' ? '8mm 10mm' : '10mm 12mm'};
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .report-printable-area,
          .report-printable-area * {
            visibility: visible;
          }
          .report-printable-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print-area {
            display: none !important;
          }
        }
      `}</style>

      {/* ── TOP TOOLBAR & CONTROLS (NO PRINT) ─────────────────── */}
      <div
        className="glass-card no-print-area"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: '#ffffff',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Row 1: Primary View Mode Switcher + Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          {/* Left: Primary View Switcher (Biểu đồ & Phân tích VS Báo cáo Bảng In A4) */}
          <div
            style={{
              display: 'inline-flex',
              padding: '0.25rem',
              background: '#f6f1eb',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid #e5ded5',
              gap: '0.3rem',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveView('analytics')}
              className={`btn btn-sm ${activeView === 'analytics' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                borderRadius: 'var(--radius-lg)',
                fontWeight: 700,
                fontSize: '0.86rem',
                gap: '0.5rem',
                padding: '0.45rem 1.15rem',
                boxShadow: activeView === 'analytics' ? '0 2px 8px rgba(92, 61, 46, 0.25)' : undefined,
              }}
            >
              <BarChart3 size={17} />
              Biểu Đồ & Phân Tích Quản Lý
            </button>
            <button
              type="button"
              onClick={() => setActiveView('report_table')}
              className={`btn btn-sm ${activeView === 'report_table' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                borderRadius: 'var(--radius-lg)',
                fontWeight: 700,
                fontSize: '0.86rem',
                gap: '0.5rem',
                padding: '0.45rem 1.15rem',
                boxShadow: activeView === 'report_table' ? '0 2px 8px rgba(92, 61, 46, 0.25)' : undefined,
              }}
            >
              <FileSpreadsheet size={17} />
              Báo Cáo Bảng In A4 (Ngang / Dọc)
            </button>
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {activeView === 'analytics' ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setActiveView('report_table')
                  setTimeout(() => handlePrint(), 250)
                }}
                style={{ gap: '0.4rem', fontWeight: 600 }}
                title="Chuyển sang Bảng In A4 và mở hộp thoại in ấn"
              >
                <Printer size={15} />
                In Báo Cáo A4
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handlePrint}
                style={{ gap: '0.4rem', fontWeight: 600 }}
                title="In trực tiếp theo khổ giấy đã chọn"
              >
                <Printer size={15} />
                In Báo Cáo
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleExportCsv}
              style={{ gap: '0.4rem', fontWeight: 600 }}
              title="Tải về file Excel / CSV tiếng Việt UTF-8"
            >
              <FileSpreadsheet size={15} />
              Xuất Excel (CSV)
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {isModal && onClose && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onClose}
                title="Đóng bảng báo cáo"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Date Presets & Custom Date Pickers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          {/* Preset Buttons */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginRight: '0.25rem' }}>
              Thời gian:
            </span>
            {[
              { key: 'today', label: 'Hôm nay' },
              { key: 'yesterday', label: 'Hôm qua' },
              { key: 'last7days', label: '7 ngày' },
              { key: 'thismonth', label: 'Tháng này' },
              { key: 'lastmonth', label: 'Tháng trước' },
              { key: 'thisquarter', label: 'Quý này' },
              { key: 'lastquarter', label: 'Quý trước' },
              { key: 'thisyear', label: 'Năm nay' },
              { key: 'lastyear', label: 'Năm trước' },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPreset(p.key as TimePreset)
                  applyPreset(p.key as TimePreset)
                }}
                className={`btn btn-sm ${preset === p.key ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.65rem',
                  height: '28px',
                }}
              >
                {p.label}
              </button>
            ))}

            {/* Quick dropdown for specific quarters Q1, Q2, Q3, Q4 */}
            <select
              className="select"
              value={['q1', 'q2', 'q3', 'q4'].includes(preset) ? preset : ''}
              onChange={(e) => {
                if (e.target.value) {
                  const p = e.target.value as TimePreset
                  setPreset(p)
                  applyPreset(p)
                }
              }}
              style={{
                fontSize: '0.75rem',
                height: '28px',
                padding: '0.2rem 1.6rem 0.2rem 0.5rem',
                width: 'auto',
                fontWeight: ['q1', 'q2', 'q3', 'q4'].includes(preset) ? 700 : 500,
                color: ['q1', 'q2', 'q3', 'q4'].includes(preset) ? 'var(--color-coffee-700)' : 'var(--color-text-secondary)',
                borderColor: ['q1', 'q2', 'q3', 'q4'].includes(preset) ? 'var(--color-coffee-500)' : undefined,
                background: ['q1', 'q2', 'q3', 'q4'].includes(preset) ? 'var(--color-coffee-50)' : undefined,
              }}
            >
              <option value="" disabled>Chọn Quý (Q1 - Q4)...</option>
              <option value="q1">Quý 1 (T1 - T3)</option>
              <option value="q2">Quý 2 (T4 - T6)</option>
              <option value="q3">Quý 3 (T7 - T9)</option>
              <option value="q4">Quý 4 (T10 - T12)</option>
            </select>
          </div>

          {/* Custom Date Pickers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Từ:</span>
              <input
                type="date"
                className="input"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value)
                  setPreset('custom')
                }}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: '30px', width: '135px' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Đến:</span>
              <input
                type="date"
                className="input"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setPreset('custom')
                }}
                style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem', height: '30px', width: '135px' }}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={loadData}
              title="Tải lại dữ liệu"
              style={{ height: '30px', padding: '0 0.6rem' }}
            >
              <RotateCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Row 3: Sub-filters (Thu ngân, PTTT / Nhóm món, Tìm kiếm) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          {/* Dropdown Filters */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Lọc thu ngân */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Thu ngân:</span>
              <select
                className="select"
                value={selectedCashier}
                onChange={(e) => setSelectedCashier(e.target.value)}
                style={{ fontSize: '0.8rem', padding: '0.25rem 1.75rem 0.25rem 0.6rem', height: '30px', width: 'auto' }}
              >
                <option value="ALL">Tất cả thu ngân</option>
                {cashierList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Nếu ở tab Hóa đơn: Lọc phương thức thanh toán */}
            {reportType === 'invoices' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>PTTT:</span>
                <select
                  className="select"
                  value={selectedPaymentMethod}
                  onChange={(e) => setSelectedPaymentMethod(e.target.value as any)}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 1.75rem 0.25rem 0.6rem', height: '30px', width: 'auto' }}
                >
                  <option value="ALL">Tất cả hình thức</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="BANK">Chuyển khoản / QR</option>
                </select>
              </div>
            )}

            {/* Nếu ở tab Hàng hóa: Lọc danh mục */}
            {reportType === 'products' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Nhóm:</span>
                <select
                  className="select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  style={{ fontSize: '0.8rem', padding: '0.25rem 1.75rem 0.25rem 0.6rem', height: '30px', width: 'auto' }}
                >
                  <option value="ALL">Tất cả nhóm món</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '260px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '0.65rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-text-muted)',
              }}
            />
            <input
              type="text"
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={reportType === 'invoices' ? 'Tìm mã HĐ, tên bàn, món...' : 'Tìm tên món, danh mục...'}
              style={{
                fontSize: '0.8rem',
                padding: '0.25rem 0.5rem 0.25rem 2rem',
                height: '30px',
                width: '100%',
              }}
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          VIEW MODE 1: BIỂU ĐỒ & PHÂN TÍCH QUẢN LÝ (ANALYTICS DASHBOARD)
         ══════════════════════════════════════════════════════════════ */}
      {activeView === 'analytics' && (
        <div className="no-print-area" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Executive Growth KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.85rem',
            }}
          >
            {/* KPI 1: Doanh thu thực thu & Tăng trưởng */}
            <div className="stat-card" style={{ padding: '1rem 1.25rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
                  TỔNG THỰC THU
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    background: growth.revPct >= 0 ? '#dcfce7' : '#fee2e2',
                    color: growth.revPct >= 0 ? '#15803d' : '#b91c1c',
                  }}
                  title={`So với ${growth.prevLabel}: ${formatCurrency(growth.prevRevenue)}`}
                >
                  {growth.revPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {growth.revPct >= 0 ? `+${growth.revPct}%` : `${growth.revPct}%`}
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-coffee-700)', marginTop: '0.35rem' }}>
                {formatCurrency(invoiceSummary.totalRev)}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                Kỳ trước ({growth.prevLabel}): <strong>{formatCurrency(growth.prevRevenue)}</strong>
              </div>
            </div>

            {/* KPI 2: Số lượng hóa đơn & Giá trị TB */}
            <div className="stat-card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
                  LƯỢNG HÓA ĐƠN
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    background: growth.ordersPct >= 0 ? '#dcfce7' : '#fee2e2',
                    color: growth.ordersPct >= 0 ? '#15803d' : '#b91c1c',
                  }}
                >
                  {growth.ordersPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {growth.ordersPct >= 0 ? `+${growth.ordersPct}%` : `${growth.ordersPct}%`}
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '0.35rem' }}>
                {invoiceSummary.orderCount} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>đơn</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                TB/HĐ (AOV): <strong style={{ color: 'var(--color-coffee-600)' }}>{formatCurrency(invoiceSummary.aov)}</strong>
              </div>
            </div>

            {/* KPI 3: Tổng số ly/món bán */}
            <div className="stat-card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
                  SỐ LY / MÓN BÁN
                </span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-sm)',
                    background: growth.itemsPct >= 0 ? '#dcfce7' : '#fee2e2',
                    color: growth.itemsPct >= 0 ? '#15803d' : '#b91c1c',
                  }}
                >
                  {growth.itemsPct >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {growth.itemsPct >= 0 ? `+${growth.itemsPct}%` : `${growth.itemsPct}%`}
                </span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-coffee-500)', marginTop: '0.35rem' }}>
                {invoiceSummary.totalItems} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>ly</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                Tổng số món trong menu: <strong>{productChartData.totalCount} món</strong>
              </div>
            </div>

            {/* KPI 4: Cơ cấu dòng tiền */}
            <div className="stat-card" style={{ padding: '1rem 1.25rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 700, letterSpacing: '0.5px' }}>
                DÒNG TIỀN MẶT VS CHUYỂN KHOẢN
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-success)' }}>
                  {invoiceSummary.totalRev > 0 ? `${Math.round((invoiceSummary.cashRev / invoiceSummary.totalRev) * 100)}%` : '0%'}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>Tiền mặt</span>
                <span style={{ color: 'var(--color-border)', margin: '0 0.2rem' }}>|</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-info)' }}>
                  {invoiceSummary.totalRev > 0 ? `${Math.round((invoiceSummary.bankRev / invoiceSummary.totalRev) * 100)}%` : '0%'}
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>CK/QR</span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                TM: {formatCurrency(invoiceSummary.cashRev)} • CK: {formatCurrency(invoiceSummary.bankRev)}
              </div>
            </div>
          </div>

          {/* Manager Strategic Insights Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '0.85rem',
            }}
          >
            {/* Card: Món Ngôi Sao (Best-Seller) */}
            <div
              style={{
                background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius-lg)',
                padding: '0.9rem 1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#f59e0b',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Trophy size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase' }}>
                  Món Ngôi Sao Bán Chạy Nhất
                </div>
                <div
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 800,
                    color: '#78350f',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    marginTop: '0.1rem',
                  }}
                  title={productSalesList.topItem?.product_name || 'Chưa có'}
                >
                  {productSalesList.topItem?.product_name || 'Chưa có'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: '0.15rem' }}>
                  {productSalesList.topItem
                    ? `${productSalesList.topItem.quantity} ly • ${formatCurrency(productSalesList.topItem.revenue)} (${productSalesList.topItem.share_percent}% tổng DT)`
                    : 'Chưa phát sinh'}
                </div>
              </div>
            </div>

            {/* Card: Cảnh Báo Món Bán Chậm / 0 Ly */}
            <div
              style={{
                background: 'linear-gradient(135deg, #fff7ed 0%, #ffedd5 100%)',
                border: '1px solid #fed7aa',
                borderRadius: 'var(--radius-lg)',
                padding: '0.9rem 1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#ea580c',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <AlertTriangle size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#9a3412', textTransform: 'uppercase' }}>
                  Cảnh Báo Món Bán Chậm & 0 Ly
                </div>
                <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#7c2d12', marginTop: '0.1rem' }}>
                  {productChartData.zeroSalesCount} món chưa bán được ly nào
                </div>
                <div style={{ fontSize: '0.74rem', color: '#c2410c', marginTop: '0.15rem' }}>
                  {productChartData.lowSalesItems.length} món bán ≤ 1 ly •{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyticsSubTab('all_products')
                      setProductChartScope('low_sales')
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      textDecoration: 'underline',
                      fontWeight: 700,
                      color: '#9a3412',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Xem biểu đồ lọc
                  </button>
                </div>
              </div>
            </div>

            {/* Card: Khung Giờ Cao Điểm */}
            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-lg)',
                padding: '0.9rem 1.15rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}
            >
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: '#16a34a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Clock size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>
                  Khung Giờ / Thời Điểm Cao Điểm
                </div>
                {(() => {
                  const peak = invoiceChartData.bars.find((b) => b.revenue > 0 && b.revenue === invoiceChartData.maxRev)
                  return (
                    <>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#14532d', marginTop: '0.1rem' }}>
                        {peak ? peak.fullLabel : 'Chưa xác định'}
                      </div>
                      <div style={{ fontSize: '0.74rem', color: '#15803d', marginTop: '0.15rem' }}>
                        {peak ? `${formatCurrency(peak.revenue)} • ${peak.orders} đơn hàng` : 'Chưa có giao dịch'}
                      </div>
                    </>
                  )
                })()}
              </div>
            </div>
          </div>

          {/* Visual Analytics Main Card Container */}
          <div
            className="glass-card"
            style={{
              padding: '1.25rem 1.5rem',
              background: '#ffffff',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {/* Analytics Navigation Sub-Tabs */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                borderBottom: '1px solid var(--color-border)',
                paddingBottom: '0.85rem',
              }}
            >
              {/* Tab Selector */}
              <div
                style={{
                  display: 'inline-flex',
                  padding: '0.25rem',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-xl)',
                  border: '1px solid var(--color-border)',
                  gap: '0.25rem',
                }}
              >
                <button
                  type="button"
                  onClick={() => setAnalyticsSubTab('all_products')}
                  className={`btn btn-sm ${analyticsSubTab === 'all_products' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.83rem', gap: '0.4rem', padding: '0.4rem 0.95rem' }}
                >
                  <Award size={15} />
                  Tất Cả Các Món ({productChartData.totalCount})
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsSubTab('categories')}
                  className={`btn btn-sm ${analyticsSubTab === 'categories' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.83rem', gap: '0.4rem', padding: '0.4rem 0.95rem' }}
                >
                  <Layers size={15} />
                  Cơ Cấu Nhóm Món ({productChartData.categoriesList.length})
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsSubTab('timeline')}
                  className={`btn btn-sm ${analyticsSubTab === 'timeline' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.83rem', gap: '0.4rem', padding: '0.4rem 0.95rem' }}
                >
                  <TrendingUp size={15} />
                  Xu Hướng Doanh Thu
                </button>
                <button
                  type="button"
                  onClick={() => setAnalyticsSubTab('payment')}
                  className={`btn btn-sm ${analyticsSubTab === 'payment' ? 'btn-primary' : 'btn-ghost'}`}
                  style={{ borderRadius: 'var(--radius-lg)', fontWeight: 700, fontSize: '0.83rem', gap: '0.4rem', padding: '0.4rem 0.95rem' }}
                >
                  <CreditCard size={15} />
                  Dòng Tiền & PTTT
                </button>
              </div>

              {/* Quick switch to A4 Printable Table */}
              <button
                type="button"
                onClick={() => setActiveView('report_table')}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.8rem', gap: '0.4rem', fontWeight: 600 }}
              >
                <FileSpreadsheet size={14} />
                Xem Báo Cáo Bảng In A4
              </button>
            </div>

            {/* ── SUB-TAB 1: TẤT CẢ CÁC MÓN (ALL PRODUCTS COLUMN CHART) ── */}
            {analyticsSubTab === 'all_products' && (
              <div>
                {/* Secondary Controls Bar: Scope, Measure, Sort, Category, Zero-Sales Toggle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  {/* Left: Scope Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Phạm vi:</span>
                    {[
                      { key: 'all', label: `Tất cả món (${productChartData.totalCount})` },
                      { key: 'top10', label: 'Top 10' },
                      { key: 'top20', label: 'Top 20' },
                      { key: 'low_sales', label: 'Bán chậm (≤2 ly)' },
                    ].map((sc) => (
                      <button
                        key={sc.key}
                        type="button"
                        onClick={() => setProductChartScope(sc.key as any)}
                        className={`btn btn-sm ${productChartScope === sc.key ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ fontSize: '0.75rem', height: '28px', padding: '0.2rem 0.65rem' }}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>

                  {/* Right: Measure, Sort, Category Filter, Zero Sales Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    {/* Measure: VNĐ vs Số Ly */}
                    <div
                      style={{
                        display: 'inline-flex',
                        padding: '0.15rem',
                        background: 'var(--color-surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setProductMeasure('revenue')}
                        className={`btn btn-sm ${productMeasure === 'revenue' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '0.72rem', height: '24px', padding: '0.15rem 0.55rem' }}
                      >
                        VNĐ
                      </button>
                      <button
                        type="button"
                        onClick={() => setProductMeasure('quantity')}
                        className={`btn btn-sm ${productMeasure === 'quantity' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ fontSize: '0.72rem', height: '24px', padding: '0.15rem 0.55rem' }}
                      >
                        Số Ly
                      </button>
                    </div>

                    {/* Sort */}
                    <select
                      className="select"
                      value={productChartSort}
                      onChange={(e) => setProductChartSort(e.target.value as any)}
                      style={{ fontSize: '0.75rem', height: '28px', padding: '0.15rem 1.6rem 0.15rem 0.5rem', width: 'auto' }}
                    >
                      <option value="revenue_desc">Sắp xếp: Doanh thu ↓</option>
                      <option value="qty_desc">Sắp xếp: Số ly ↓</option>
                      <option value="name_asc">Sắp xếp: Tên A → Z</option>
                    </select>

                    {/* Lọc danh mục */}
                    <select
                      className="select"
                      value={productChartCategory}
                      onChange={(e) => setProductChartCategory(e.target.value)}
                      style={{ fontSize: '0.75rem', height: '28px', padding: '0.15rem 1.6rem 0.15rem 0.5rem', width: 'auto' }}
                    >
                      <option value="ALL">Tất cả nhóm</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    {/* Checkbox 0 ly */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={includeZeroSales}
                        onChange={(e) => setIncludeZeroSales(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      Hiện cả món 0 ly
                    </label>
                  </div>
                </div>

                {/* Pinned Info Strip for All Products */}
                {(() => {
                  const hoveredItem = productChartData.displayItems.find(
                    (p) => `all-prod-${p.key}` === hoveredBarKey
                  )

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.85rem',
                        background: '#faf8f5',
                        border: '1px solid #e8e3dc',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '0.75rem',
                        minHeight: '38px',
                        fontSize: '0.76rem',
                        color: '#4a3b32',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {hoveredItem ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', width: '100%' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              background: '#5c3d2e',
                              color: '#ffffff',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                            }}
                          >
                            {hoveredItem.category_name}
                          </span>
                          <strong style={{ color: '#2c1e13', fontSize: '0.82rem' }}>
                            {hoveredItem.product_name}
                          </strong>
                          <span style={{ color: '#8d7b68' }}>
                            Đơn giá: <strong>{formatCurrency(hoveredItem.unit_price)}</strong>
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Đã bán: <strong style={{ color: '#5c3d2e' }}>{hoveredItem.quantity} ly</strong>
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Doanh thu: <strong style={{ color: '#5c3d2e' }}>{formatCurrency(hoveredItem.revenue)}</strong>
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Tỷ trọng: <strong>{hoveredItem.share_percent}% DT</strong>
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', color: '#7a6a5a' }}>
                          <span>
                            💡 Rê chuột vào từng cột để xem chi tiết doanh thu, số ly, đơn giá & tỷ trọng đóng góp của từng món
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#8d7b68' }}>
                            Đang hiển thị: <strong>{productChartData.displayedCount}</strong> / {productChartData.totalCount} món
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* The All-Products Scrollable Bar Chart */}
                {productChartData.displayItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Không có mặt hàng nào phù hợp với bộ lọc đã chọn.
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        gap: '0.4rem',
                        height: '260px',
                        padding: '0.85rem 0.6rem 0.5rem',
                        background: '#ffffff',
                        border: '1px solid #e8e3dc',
                        borderRadius: 'var(--radius-lg)',
                        overflowX: 'auto',
                      }}
                    >
                      {productChartData.displayItems.map((item, idx) => {
                        const isRank1 = idx === 0 && item.revenue > 0
                        const isZero = item.quantity === 0
                        const heightValue = productMeasure === 'revenue' ? item.revenue : item.quantity
                        const maxValue = productMeasure === 'revenue' ? productChartData.maxRev : productChartData.maxQty

                        const heightPercent = maxValue > 0
                          ? Math.max(Math.round((heightValue / maxValue) * 90), heightValue > 0 ? 6 : 2)
                          : 2

                        const barKey = `all-prod-${item.key}`
                        const isHovered = hoveredBarKey === barKey

                        return (
                          <div
                            key={barKey}
                            onMouseEnter={() => setHoveredBarKey(barKey)}
                            onMouseLeave={() => setHoveredBarKey(null)}
                            style={{
                              flex: productChartData.displayItems.length <= 8 ? '1 1 0' : '0 0 78px',
                              minWidth: '72px',
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              cursor: 'pointer',
                              borderRadius: '6px',
                              background: isHovered ? 'rgba(92, 61, 46, 0.05)' : 'transparent',
                              transition: 'background 0.15s ease',
                              padding: '0 2px',
                            }}
                          >
                            {/* 1. Upper Plot Zone (Value label & bar) */}
                            <div
                              style={{
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'flex-end',
                                alignItems: 'center',
                                minHeight: 0,
                                position: 'relative',
                              }}
                            >
                              {/* Value label on top of bar */}
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: isRank1 ? 700 : 600,
                                  color: isZero ? '#a8a29e' : isRank1 ? '#5c3d2e' : '#6b5e52',
                                  marginBottom: '0.2rem',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {isZero
                                  ? '0'
                                  : productMeasure === 'revenue'
                                  ? formatCompactNumber(item.revenue)
                                  : `${item.quantity} ly`}
                              </div>

                              {/* The Column Bar */}
                              <div
                                style={{
                                  width: '58%',
                                  maxWidth: '38px',
                                  height: `${heightPercent}%`,
                                  background: isHovered
                                    ? '#3e2723'
                                    : isRank1
                                    ? '#5c3d2e'
                                    : isZero
                                    ? '#e7e5e4'
                                    : '#9c826b',
                                  borderRadius: '3px 3px 0 0',
                                  transition: 'all 0.18s ease',
                                }}
                              />
                            </div>

                            {/* Base line */}
                            <div style={{ width: '100%', height: '1px', background: '#e2dcd5', margin: '0 0 0.35rem 0' }} />

                            {/* 2. Lower Label Zone (Fixed height - guarantees no text clipping!) */}
                            <div
                              style={{
                                height: '54px',
                                flexShrink: 0,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                overflow: 'hidden',
                              }}
                            >
                              {/* Clean Rank Badge */}
                              <div
                                style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  color: isRank1 ? '#5c3d2e' : isZero ? '#a8a29e' : '#8d7b68',
                                  lineHeight: 1,
                                  marginBottom: '0.15rem',
                                }}
                              >
                                #{idx + 1}
                              </div>

                              {/* Drink Name */}
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: isRank1 ? 700 : 500,
                                  color: isZero ? '#78716c' : isRank1 ? '#2c1e13' : '#4a3b32',
                                  textAlign: 'center',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  lineHeight: 1.2,
                                }}
                                title={`${item.product_name} (${formatCurrency(item.unit_price)})`}
                              >
                                {item.product_name}
                              </div>

                              {/* Category tag */}
                              <div
                                style={{
                                  fontSize: '0.58rem',
                                  color: '#a89d94',
                                  textAlign: 'center',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginTop: '0.1rem',
                                  lineHeight: 1.15,
                                }}
                              >
                                {item.category_name}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Legend / Guidance Strip */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                        marginTop: '0.5rem',
                        fontSize: '0.72rem',
                        color: '#8d7b68',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#5c3d2e' }} />
                          Top 1 cao nhất
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#9c826b' }} />
                          Món có doanh số
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '2px', background: '#e7e5e4' }} />
                          Món 0 ly (chưa bán)
                        </span>
                      </div>
                      <div>
                        * Cuộn ngang để xem tất cả các món trong quán • Rê chuột vào từng cột để xem chi tiết
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SUB-TAB 2: CƠ CẤU NHÓM MÓN (CATEGORIES COLUMN CHART) ── */}
            {analyticsSubTab === 'categories' && (
              <div>
                {/* Secondary Controls Bar */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginBottom: '0.85rem',
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    Cơ cấu đóng góp doanh thu theo từng Nhóm danh mục
                  </div>
                  <div
                    style={{
                      display: 'inline-flex',
                      padding: '0.15rem',
                      background: 'var(--color-surface)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setProductMeasure('revenue')}
                      className={`btn btn-sm ${productMeasure === 'revenue' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: '0.72rem', height: '24px', padding: '0.15rem 0.55rem' }}
                    >
                      VNĐ
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductMeasure('quantity')}
                      className={`btn btn-sm ${productMeasure === 'quantity' ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ fontSize: '0.72rem', height: '24px', padding: '0.15rem 0.55rem' }}
                    >
                      Số Ly
                    </button>
                  </div>
                </div>

                {/* Pinned Info Strip for Categories */}
                {(() => {
                  const hoveredCat = productChartData.categoriesList.find(
                    (c) => `cat-${c.category_name}` === hoveredBarKey
                  )
                  const totalRevAll = productSalesList.totalRevenue || 1
                  const hoveredCatShare = hoveredCat ? Math.round((hoveredCat.revenue / totalRevAll) * 100) : 0

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.85rem',
                        background: '#faf8f5',
                        border: '1px solid #e8e3dc',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '0.75rem',
                        minHeight: '38px',
                        fontSize: '0.76rem',
                        color: '#4a3b32',
                      }}
                    >
                      {hoveredCat ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap', width: '100%' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.75rem', background: '#5c3d2e', color: '#ffffff', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                            {hoveredCat.category_name}
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Doanh thu: <strong style={{ color: '#5c3d2e' }}>{formatCurrency(hoveredCat.revenue)}</strong>
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Số lượng: <strong style={{ color: '#2c1e13' }}>{hoveredCat.quantity} ly</strong>
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Chiếm: <strong style={{ color: '#5c3d2e' }}>{hoveredCatShare}%</strong> tổng doanh thu
                          </span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', color: '#7a6a5a' }}>
                          <span>💡 Rê chuột vào từng nhóm để xem chi tiết doanh thu & tỷ trọng % đóng góp</span>
                          <span style={{ fontSize: '0.72rem', color: '#8d7b68' }}>
                            Tổng số nhóm: <strong>{productChartData.categoriesList.length}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Category Bars */}
                {productChartData.categoriesList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Chưa có phát sinh dữ liệu theo nhóm.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      gap: '0.5rem',
                      height: '240px',
                      padding: '0.85rem 0.75rem 0.5rem',
                      background: '#ffffff',
                      border: '1px solid #e8e3dc',
                      borderRadius: 'var(--radius-lg)',
                      overflowX: 'auto',
                    }}
                  >
                    {productChartData.categoriesList.map((cat, idx) => {
                      const isTopCat = idx === 0 && cat.revenue > 0
                      const heightValue = productMeasure === 'revenue' ? cat.revenue : cat.quantity
                      const maxValue = productMeasure === 'revenue' ? productChartData.maxCatRev : productChartData.maxCatQty
                      const heightPercent = maxValue > 0
                        ? Math.max(Math.round((heightValue / maxValue) * 90), heightValue > 0 ? 6 : 2)
                        : 2

                      const barKey = `cat-${cat.category_name}`
                      const isHovered = hoveredBarKey === barKey
                      const sharePct = productSalesList.totalRevenue > 0
                        ? Math.round((cat.revenue / productSalesList.totalRevenue) * 100)
                        : 0

                      return (
                        <div
                          key={barKey}
                          onMouseEnter={() => setHoveredBarKey(barKey)}
                          onMouseLeave={() => setHoveredBarKey(null)}
                          style={{
                            flex: productChartData.categoriesList.length <= 6 ? '1 1 0' : '0 0 95px',
                            minWidth: '85px',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            background: isHovered ? 'rgba(92, 61, 46, 0.05)' : 'transparent',
                            transition: 'background 0.15s ease',
                            padding: '0 2px',
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              minHeight: 0,
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.67rem',
                                fontWeight: isTopCat ? 700 : 600,
                                color: isTopCat ? '#5c3d2e' : '#6b5e52',
                                marginBottom: '0.2rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {productMeasure === 'revenue' ? formatCompactNumber(cat.revenue) : `${cat.quantity} ly`}
                            </div>
                            <div
                              style={{
                                width: '55%',
                                maxWidth: '42px',
                                height: `${heightPercent}%`,
                                background: isHovered ? '#3e2723' : isTopCat ? '#5c3d2e' : '#9c826b',
                                borderRadius: '3px 3px 0 0',
                                transition: 'all 0.18s ease',
                              }}
                            />
                          </div>

                          <div style={{ width: '100%', height: '1px', background: '#e2dcd5', margin: '0 0 0.35rem 0' }} />

                          <div
                            style={{
                              height: '52px',
                              flexShrink: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: isTopCat ? 700 : 600,
                                color: isTopCat ? '#2c1e13' : '#4a3b32',
                                textAlign: 'center',
                                width: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.25,
                              }}
                              title={cat.category_name}
                            >
                              {cat.category_name}
                            </div>
                            <div style={{ fontSize: '0.62rem', color: '#8d7b68', marginTop: '0.15rem' }}>
                              {sharePct}% DT
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── SUB-TAB 3: XU HƯỚNG DOANH THU (TIMELINE COLUMN CHART) ── */}
            {analyticsSubTab === 'timeline' && (
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                  {invoiceChartData.title}
                </div>

                {/* Pinned Info Strip for Timeline */}
                {(() => {
                  const hoveredBar = invoiceChartData.bars.find((b) => b.key === hoveredBarKey)
                  const peakBar = invoiceChartData.bars.find((b) => b.revenue > 0 && b.revenue === invoiceChartData.maxRev)

                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.85rem',
                        background: '#faf8f5',
                        border: '1px solid #e8e3dc',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: '0.75rem',
                        minHeight: '38px',
                        fontSize: '0.76rem',
                        color: '#4a3b32',
                      }}
                    >
                      {hoveredBar ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', width: '100%' }}>
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              background: hoveredBar.revenue === invoiceChartData.maxRev ? '#5c3d2e' : '#8d7b68',
                              color: '#ffffff',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                            }}
                          >
                            {hoveredBar.label}
                          </span>
                          <span style={{ fontWeight: 600, color: '#2c1e13' }}>{hoveredBar.fullLabel}</span>
                          <span style={{ color: '#8d7b68' }}>
                            Doanh thu: <strong style={{ color: '#5c3d2e' }}>{formatCurrency(hoveredBar.revenue)}</strong>
                          </span>
                          <span style={{ color: '#8d7b68' }}>
                            Hóa đơn: <strong style={{ color: '#2c1e13' }}>{hoveredBar.orders} đơn</strong>
                          </span>
                          {hoveredBar.revenue > 0 && (
                            <>
                              <span style={{ color: '#8d7b68' }}>
                                Tiền mặt: <strong>{formatCurrency(hoveredBar.cash)}</strong>
                              </span>
                              <span style={{ color: '#8d7b68' }}>
                                Chuyển khoản: <strong>{formatCurrency(hoveredBar.bank)}</strong>
                              </span>
                            </>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', color: '#7a6a5a' }}>
                          <span>💡 Rê chuột vào từng cột để xem chi tiết doanh thu, số đơn & hình thức thanh toán</span>
                          {peakBar && (
                            <span style={{ fontSize: '0.72rem', color: '#8d7b68' }}>
                              Cao điểm nhất: <strong>{peakBar.label}</strong> ({formatCurrency(peakBar.revenue)} - {peakBar.orders} đơn)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Timeline Bars */}
                {invoiceChartData.bars.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                    Không có dữ liệu trong khoảng thời gian này.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      gap: '0.45rem',
                      height: '240px',
                      padding: '0.75rem 0.5rem 0.5rem',
                      background: '#ffffff',
                      border: '1px solid #e8e3dc',
                      borderRadius: 'var(--radius-lg)',
                      overflowX: 'auto',
                    }}
                  >
                    {invoiceChartData.bars.map((bar) => {
                      const isPeak = bar.revenue > 0 && bar.revenue === invoiceChartData.maxRev
                      const heightPercent = invoiceChartData.maxRev > 0
                        ? Math.max(Math.round((bar.revenue / invoiceChartData.maxRev) * 90), bar.revenue > 0 ? 6 : 2)
                        : 2
                      const isHovered = hoveredBarKey === bar.key

                      return (
                        <div
                          key={bar.key}
                          onMouseEnter={() => setHoveredBarKey(bar.key)}
                          onMouseLeave={() => setHoveredBarKey(null)}
                          style={{
                            flex: 1,
                            minWidth: invoiceChartData.type === 'hourly' ? '32px' : '48px',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            borderRadius: '6px',
                            background: isHovered ? 'rgba(92, 61, 46, 0.04)' : 'transparent',
                            transition: 'background 0.15s ease',
                            padding: '0 1px',
                          }}
                        >
                          <div
                            style={{
                              flex: 1,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-end',
                              alignItems: 'center',
                              minHeight: 0,
                            }}
                          >
                            {bar.revenue > 0 && (
                              <div
                                style={{
                                  fontSize: '0.67rem',
                                  fontWeight: isPeak ? 700 : 600,
                                  color: isPeak ? '#5c3d2e' : '#6b5e52',
                                  marginBottom: '0.25rem',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {formatCompactNumber(bar.revenue)}
                              </div>
                            )}
                            <div
                              style={{
                                width: '65%',
                                maxWidth: '36px',
                                height: `${heightPercent}%`,
                                background: isHovered ? '#3e2723' : isPeak ? '#5c3d2e' : bar.revenue > 0 ? '#9c826b' : '#eae6e1',
                                borderRadius: '3px 3px 0 0',
                                transition: 'all 0.18s ease',
                              }}
                            />
                          </div>

                          <div style={{ width: '100%', height: '1px', background: '#e2dcd5', margin: '0 0 0.35rem 0' }} />

                          <div
                            style={{
                              height: '46px',
                              flexShrink: 0,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: isPeak ? 700 : 500,
                                color: isPeak ? '#2c1e13' : '#6b5e52',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.25,
                              }}
                            >
                              {bar.label}
                            </div>
                            <div style={{ fontSize: '0.6rem', color: '#8d7b68', marginTop: '0.1rem' }}>
                              {bar.orders > 0 ? `${bar.orders} đơn` : ''}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── SUB-TAB 4: DÒNG TIỀN & PTTT ── */}
            {analyticsSubTab === 'payment' && (
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.75rem' }}>
                  Cơ cấu doanh thu theo phương thức thanh toán
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  {/* Cash Card */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #bbf7d0',
                      borderRadius: 'var(--radius-lg)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Banknote size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#166534' }}>Tiền Mặt (Cash)</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {invoiceSummary.cashCount} hóa đơn thanh toán
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>
                        {invoiceSummary.totalRev > 0 ? `${Math.round((invoiceSummary.cashRev / invoiceSummary.totalRev) * 100)}%` : '0%'}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#15803d' }}>
                      {formatCurrency(invoiceSummary.cashRev)}
                    </div>
                    <div style={{ height: '12px', background: '#f0fdf4', borderRadius: '6px', overflow: 'hidden', border: '1px solid #dcfce7' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${invoiceSummary.totalRev > 0 ? (invoiceSummary.cashRev / invoiceSummary.totalRev) * 100 : 0}%`,
                          background: 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)',
                          borderRadius: '6px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  {/* Bank Card */}
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #bfdbfe',
                      borderRadius: 'var(--radius-lg)',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#dbeafe', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <CreditCard size={20} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#1e40af' }}>Chuyển Khoản / QR (Bank)</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            {invoiceSummary.bankCount} hóa đơn thanh toán
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#2563eb' }}>
                        {invoiceSummary.totalRev > 0 ? `${Math.round((invoiceSummary.bankRev / invoiceSummary.totalRev) * 100)}%` : '0%'}
                      </span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1d4ed8' }}>
                      {formatCurrency(invoiceSummary.bankRev)}
                    </div>
                    <div style={{ height: '12px', background: '#eff6ff', borderRadius: '6px', overflow: 'hidden', border: '1px solid #dbeafe' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${invoiceSummary.totalRev > 0 ? (invoiceSummary.bankRev / invoiceSummary.totalRev) * 100 : 0}%`,
                          background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)',
                          borderRadius: '6px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          VIEW MODE 2: BÁO CÁO BẢNG IN A4 (NGANG / DỌC)
         ══════════════════════════════════════════════════════════════ */}
      {activeView === 'report_table' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Secondary Format Bar for Printable Report (No Print) */}
          <div
            className="no-print-area"
            style={{
              padding: '0.85rem 1.15rem',
              background: '#ffffff',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            {/* Left: Tab Switcher (Hóa đơn vs Hàng hóa) */}
            <div
              style={{
                display: 'inline-flex',
                padding: '0.2rem',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                gap: '0.2rem',
              }}
            >
              <button
                type="button"
                onClick={() => setReportType('invoices')}
                className={`btn btn-sm ${reportType === 'invoices' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.82rem', gap: '0.4rem', padding: '0.35rem 0.85rem' }}
              >
                <Receipt size={15} />
                Báo cáo theo Hóa đơn
              </button>
              <button
                type="button"
                onClick={() => setReportType('products')}
                className={`btn btn-sm ${reportType === 'products' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.82rem', gap: '0.4rem', padding: '0.35rem 0.85rem' }}
              >
                <Package size={15} />
                Báo cáo theo Hàng hóa (Món)
              </button>
            </div>

            {/* Center: Orientation Switcher (Khổ Ngang vs Khổ Dọc) */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '0.2rem',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                gap: '0.2rem',
              }}
            >
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`btn btn-sm ${orientation === 'landscape' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-md)', fontSize: '0.8rem', fontWeight: 600, gap: '0.35rem', padding: '0.35rem 0.8rem' }}
                title="Bố cục mở rộng toàn cảnh nhiều cột, in ra khổ A4 ngang"
              >
                <ArrowLeftRight size={14} />
                Khổ Ngang (Landscape A4)
              </button>
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`btn btn-sm ${orientation === 'portrait' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-md)', fontSize: '0.8rem', fontWeight: 600, gap: '0.35rem', padding: '0.35rem 0.8rem' }}
                title="Bố cục khổ dọc tiêu chuẩn, in ra khổ A4 đứng"
              >
                <ArrowUpDown size={14} />
                Khổ Dọc (Portrait A4)
              </button>
            </div>

            {/* Right: Print option checkbox */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={printIncludeChart}
                onChange={(e) => setPrintIncludeChart(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              In kèm biểu đồ tóm tắt
            </label>
          </div>

          {/* Compact Summary Cards (No Print) */}
          <div
            className="no-print-area"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '0.75rem',
            }}
          >
            {reportType === 'invoices' ? (
              <>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TỔNG THỰC THU</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-coffee-600)', marginTop: '0.2rem' }}>
                    {formatCurrency(invoiceSummary.totalRev)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>SỐ HÓA ĐƠN</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '0.2rem' }}>
                    {invoiceSummary.orderCount} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>đơn</span>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TIỀN MẶT</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.2rem' }}>
                    {formatCurrency(invoiceSummary.cashRev)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>CHUYỂN KHOẢN / QR</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-info)', marginTop: '0.2rem' }}>
                    {formatCurrency(invoiceSummary.bankRev)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TỔNG SỐ LY BÁN</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-coffee-400)', marginTop: '0.2rem' }}>
                    {invoiceSummary.totalItems} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>món</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>DOANH SỐ HÀNG HÓA</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-coffee-600)', marginTop: '0.2rem' }}>
                    {formatCurrency(productSalesList.totalRevenue)}
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TỔNG SỐ LY BÁN</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '0.2rem' }}>
                    {productSalesList.totalQuantity} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>ly</span>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>SỐ MÓN PHÁT SINH</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-coffee-400)', marginTop: '0.2rem' }}>
                    {productSalesList.itemCount} <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>món</span>
                  </div>
                </div>
                <div className="stat-card" style={{ padding: '0.75rem 1rem' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>TB / LY MÓN</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-info)', marginTop: '0.2rem' }}>
                    {productSalesList.totalQuantity > 0 ? formatCurrency(Math.round(productSalesList.totalRevenue / productSalesList.totalQuantity)) : '0 đ'}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── MAIN REPORT SHEET CONTAINER (PRINTABLE AREA) ─────── */}
          <div
            className="report-printable-area"
            style={{
              background: '#ffffff',
              border: '1px solid var(--color-border)',
              borderRadius: isFullscreen ? 0 : 'var(--radius-xl)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
              overflow: 'hidden',
              width: '100%',
              maxWidth: orientation === 'portrait' ? '920px' : '100%',
              margin: orientation === 'portrait' ? '0 auto' : '0',
              transition: 'all 0.2s ease',
            }}
          >
            {/* Printable Header */}
            <div
              style={{
                padding: '1.5rem 1.75rem 1rem',
                borderBottom: '2px solid var(--color-coffee-600)',
                background: 'var(--color-coffee-50)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
              }}
            >
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-coffee-700)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  FUHA CAFE — BẢNG BÁO CÁO DOANH THU BÁN HÀNG
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', marginTop: '0.25rem' }}>
                  {reportType === 'invoices'
                    ? `BÁO CÁO BÁN HÀNG THEO HÓA ĐƠN (${orientation === 'landscape' ? 'BẢNG NGANG A4' : 'BẢNG DỌC A4'})`
                    : `BÁO CÁO DOANH SỐ THEO HÀNG HÓA & MÓN (${orientation === 'landscape' ? 'BẢNG NGANG A4' : 'BẢNG DỌC A4'})`}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                  Khoảng thời gian: <strong>{dateFrom === dateTo ? `Ngày ${dateFrom}` : `Từ ${dateFrom} đến ${dateTo}`}</strong>
                  {preset !== 'custom' && preset !== 'today' && (
                    <span style={{ marginLeft: '0.4rem', color: 'var(--color-coffee-600)', fontWeight: 600 }}>
                      ({computeDatePreset(preset).label})
                    </span>
                  )}
                  {selectedCashier !== 'ALL' && ` • Thu ngân: ${selectedCashier}`}
                  {reportType === 'invoices' && selectedPaymentMethod !== 'ALL' && ` • PTTT: ${selectedPaymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}`}
                  {reportType === 'products' && selectedCategory !== 'ALL' && ` • Nhóm: ${selectedCategory}`}
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                <div>Thời gian lập: {new Date().toLocaleString('vi-VN')}</div>
                <div style={{ marginTop: '0.2rem' }}>
                  Khổ in: <strong>{orientation === 'landscape' ? 'Ngang (Landscape A4)' : 'Dọc (Portrait A4)'}</strong>
                </div>
                {reportType === 'invoices' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm no-print-area"
                    onClick={toggleAllOrders}
                    style={{ fontSize: '0.72rem', marginTop: '0.35rem', padding: '0.15rem 0.5rem' }}
                  >
                    {filteredOrders.every((o) => expandedOrders[o.id]) ? 'Thu gọn tất cả chi tiết' : 'Mở rộng chi tiết món'}
                  </button>
                )}
              </div>
            </div>

            {/* Optional Compact Printable Chart (Only shown if printIncludeChart is true) */}
            {printIncludeChart && (
              <div
                style={{
                  padding: '1rem 1.75rem',
                  borderBottom: '1px solid var(--color-border)',
                  background: '#fafbfc',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>
                  Biểu đồ tóm tắt: {reportType === 'invoices' ? invoiceChartData.title : 'Top các món bán chạy'}
                </div>
                <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.35rem', height: '110px' }}>
                  {(reportType === 'invoices' ? invoiceChartData.bars.slice(0, 15) : productChartData.top10.slice(0, 10)).map((b: any) => {
                    const rev = b.revenue || 0
                    const max = reportType === 'invoices' ? invoiceChartData.maxRev : productChartData.maxRev
                    const pct = max > 0 ? Math.max(Math.round((rev / max) * 85), rev > 0 ? 8 : 2) : 2
                    const lbl = b.label || b.product_name
                    return (
                      <div key={b.key || b.product_name} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {rev > 0 && <span style={{ fontSize: '0.6rem', color: '#6b5e52', marginBottom: '2px' }}>{formatCompactNumber(rev)}</span>}
                        <div style={{ width: '60%', maxWidth: '28px', height: `${pct}%`, background: '#5c3d2e', borderRadius: '2px 2px 0 0' }} />
                        <div style={{ width: '100%', height: '1px', background: '#ccc' }} />
                        <span style={{ fontSize: '0.58rem', color: '#666', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '45px' }}>{lbl}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Loading Spinner */}
            {loading ? (
              <div style={{ padding: '4rem', textAlign: 'center' }}>
                <LoadingSpinner size={36} />
                <div style={{ marginTop: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                  Đang tải dữ liệu báo cáo...
                </div>
              </div>
            ) : (
              <>
              <div style={{ width: '100%', overflowX: 'auto' }}>
            {/* ══════════════════════════════════════════════════════
                TYPE 1: BÁO CÁO THEO HÓA ĐƠN
               ══════════════════════════════════════════════════════ */}
            {reportType === 'invoices' && (
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
                    <th style={{ width: orientation === 'landscape' ? '120px' : '110px' }}>Mã HĐ</th>
                    <th style={{ width: orientation === 'landscape' ? '140px' : '110px' }}>Thời gian</th>
                    <th style={{ width: '100px' }}>Bàn / Nơi bán</th>
                    <th style={{ width: '110px' }}>Thu ngân</th>
                    {orientation === 'landscape' && <th>Chi tiết các món đã bán</th>}
                    <th style={{ width: '60px', textAlign: 'center' }}>SL</th>
                    <th style={{ width: '105px', textAlign: 'right' }}>Tiền hàng</th>
                    <th style={{ width: '90px', textAlign: 'right' }}>Giảm giá</th>
                    <th style={{ width: '115px', textAlign: 'right' }}>Thực thu</th>
                    <th style={{ width: '105px', textAlign: 'center' }}>PTTT</th>
                    {orientation === 'landscape' && <th style={{ width: '120px' }}>Ghi chú</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={orientation === 'landscape' ? 12 : 10} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                        Không có hóa đơn nào thỏa mãn điều kiện lọc.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((ord, idx) => {
                      const isExpanded = !!expandedOrders[ord.id]
                      const pMethod = ord.payment?.method || 'CASH'
                      const itemsCount = (ord.items || []).reduce((sum, it) => sum + it.quantity, 0)

                      return (
                        <tr
                          key={ord.id}
                          style={{
                            borderBottom: '1px solid var(--color-border-light)',
                            background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                          }}
                        >
                          <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{idx + 1}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <button
                                type="button"
                                className="no-print-area"
                                onClick={() => toggleOrder(ord.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  color: 'var(--color-coffee-600)',
                                }}
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <strong style={{ color: 'var(--color-coffee-700)' }}>
                                {ord.invoice_number || `HD-${ord.id.slice(0, 6)}`}
                              </strong>
                            </div>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            {formatDateTime(ord.paid_at || ord.created_at)}
                          </td>
                          <td>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px',
                                background: ord.table?.name ? 'var(--color-coffee-50)' : '#f1f5f9',
                                color: ord.table?.name ? 'var(--color-coffee-700)' : 'var(--color-text-secondary)',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                              }}
                            >
                              {ord.table?.name || 'Mang về'}
                            </span>
                          </td>
                          <td style={{ color: 'var(--color-text-secondary)' }}>{ord.cashier?.name || 'Chủ quán'}</td>

                          {/* Chi tiết món nếu ở chế độ Landscape */}
                          {orientation === 'landscape' && (
                            <td>
                              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                {(ord.items || []).map((it, i) => (
                                  <span key={i} style={{ marginRight: '0.4rem', whiteSpace: 'nowrap' }}>
                                    {it.product_name} <strong style={{ color: 'var(--color-coffee-600)' }}>x{it.quantity}</strong>
                                    {i < (ord.items || []).length - 1 ? ',' : ''}
                                  </span>
                                ))}
                              </div>
                              {/* Nếu bấm mở rộng thì hiện danh sách có giá và note */}
                              {isExpanded && (
                                <div
                                  style={{
                                    marginTop: '0.4rem',
                                    padding: '0.4rem 0.6rem',
                                    background: '#f8fafc',
                                    borderRadius: 'var(--radius-sm)',
                                    border: '1px dashed var(--color-border)',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  {(ord.items || []).map((it, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                                      <span>
                                        • {it.product_name} x{it.quantity}
                                        {it.note ? <em style={{ color: 'var(--color-text-muted)' }}> ({it.note})</em> : null}
                                      </span>
                                      <span>{formatCurrency(it.subtotal || (it.unit_price || 0) * it.quantity)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          )}

                          <td style={{ textAlign: 'center', fontWeight: 600 }}>{itemsCount}</td>
                          <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                            {formatCurrency(ord.subtotal || 0)}
                          </td>
                          <td style={{ textAlign: 'right', color: ord.discount ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                            {ord.discount ? `-${formatCurrency(ord.discount)}` : '0'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-coffee-600)' }}>
                            {formatCurrency(ord.total || 0)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                padding: '0.15rem 0.5rem',
                                borderRadius: '999px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: pMethod === 'CASH' ? '#dcfce7' : '#dbeafe',
                                color: pMethod === 'CASH' ? '#15803d' : '#1d4ed8',
                              }}
                            >
                              {pMethod === 'CASH' ? <Banknote size={11} /> : <CreditCard size={11} />}
                              {pMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}
                            </span>
                          </td>

                          {orientation === 'landscape' && (
                            <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              {ord.note || '--'}
                            </td>
                          )}
                        </tr>
                      )
                    })
                  )}
                </tbody>

                {/* Footer Tổng kết */}
                <tfoot>
                  <tr
                    style={{
                      background: 'var(--color-coffee-100)',
                      fontWeight: 800,
                      borderTop: '2px solid var(--color-coffee-600)',
                      borderBottom: '2px solid var(--color-coffee-600)',
                    }}
                  >
                    <td colSpan={5} style={{ padding: '0.75rem 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TỔNG CỘNG ({invoiceSummary.orderCount} HÓA ĐƠN)
                    </td>
                    {orientation === 'landscape' && (
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                        TM: {formatCurrency(invoiceSummary.cashRev)} ({invoiceSummary.cashCount} HĐ) • CK: {formatCurrency(invoiceSummary.bankRev)} ({invoiceSummary.bankCount} HĐ)
                      </td>
                    )}
                    <td style={{ textAlign: 'center', fontSize: '0.95rem' }}>{invoiceSummary.totalItems}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.9rem' }}>{formatCurrency(invoiceSummary.totalSubtotal)}</td>
                    <td style={{ textAlign: 'right', fontSize: '0.9rem', color: 'var(--color-danger)' }}>
                      -{formatCurrency(invoiceSummary.totalDiscount)}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '1.05rem', color: 'var(--color-coffee-800)' }}>
                      {formatCurrency(invoiceSummary.totalRev)}
                    </td>
                    <td colSpan={orientation === 'landscape' ? 2 : 1}></td>
                  </tr>
                </tfoot>
              </table>
            )}

            {/* ══════════════════════════════════════════════════════
                TYPE 2: BÁO CÁO THEO HÀNG HÓA / MÓN
               ══════════════════════════════════════════════════════ */}
            {reportType === 'products' && (
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ width: '45px', textAlign: 'center' }}>STT</th>
                    <th>Tên mặt hàng / Món</th>
                    <th style={{ width: '150px' }}>Nhóm danh mục</th>
                    <th style={{ width: '130px', textAlign: 'right' }}>Đơn giá niêm yết</th>
                    <th style={{ width: '110px', textAlign: 'center' }}>Số lượng bán</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>Tổng doanh thu</th>
                    <th style={{ width: '100px', textAlign: 'right' }}>Tỷ trọng %</th>
                    {orientation === 'landscape' && <th style={{ width: '180px' }}>Biểu đồ tỷ trọng</th>}
                  </tr>
                </thead>
                <tbody>
                  {productSalesList.items.length === 0 ? (
                    <tr>
                      <td colSpan={orientation === 'landscape' ? 8 : 7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
                        Không có mặt hàng nào phát sinh doanh số.
                      </td>
                    </tr>
                  ) : (
                    productSalesList.items.map((prod, idx) => (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid var(--color-border-light)',
                          background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                        }}
                      >
                        <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{prod.product_name}</div>
                        </td>
                        <td>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              background: 'var(--color-surface)',
                              fontSize: '0.78rem',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {prod.category_name}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                          {formatCurrency(prod.unit_price)}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-coffee-600)' }}>
                          {prod.quantity}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-coffee-700)' }}>
                          {formatCurrency(prod.revenue)}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                          {prod.share_percent}%
                        </td>

                        {/* Thanh phần trăm ở chế độ Landscape */}
                        {orientation === 'landscape' && (
                          <td style={{ verticalAlign: 'middle' }}>
                            <div
                              style={{
                                width: '100%',
                                height: '8px',
                                background: '#e2e8f0',
                                borderRadius: '4px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  width: `${Math.min(prod.share_percent * 2.5, 100)}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, var(--color-coffee-400), var(--color-coffee-600))',
                                  borderRadius: '4px',
                                }}
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>

                {/* Footer Tổng kết Hàng Hóa */}
                <tfoot>
                  <tr
                    style={{
                      background: 'var(--color-coffee-100)',
                      fontWeight: 800,
                      borderTop: '2px solid var(--color-coffee-600)',
                      borderBottom: '2px solid var(--color-coffee-600)',
                    }}
                  >
                    <td colSpan={4} style={{ padding: '0.75rem 1rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      TỔNG CỘNG ({productSalesList.itemCount} MẶT HÀNG)
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '1rem', color: 'var(--color-coffee-800)' }}>
                      {productSalesList.totalQuantity}
                    </td>
                    <td style={{ textAlign: 'right', fontSize: '1.05rem', color: 'var(--color-coffee-800)' }}>
                      {formatCurrency(productSalesList.totalRevenue)}
                    </td>
                    <td style={{ textAlign: 'right' }}>100%</td>
                    {orientation === 'landscape' && <td></td>}
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          </>
        )}

        {/* Printable Signature Footer (A4 Signatures) */}
        <div
          style={{
            padding: '2rem 2rem 2.5rem',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            fontSize: '0.85rem',
            textAlign: 'center',
          }}
        >
          <div style={{ width: '180px' }}>
            <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Người lập biểu</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>(Ký, họ tên)</div>
            <div style={{ height: '60px' }}></div>
            <div style={{ borderTop: '1px dotted var(--color-text-muted)', paddingTop: '4px', fontSize: '0.8rem' }}>
              {selectedCashier !== 'ALL' ? selectedCashier : 'Nhân viên thu ngân'}
            </div>
          </div>

          <div style={{ width: '180px' }}>
            <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Kế toán / Thủ quỹ</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>(Ký, họ tên)</div>
            <div style={{ height: '60px' }}></div>
            <div style={{ borderTop: '1px dotted var(--color-text-muted)', paddingTop: '4px', fontSize: '0.8rem' }}>
              ....................................
            </div>
          </div>

          <div style={{ width: '180px' }}>
            <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>Quản lý / Chủ quán</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>(Ký, đóng dấu)</div>
            <div style={{ height: '60px' }}></div>
            <div style={{ borderTop: '1px dotted var(--color-text-muted)', paddingTop: '4px', fontSize: '0.8rem' }}>
              ....................................
            </div>
          </div>
        </div>
      </div>
    </div>
  )}
    </div>
  )
}
