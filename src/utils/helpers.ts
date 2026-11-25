/**
 * Format number as Vietnamese currency (VNĐ)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)
}

/**
 * Format date to Vietnamese locale
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/**
 * Format datetime to Vietnamese locale
 */
export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Generate invoice number: INV-YYYYMMDD-NNNN
 */
export function generateInvoiceNumber(sequenceNum: number): string {
  const now = new Date()
  const dateStr = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')
  const seq = String(sequenceNum).padStart(4, '0')
  return `INV-${dateStr}-${seq}`
}

/**
 * Get today's date range (start and end of day in ISO)
 */
export function getTodayRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  }
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

/**
 * Simple class name merger
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/**
 * Chuyển chuỗi tiếng Việt có dấu thành không dấu để tìm kiếm nhanh
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/**
 * Lấy chữ cái đầu của các từ (VD: Cà phê sữa -> cps)
 */
export function getAcronym(str: string): string {
  return removeVietnameseTones(str)
    .split(/\s+/)
    .map(word => word.charAt(0))
    .join('')
}

export interface GoldenHourItem {
  hour: number
  label: string
  revenue: number
  order_count: number
  ratioVsMean: number
  percentageOfDay: number
  isOutlier: boolean
}

export interface GoldenHourAnalysis {
  isEvenDistribution: boolean
  hasOutliers: boolean
  statusLabel: 'Đều khách' | 'Có giờ vàng' | 'Chưa đủ dữ liệu'
  trafficType: 'outlier_peaks' | 'steady_peaks' | 'insufficient_data'
  message: string
  operationalAdvice: string
  peakSessionLabel: string
  peakSharePercentage: number
  goldenHours: GoldenHourItem[]
  goldenHourSet: Set<number>
  meanRevenue: number
  threshold: number
  totalRevenue: number
}

/**
 * Thuật toán phân tích doanh thu theo giờ & Đánh giá mức độ đông khách:
 * 1. Nếu có ngoại lai (Outlier): Bóc tách Top 3 khung giờ vàng đột biến (vượt ngưỡng IQR và StdDev).
 * 2. Nếu KHÔNG có ngoại lai (Đều khách): Tự động trích xuất Top 3 khung giờ cao điểm nhất (Peak Hours),
 *    tính tỷ trọng đóng góp, phân tích nhịp độ đông khách theo buổi và đưa ra đánh giá vận hành trực quan.
 */
export function calculateGoldenHourOutliers(
  hourlyList: { hour: number; label: string; revenue: number; order_count: number }[]
): GoldenHourAnalysis {
  const activeHours = hourlyList.filter((h) => h.revenue > 0)
  const totalRevenue = activeHours.reduce((s, h) => s + h.revenue, 0)

  // Nếu chưa có dữ liệu bán hàng
  if (activeHours.length === 0) {
    return {
      isEvenDistribution: true,
      hasOutliers: false,
      statusLabel: 'Chưa đủ dữ liệu',
      trafficType: 'insufficient_data',
      message: 'Chưa có dữ liệu bán hàng để phân tích',
      operationalAdvice: 'Chưa phát sinh doanh thu trong khoảng thời gian này.',
      peakSessionLabel: 'Chưa có',
      peakSharePercentage: 0,
      goldenHours: [],
      goldenHourSet: new Set(),
      meanRevenue: 0,
      threshold: 0,
      totalRevenue: 0,
    }
  }

  // 1. Phân tích doanh thu theo các buổi trong ngày (Sáng: 6-12h, Chiều: 12-18h, Tối: 18-24h)
  const sessionSales = { morning: 0, afternoon: 0, evening: 0 }
  activeHours.forEach((h) => {
    if (h.hour >= 6 && h.hour < 12) sessionSales.morning += h.revenue
    else if (h.hour >= 12 && h.hour < 18) sessionSales.afternoon += h.revenue
    else sessionSales.evening += h.revenue
  })

  let peakSessionLabel = 'Buổi Chiều'
  let maxSessionVal = sessionSales.afternoon
  if (sessionSales.evening > maxSessionVal) {
    peakSessionLabel = 'Buổi Tối'
    maxSessionVal = sessionSales.evening
  }
  if (sessionSales.morning > maxSessionVal) {
    peakSessionLabel = 'Buổi Sáng'
    maxSessionVal = sessionSales.morning
  }
  const sessionPct = totalRevenue > 0 ? Math.round((maxSessionVal / totalRevenue) * 100) : 0
  const sessionSummary = `${peakSessionLabel} (chiếm ${sessionPct}% doanh thu)`

  // 2. Nếu mới có 1 hoặc 2 giờ bán được hàng trong ngày (chưa đủ mẫu để tính ngoại lai)
  if (activeHours.length < 3) {
    const mean = Math.round(totalRevenue / activeHours.length)
    const sortedHours = [...activeHours].sort((a, b) => b.revenue - a.revenue)
    const topItems: GoldenHourItem[] = sortedHours.map((h) => ({
      hour: h.hour,
      label: h.label,
      revenue: h.revenue,
      order_count: h.order_count,
      ratioVsMean: 1,
      percentageOfDay: totalRevenue > 0 ? Math.round((h.revenue / totalRevenue) * 100) : 0,
      isOutlier: false,
    }))

    return {
      isEvenDistribution: true,
      hasOutliers: false,
      statusLabel: 'Chưa đủ dữ liệu',
      trafficType: 'insufficient_data',
      message: `Mới có ${activeHours.length} khung giờ phát sinh doanh thu.`,
      operationalAdvice: `Khách mới phát sinh trong ${activeHours.length} giờ, tập trung chủ yếu vào ${sessionSummary}.`,
      peakSessionLabel: sessionSummary,
      peakSharePercentage: 100,
      goldenHours: topItems,
      goldenHourSet: new Set(topItems.map((h) => h.hour)),
      meanRevenue: mean,
      threshold: 0,
      totalRevenue,
    }
  }

  // 3. Tính toán Thống kê: Trung bình (Mean) & Độ lệch chuẩn (StdDev)
  const revs = activeHours.map((h) => h.revenue).sort((a, b) => a - b)
  const N = revs.length
  const mean = totalRevenue / N

  const variance = revs.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / N
  const stdDev = Math.sqrt(variance)
  const cv = mean > 0 ? stdDev / mean : 0 // Hệ số phân tán

  // 4. Tính Tứ phân vị (IQR: Q1 và Q3)
  const getPercentile = (arr: number[], p: number) => {
    const idx = (arr.length - 1) * p
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    const weight = idx - lower
    return arr[lower] * (1 - weight) + arr[upper] * weight
  }

  const q1 = getPercentile(revs, 0.25)
  const q3 = getPercentile(revs, 0.75)
  const iqr = q3 - q1

  // 5. Xác định ngưỡng Ngoại Lai (Outlier Threshold)
  const iqrThreshold = iqr > 0 ? q3 + 1.2 * iqr : mean + 1.2 * stdDev
  const zThreshold = mean + 1.15 * stdDev
  const outlierThreshold = Math.max(iqrThreshold, zThreshold, mean * 1.3)

  // 6. Kiểm tra các giờ vượt ngưỡng Ngoại Lai
  const outlierCandidates = activeHours
    .filter((h) => h.revenue >= outlierThreshold)
    .sort((a, b) => b.revenue - a.revenue)

  // 7. TH1: CÓ NGOẠI LAI (Outlier Peaks)
  if (cv >= 0.22 && outlierCandidates.length > 0) {
    const top3Outliers = outlierCandidates.slice(0, 3)
    const top3Sum = top3Outliers.reduce((s, h) => s + h.revenue, 0)
    const top3Pct = totalRevenue > 0 ? Math.round((top3Sum / totalRevenue) * 100) : 0

    const items: GoldenHourItem[] = top3Outliers.map((h) => ({
      hour: h.hour,
      label: h.label,
      revenue: h.revenue,
      order_count: h.order_count,
      ratioVsMean: mean > 0 ? Number((h.revenue / mean).toFixed(1)) : 1,
      percentageOfDay: totalRevenue > 0 ? Math.round((h.revenue / totalRevenue) * 100) : 0,
      isOutlier: true,
    }))

    const top1 = items[0]
    return {
      isEvenDistribution: false,
      hasOutliers: true,
      statusLabel: 'Có giờ vàng',
      trafficType: 'outlier_peaks',
      message: `Phát hiện ${top3Outliers.length} khung giờ vàng có doanh thu đột biến cao (Outlier)`,
      operationalAdvice: `Giờ vàng đỉnh điểm: ${top1.label} (gấp ${top1.ratioVsMean} lần mức TB, chiếm ${top1.percentageOfDay}% cả ngày). Khách tập trung mạnh nhất vào ${sessionSummary}, cần bố trí ít nhất 2 nhân viên ca này.`,
      peakSessionLabel: sessionSummary,
      peakSharePercentage: top3Pct,
      goldenHours: items,
      goldenHourSet: new Set(items.map((h) => h.hour)),
      meanRevenue: Math.round(mean),
      threshold: Math.round(outlierThreshold),
      totalRevenue,
    }
  }

  // 8. TH2: KHÔNG CÓ NGOẠI LAI (Steady Peaks / Đều khách)
  // Tự động trích xuất Top 3 khung giờ cao điểm nhất để chủ quán có số liệu trực quan
  const sortedByRevenue = [...activeHours].sort((a, b) => {
    if (b.revenue !== a.revenue) return b.revenue - a.revenue
    return b.order_count - a.order_count
  })

  const top3PeakHours = sortedByRevenue.slice(0, 3)
  const top3Sum = top3PeakHours.reduce((s, h) => s + h.revenue, 0)
  const top3Pct = totalRevenue > 0 ? Math.round((top3Sum / totalRevenue) * 100) : 0

  const items: GoldenHourItem[] = top3PeakHours.map((h) => ({
    hour: h.hour,
    label: h.label,
    revenue: h.revenue,
    order_count: h.order_count,
    ratioVsMean: mean > 0 ? Number((h.revenue / mean).toFixed(1)) : 1,
    percentageOfDay: totalRevenue > 0 ? Math.round((h.revenue / totalRevenue) * 100) : 0,
    isOutlier: false,
  }))

  const top1 = items[0]
  const adviceText = top1
    ? `Khách phân bổ đều đặn, không có giờ đột biến. Khung giờ đông nhất là ${top1.label} (đạt x${top1.ratioVsMean} TB), nhộn nhịp nhất vào ${sessionSummary}. Top 3 giờ dẫn đầu đóng góp ${top3Pct}% doanh thu.`
    : 'Lượng khách và doanh thu phân bổ đồng đều giữa các khung giờ.'

  return {
    isEvenDistribution: true,
    hasOutliers: false,
    statusLabel: 'Đều khách',
    trafficType: 'steady_peaks',
    message: 'Lượng khách đều đặn trong ngày (không có khung giờ ngoại lai đột biến)',
    operationalAdvice: adviceText,
    peakSessionLabel: sessionSummary,
    peakSharePercentage: top3Pct,
    goldenHours: items,
    goldenHourSet: new Set(items.map((h) => h.hour)),
    meanRevenue: Math.round(mean),
    threshold: Math.round(outlierThreshold),
    totalRevenue,
  }
}

export interface NormalizedProductInfo {
  key: string
  product_id?: string
  product_name: string
  category_name: string
  unit_price: number
}

/**
 * Chuẩn hóa nhận diện món gốc trong báo cáo:
 * Gộp các biến thể Size (size L, size M), Topping, Ghi chú về đúng 1 món chính.
 * Ví dụ: "Cà phê bạc sỉu (+ Size L (+10.000 đ))" và "Cà phê bạc sỉu" -> chung món "Cà phê bạc sỉu".
 */
export function normalizeProductItem(
  it: {
    product_id?: string | null
    product_name?: string | null
    unit_price?: number
  },
  products: { id: string; name: string; price?: number; category_id?: string; category?: { name: string } }[] = [],
  categories: { id: string; name: string }[] = []
): NormalizedProductInfo {
  // Tạo map tra cứu danh mục nhanh
  const catMap = new Map<string, string>()
  categories.forEach((c) => catMap.set(c.id, c.name))

  // 1. Ưu tiên số 1: Khớp theo product_id chính thức từ bảng products
  if (it.product_id) {
    const matched = products.find((p) => p.id === it.product_id)
    if (matched) {
      const catName = (matched.category_id && catMap.get(matched.category_id)) || matched.category?.name || 'Khác'
      return {
        key: matched.id,
        product_id: matched.id,
        product_name: matched.name,
        category_name: catName,
        unit_price: Number(matched.price) || Number(it.unit_price) || 0,
      }
    }
  }

  // 2. Chuẩn hóa tên text nếu không có product_id hoặc product_id không khớp
  const rawName = (it.product_name || '').trim()

  // Bóc tách bỏ phần ghi chú / size trong ngoặc, ví dụ: "Cà phê bạc sỉu (+ Size L (+10.000 đ))" -> "Cà phê bạc sỉu"
  let cleaned = rawName
    .replace(/\s*\([^)]*(\([^)]*\)[^)]*)*\)?\s*$/g, '')
    .replace(/\s*\(.*$/g, '')
    .replace(/\s*[-–—]?\s*(size\s+[a-z0-9]+|size\s+lớn|size\s+vừa|size\s+nhỏ)/gi, '')
    .trim()

  if (!cleaned) cleaned = rawName

  // Hàm chuẩn hóa chuỗi tiếng Việt không dấu, thống nhất âm s/x cho bạc sỉu / bạc xỉu
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/bac\s*siu/g, 'bac xiu')
      .trim()

  const cleanNorm = norm(cleaned)

  // 3. Khớp với danh mục sản phẩm của quán
  // A. Khớp chính xác tên đã chuẩn hóa
  let matched = products.find((p) => norm(p.name) === cleanNorm)

  // B. Khớp tiền tố (ví dụ "Cà phê bạc sỉu đặc biệt" -> "Cà phê bạc sỉu")
  if (!matched) {
    matched = products.find((p) => cleanNorm.startsWith(norm(p.name)))
  }

  // C. Khớp tương đồng chuỗi dài (ví dụ "bạc xỉu" trong "Cà phê bạc sỉu")
  if (!matched) {
    matched = products.find((p) => {
      const pNorm = norm(p.name)
      return (cleanNorm.length >= 6 && pNorm.includes(cleanNorm)) || (pNorm.length >= 6 && cleanNorm.includes(pNorm))
    })
  }

  if (matched) {
    const catName = (matched.category_id && catMap.get(matched.category_id)) || matched.category?.name || 'Khác'
    return {
      key: matched.id,
      product_id: matched.id,
      product_name: matched.name,
      category_name: catName,
      unit_price: Number(matched.price) || Number(it.unit_price) || 0,
    }
  }

  // 4. Nếu không khớp món nào trong menu: Dùng tên đã bóc tách ghi chú
  return {
    key: cleanNorm || cleaned.toLowerCase(),
    product_id: undefined,
    product_name: cleaned,
    category_name: 'Khác',
    unit_price: Number(it.unit_price) || 0,
  }
}

/**
 * Chuẩn hóa các mốc thời gian báo cáo: Ngày, Tuần, Tháng, Quý, Năm & Tùy chỉnh
 */
export type ReportTimePreset =
  | 'today'
  | 'yesterday'
  | 'last7days'
  | 'last30days'
  | 'thismonth'
  | 'lastmonth'
  | 'thisquarter'
  | 'lastquarter'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'thisyear'
  | 'lastyear'
  | 'custom'

export interface DateRangeResult {
  from: string
  to: string
  label: string
}

export function computeDatePreset(
  preset: ReportTimePreset,
  customYear?: number
): DateRangeResult {
  const now = new Date()
  const year = customYear || now.getFullYear()
  const currentMonth = now.getMonth() // 0..11
  const currentQuarter = Math.floor(currentMonth / 3) + 1

  const format = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  switch (preset) {
    case 'today': {
      const s = format(now)
      return { from: s, to: s, label: 'Hôm nay' }
    }
    case 'yesterday': {
      const y = new Date(now)
      y.setDate(y.getDate() - 1)
      const s = format(y)
      return { from: s, to: s, label: 'Hôm qua' }
    }
    case 'last7days': {
      const past = new Date(now)
      past.setDate(past.getDate() - 6)
      return { from: format(past), to: format(now), label: '7 ngày qua' }
    }
    case 'last30days': {
      const past = new Date(now)
      past.setDate(past.getDate() - 29)
      return { from: format(past), to: format(now), label: '30 ngày qua' }
    }
    case 'thismonth': {
      const first = new Date(year, now.getMonth(), 1)
      const last = new Date(year, now.getMonth() + 1, 0)
      return { from: format(first), to: format(last), label: `Tháng ${now.getMonth() + 1}/${year}` }
    }
    case 'lastmonth': {
      const first = new Date(year, now.getMonth() - 1, 1)
      const last = new Date(year, now.getMonth(), 0)
      return { from: format(first), to: format(last), label: `Tháng ${first.getMonth() + 1}/${first.getFullYear()}` }
    }
    case 'thisquarter': {
      const qStartMonth = (currentQuarter - 1) * 3
      const first = new Date(year, qStartMonth, 1)
      const last = new Date(year, qStartMonth + 3, 0)
      return { from: format(first), to: format(last), label: `Quý ${currentQuarter}/${year}` }
    }
    case 'lastquarter': {
      let lqYear = year
      let lqQuarter = currentQuarter - 1
      if (lqQuarter < 1) {
        lqQuarter = 4
        lqYear = year - 1
      }
      const qStartMonth = (lqQuarter - 1) * 3
      const first = new Date(lqYear, qStartMonth, 1)
      const last = new Date(lqYear, qStartMonth + 3, 0)
      return { from: format(first), to: format(last), label: `Quý ${lqQuarter}/${lqYear}` }
    }
    case 'q1': {
      const first = new Date(year, 0, 1)
      const last = new Date(year, 3, 0)
      return { from: format(first), to: format(last), label: `Quý 1/${year} (T1 - T3)` }
    }
    case 'q2': {
      const first = new Date(year, 3, 1)
      const last = new Date(year, 6, 0)
      return { from: format(first), to: format(last), label: `Quý 2/${year} (T4 - T6)` }
    }
    case 'q3': {
      const first = new Date(year, 6, 1)
      const last = new Date(year, 9, 0)
      return { from: format(first), to: format(last), label: `Quý 3/${year} (T7 - T9)` }
    }
    case 'q4': {
      const first = new Date(year, 9, 1)
      const last = new Date(year, 12, 0)
      return { from: format(first), to: format(last), label: `Quý 4/${year} (T10 - T12)` }
    }
    case 'thisyear': {
      const first = new Date(year, 0, 1)
      const last = new Date(year, 11, 31)
      return { from: format(first), to: format(last), label: `Năm ${year}` }
    }
    case 'lastyear': {
      const lastY = year - 1
      const first = new Date(lastY, 0, 1)
      const last = new Date(lastY, 11, 31)
      return { from: format(first), to: format(last), label: `Năm ${lastY}` }
    }
    default: {
      const s = format(now)
      return { from: s, to: s, label: 'Tùy chỉnh' }
    }
  }
}

/**
 * Tính toán khoảng thời gian liền kề trước đó (Kỳ trước) để so sánh tăng trưởng
 */
export function computePreviousDateRange(
  preset: ReportTimePreset,
  currentFrom: string,
  currentTo: string
): { from: string; to: string; label: string } {
  const fromDate = new Date(currentFrom)
  const toDate = new Date(currentTo)
  const now = new Date()
  const year = now.getFullYear()

  const format = (d: Date) => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  if (preset === 'today') {
    const yest = new Date(now)
    yest.setDate(yest.getDate() - 1)
    const s = format(yest)
    return { from: s, to: s, label: 'Hôm qua' }
  }

  if (preset === 'yesterday') {
    const d2 = new Date(now)
    d2.setDate(d2.getDate() - 2)
    const s = format(d2)
    return { from: s, to: s, label: 'Hôm kia' }
  }

  if (preset === 'last7days') {
    const pastTo = new Date(now)
    pastTo.setDate(pastTo.getDate() - 7)
    const pastFrom = new Date(pastTo)
    pastFrom.setDate(pastFrom.getDate() - 6)
    return { from: format(pastFrom), to: format(pastTo), label: '7 ngày trước đó' }
  }

  if (preset === 'last30days') {
    const pastTo = new Date(now)
    pastTo.setDate(pastTo.getDate() - 30)
    const pastFrom = new Date(pastTo)
    pastFrom.setDate(pastFrom.getDate() - 29)
    return { from: format(pastFrom), to: format(pastTo), label: '30 ngày trước đó' }
  }

  if (preset === 'thismonth') {
    const prevFirst = new Date(year, now.getMonth() - 1, 1)
    const prevLast = new Date(year, now.getMonth(), 0)
    return { from: format(prevFirst), to: format(prevLast), label: `Tháng ${prevFirst.getMonth() + 1}/${prevFirst.getFullYear()}` }
  }

  if (preset === 'lastmonth') {
    const prevFirst = new Date(year, now.getMonth() - 2, 1)
    const prevLast = new Date(year, now.getMonth() - 1, 0)
    return { from: format(prevFirst), to: format(prevLast), label: `Tháng ${prevFirst.getMonth() + 1}/${prevFirst.getFullYear()}` }
  }

  if (preset === 'thisquarter' || preset === 'lastquarter' || ['q1', 'q2', 'q3', 'q4'].includes(preset)) {
    const prevFrom = new Date(fromDate.getFullYear(), fromDate.getMonth() - 3, 1)
    const prevTo = new Date(fromDate.getFullYear(), fromDate.getMonth(), 0)
    const qNum = Math.floor(prevFrom.getMonth() / 3) + 1
    return { from: format(prevFrom), to: format(prevTo), label: `Quý ${qNum}/${prevFrom.getFullYear()}` }
  }

  if (preset === 'thisyear') {
    const prevFirst = new Date(year - 1, 0, 1)
    const prevLast = new Date(year - 1, 11, 31)
    return { from: format(prevFirst), to: format(prevLast), label: `Năm ${year - 1}` }
  }

  if (preset === 'lastyear') {
    const prevFirst = new Date(year - 2, 0, 1)
    const prevLast = new Date(year - 2, 11, 31)
    return { from: format(prevFirst), to: format(prevLast), label: `Năm ${year - 2}` }
  }

  // Tùy chỉnh (custom): lùi về khoảng thời gian có số ngày tương đương
  const diffTime = Math.max(toDate.getTime() - fromDate.getTime(), 0)
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
  const prevTo = new Date(fromDate)
  prevTo.setDate(prevTo.getDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setDate(prevFrom.getDate() - diffDays + 1)
  return { from: format(prevFrom), to: format(prevTo), label: 'Kỳ liền trước' }
}





