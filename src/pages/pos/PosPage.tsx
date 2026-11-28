import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { tableService } from '@/services/tableService'
import { categoryService } from '@/services/categoryService'
import { productService } from '@/services/productService'
import { orderService } from '@/services/orderService'
import { materialService } from '@/services/materialService'
import { ToastContainer, LoadingSpinner, EmptyState, Modal } from '@/components/ui'
import { formatCurrency, matchSearchWithAcronym, removeVietnameseTones } from '@/utils/helpers'
import type { CoffeeTable, Category, Product, Order, OrderItem, CartItem, ToppingOption, ProductRecipeSummary } from '@/types'
import {
  CupSoda,
  Minus,
  Plus,
  Trash2,
  CreditCard,
  Banknote,
  X,
  ArrowLeft,
  ShoppingBag,
  Check,
  Percent,
  Printer,
  Search,
  FileText,
} from 'lucide-react'
import DailySalesReportSheet from '@/components/DailySalesReportSheet'
import { printerService } from '@/services/printerService'
import { printReceipt, printBarTicket, printAutoOnPay, type PrintableOrder } from '@/utils/printer'

type SelectedToppingItem = ToppingOption & { qty: number }

const ICE_OPTIONS = [
  '100% Đá (chuẩn)',
  '70% Đá',
  '50% Đá',
  '30% Đá',
  'Không đá',
  'Đá riêng',
]

const SUGAR_OPTIONS = [
  '100% Đường (chuẩn)',
  '70% Đường',
  '50% Đường',
  '30% Đường',
  'Không đường',
]

const MILK_OPTIONS = [
  '100% Sữa đặc (chuẩn)',
  '70% Sữa đặc',
  '50% Sữa đặc',
  '30% Sữa đặc',
  'Không sữa đặc',
]

const EXTRA_OPTIONS = [
  'Nhiều sữa',
  'Ít sữa',
  'Đậm cà phê',
  'Mang về (ly giấy)',
  'Uống tại bàn',
]



export default function PosPage() {
  const { user, profile, hasRole } = useAuth()
  const { toasts, success, error: toastError, removeToast } = useToast()

  const [tables, setTables] = useState<CoffeeTable[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // Current POS state
  const [selectedTable, setSelectedTable] = useState<CoffeeTable | null>(null)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null)
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [discount, setDiscount] = useState(0)
  const [discountMode, setDiscountMode] = useState<'VND' | 'PCT'>('VND')
  const [discountPct, setDiscountPct] = useState<number | ''>(0)
  const [showPayment, setShowPayment] = useState(false)
  const [paying, setPaying] = useState(false)
  const [payTab, setPayTab] = useState<'FULL' | 'SPLIT'>('FULL')
  const [printCustomerBill, setPrintCustomerBill] = useState(false)
  const [showMixedFull, setShowMixedFull] = useState(false)
  const [mixedCash, setMixedCash] = useState<number>(0)
  const [mixedBank, setMixedBank] = useState<number>(0)
  const [splitSelections, setSplitSelections] = useState<Record<string, number>>({})
  const [splitMethod, setSplitMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'MIXED'>('CASH')
  const [splitMixedCash, setSplitMixedCash] = useState<number>(0)
  const [splitMixedBank, setSplitMixedBank] = useState<number>(0)
  const [splitDiscount, setSplitDiscount] = useState<number>(0)

  const [openOrders, setOpenOrders] = useState<Order[]>([])
  const [productRecipes, setProductRecipes] = useState<ProductRecipeSummary[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)
  const [highlightedSearchIndex, setHighlightedSearchIndex] = useState(0)

  // Edit Item on Bill (sửa giá, thêm topping, ghi chú) Modal state
  const [editingOrderItem, setEditingOrderItem] = useState<OrderItem | null>(null)
  const [editUnitPrice, setEditUnitPrice] = useState<number>(0)
  const [editBasePrice, setEditBasePrice] = useState<number>(0)
  const [selectedIce, setSelectedIce] = useState<string>('100% Đá (chuẩn)')
  const [selectedSugar, setSelectedSugar] = useState<string>('100% Đường (chuẩn)')
  const [selectedMilk, setSelectedMilk] = useState<string>('100% Sữa đặc (chuẩn)')
  const [selectedSize, setSelectedSize] = useState<'M' | 'L'>('M')
  const [selectedToppings, setSelectedToppings] = useState<SelectedToppingItem[]>([])
  const [selectedExtras, setSelectedExtras] = useState<string[]>([])
  const [customNoteText, setCustomNoteText] = useState<string>('')
  const [editQuantity, setEditQuantity] = useState<number>(1)
  const [showDailyReportModal, setShowDailyReportModal] = useState<boolean>(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const searchDropdownRef = useRef<HTMLDivElement>(null)

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [t, c, p, openOrds, recipesSum] = await Promise.all([
        tableService.getActive(),
        categoryService.getActive(),
        productService.getActive(),
        orderService.getAll({ status: 'OPEN' }),
        materialService.getAllProductRecipesSummary().catch(() => []),
      ])
      setTables(t)
      setCategories(c)
      setProducts(p)
      setOpenOrders(openOrds)
      setProductRecipes(recipesSum)
    } catch {
      toastError('Không thể tải dữ liệu')
    } finally {
      setLoading(false)
    }
  }, [toastError])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Global Hotkeys cho Thu Ngân
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in another input (except search)
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' && target !== searchInputRef.current && target.getAttribute('type') !== 'text') {
        return
      }

      switch (e.key) {
        case 'F2':
          e.preventDefault()
          searchInputRef.current?.focus()
          break
        case 'F9':
          e.preventDefault()
          if (orderItems.length > 0) document.getElementById('btn-checkout-pay')?.click()
          break
        case 'F4':
          e.preventDefault()
          // @ts-ignore - handlePrintPreBill is defined below
          const printBtn = document.getElementById('btn-pre-bill')
          if (printBtn) printBtn.click()
          break
        case 'Escape':
          if (!showPayment && !showDailyReportModal && !editingOrderItem) {
            // @ts-ignore
            const backBtn = document.getElementById('btn-back-tables')
            if (backBtn) backBtn.click()
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [orderItems.length, showPayment, showDailyReportModal, editingOrderItem])

  // Tự động đồng bộ realtime trạng thái bàn & đơn đang mở khi ở màn hình chọn bàn
  useEffect(() => {
    if (selectedTable) return
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        Promise.all([
          tableService.getActive(),
          orderService.getAll({ status: 'OPEN' }),
        ])
          .then(([t, openOrds]) => {
            setTables(t)
            setOpenOrders(openOrds)
          })
          .catch(() => {})
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [selectedTable])

  // Select table → load or create order
  const handleSelectTable = async (table: CoffeeTable) => {
    if (table.status === 'DISABLED') return
    setSelectedTable(table)
    setActiveCategory('all')
    setSearchQuery('')
    setShowSearchDropdown(false)
    setHighlightedSearchIndex(0)

    try {
      const existing = await orderService.getOpenByTable(table.id)
      if (existing) {
        setCurrentOrder(existing)
        setOrderItems(existing.items ?? [])
        setDiscount(existing.discount)
      } else {
        // Create new order
        if (!user) return
        const newOrder = await orderService.create(table.id, user.id)
        setCurrentOrder(newOrder)
        setOrderItems([])
        setDiscount(0)
        // Refresh tables
        loadData()
      }
    } catch (err: unknown) {
      console.error('Lỗi mở order:', err)
      toastError(err instanceof Error ? `Không thể mở order: ${err.message}` : 'Không thể mở order')
    }
  }

  // Dynamic available toppings (DB products) & Size L surcharge
  const toppingCategory = categories.find((c) => c.name.toLowerCase().includes('topping'))
  const sizeLToppingProduct = products.find(
    (p) => toppingCategory && p.category_id === toppingCategory.id && p.active && /^size\s*l$/i.test(p.name.trim())
  )
  const sizeLSurcharge = sizeLToppingProduct ? sizeLToppingProduct.price : 10000

  const availableToppings: ToppingOption[] = (() => {
    return products
      .filter(
        (p) =>
          toppingCategory &&
          p.category_id === toppingCategory.id &&
          p.active &&
          !/^size\s*l$/i.test(p.name.trim())
      )
      .map((p) => ({ id: p.id, name: p.name, price: p.price }))
  })()

  // Identify drinks vs snacks
  const isDrinkCategory = (categoryId?: string) => {
    if (!categoryId) return true
    const cat = categories.find((c) => c.id === categoryId)
    if (!cat) return true
    const name = cat.name.toLowerCase()
    return !name.includes('vặt') && !name.includes('nhanh') && !name.includes('topping')
  }

  // Kiểm tra công thức món để hiển thị dòng Đường / Sữa đặc tương ứng
  const getProductSweetenerConfig = (productId?: string) => {
    const rec = productRecipes.find((r) => r.product_id === productId)
    if (!rec || rec.ingredients.length === 0) {
      return { showSugar: true, showMilk: false }
    }
    let hasSugar = false
    let hasMilk = false
    for (const ing of rec.ingredients) {
      const nameNoTone = removeVietnameseTones(ing.material_name || '')
      if (nameNoTone.includes('sua dac')) {
        hasMilk = true
      }
      if ((nameNoTone.includes('duong') && !nameNoTone.includes('khong duong')) || nameNoTone.includes('siro')) {
        hasSugar = true
      }
    }
    return { showSugar: hasSugar, showMilk: hasMilk }
  }

  // Build clean note text
  const buildNote = (
    size: 'M' | 'L',
    ice: string,
    sugar: string,
    milk: string,
    extras: string[],
    toppings: SelectedToppingItem[],
    customText: string,
    isDrink: boolean,
    showSugar: boolean,
    showMilk: boolean
  ): string => {
    const parts: string[] = []

    if (isDrink && size === 'L') {
      parts.push(`Size L (+${formatCurrency(sizeLSurcharge)})`)
    }

    if (toppings.length > 0) {
      const topStr = toppings.map((t) => `+ ${t.name} (+${formatCurrency(t.price)})`).join(', ')
      parts.push(topStr)
    }

    if (isDrink) {
      if (ice && !ice.startsWith('100% Đá')) {
        parts.push(ice)
      }
      if (showSugar && sugar && !sugar.startsWith('100% Đường')) {
        parts.push(sugar)
      }
      if (showMilk && milk && !milk.startsWith('100% Sữa đặc')) {
        parts.push(milk)
      }
    }

    if (extras.length > 0) {
      parts.push(extras.join(', '))
    }

    if (customText.trim()) {
      parts.push(customText.trim())
    }

    return parts.join(' • ')
  }

  // Open modal to edit existing item directly from the bill
  const handleOpenEditModal = (item: OrderItem) => {
    const prod = products.find((p) => p.id === item.product_id)
    const base = prod?.price ?? item.unit_price

    setEditingOrderItem(item)
    setEditBasePrice(base)
    setEditUnitPrice(item.unit_price)
    setEditQuantity(item.quantity)

    const note = item.note || ''
    const hasSizeL = /\bsize\s*l\b/i.test(note)
    const foundIce = ICE_OPTIONS.find((o) => note.includes(o)) || '100% Đá (chuẩn)'
    const foundSugar = SUGAR_OPTIONS.find((o) => note.includes(o)) || '100% Đường (chuẩn)'
    const foundMilk = MILK_OPTIONS.find((o) => note.includes(o)) || '100% Sữa đặc (chuẩn)'
    const foundExtras = EXTRA_OPTIONS.filter((e) => note.includes(e))
    const foundToppings: SelectedToppingItem[] = availableToppings
      .filter((t) => note.toLowerCase().includes(t.name.toLowerCase()))
      .map((t) => ({ ...t, qty: item.quantity }))

    setSelectedSize(hasSizeL ? 'L' : 'M')
    setSelectedIce(foundIce)
    setSelectedSugar(foundSugar)
    setSelectedMilk(foundMilk)
    setSelectedExtras(foundExtras)
    setSelectedToppings(foundToppings)

    let cleaned = note
    cleaned = cleaned.replace(/\+?\s*size\s*l\s*(\(\+[^)]+\))?/gi, '')
    ICE_OPTIONS.forEach((o) => { cleaned = cleaned.replace(o, '') })
    SUGAR_OPTIONS.forEach((o) => { cleaned = cleaned.replace(o, '') })
    MILK_OPTIONS.forEach((o) => { cleaned = cleaned.replace(o, '') })
    EXTRA_OPTIONS.forEach((o) => { cleaned = cleaned.replace(o, '') })
    availableToppings.forEach((t) => {
      cleaned = cleaned.replace(new RegExp(`\\+?\\s*${t.name}\\s*(\\(\\+[^)]+\\))?`, 'gi'), '')
    })
    cleaned = cleaned.replace(/[•|]/g, ' ').replace(/\s+/g, ' ').trim()
    setCustomNoteText(cleaned)
  }

  // Select cup size (M/L): updates selectedSize and adjusts editUnitPrice
  const handleSelectSize = (size: 'M' | 'L') => {
    if (size === selectedSize) return
    setSelectedSize(size)
    if (size === 'L') {
      setEditUnitPrice((prev) => prev + sizeLSurcharge)
    } else {
      setEditUnitPrice((prev) => Math.max(0, prev - sizeLSurcharge))
    }
  }

  // Toggle topping in edit modal: updates toppings (default qty = editQuantity) and adjusts editUnitPrice
  const toggleTopping = (top: ToppingOption) => {
    const isSelected = selectedToppings.some(
      (t) => t.name.toLowerCase() === top.name.toLowerCase()
    )
    if (isSelected) {
      setSelectedToppings(selectedToppings.filter((t) => t.name.toLowerCase() !== top.name.toLowerCase()))
      setEditUnitPrice((prev) => Math.max(0, prev - top.price))
    } else {
      setSelectedToppings([...selectedToppings, { ...top, qty: editQuantity }])
      setEditUnitPrice((prev) => prev + top.price)
    }
  }

  const updateToppingQty = (topName: string, nextQty: number) => {
    const clamped = Math.max(1, Math.min(editQuantity, nextQty))
    setSelectedToppings((prev) =>
      prev.map((t) => (t.name.toLowerCase() === topName.toLowerCase() ? { ...t, qty: clamped } : t))
    )
  }

  const updateEditQuantity = (nextQty: number) => {
    const clamped = Math.max(1, nextQty)
    const oldQty = editQuantity
    setEditQuantity(clamped)
    setSelectedToppings((prev) =>
      prev.map((t) => {
        if (t.qty === oldQty) {
          return { ...t, qty: clamped }
        }
        return { ...t, qty: Math.min(t.qty, clamped) }
      })
    )
  }

  const toggleExtra = (extra: string) => {
    if (selectedExtras.includes(extra)) {
      setSelectedExtras(selectedExtras.filter((e) => e !== extra))
    } else {
      setSelectedExtras([...selectedExtras, extra])
    }
  }

  // Save changes from modal back to order item on the bill (tự động tách dòng nếu số lượng topping < số lượng cốc)
  const handleSaveItemEdit = async () => {
    if (!editingOrderItem || !currentOrder) return

    const prod = products.find((p) => p.id === editingOrderItem.product_id)
    const isDrink = isDrinkCategory(prod?.category_id)
    const { showSugar, showMilk } = getProductSweetenerConfig(editingOrderItem.product_id)
    const sizeExtra = isDrink && selectedSize === 'L' ? sizeLSurcharge : 0

    try {
      const hasSplitToppings = editQuantity > 1 && selectedToppings.some((t) => t.qty < editQuantity)

      if (!hasSplitToppings) {
        const note = buildNote(
          selectedSize,
          selectedIce,
          selectedSugar,
          selectedMilk,
          selectedExtras,
          selectedToppings,
          customNoteText,
          isDrink,
          showSugar,
          showMilk
        )
        await orderService.updateItemDetails(
          editingOrderItem.id,
          currentOrder.id,
          note,
          editUnitPrice,
          editQuantity,
          editingOrderItem.product_name
        )
        success(`Đã cập nhật ${editingOrderItem.product_name}`)
      } else {
        // Phân bổ topping theo từng cốc và gom các cốc giống nhau thành nhóm
        const groupMap = new Map<string, { qty: number; toppings: SelectedToppingItem[] }>()
        for (let cupIdx = 0; cupIdx < editQuantity; cupIdx++) {
          const cupTops = selectedToppings.filter((t) => cupIdx < t.qty)
          const sig = cupTops.map((t) => t.name.toLowerCase()).sort().join('|')
          const existingGroup = groupMap.get(sig)
          if (existingGroup) {
            existingGroup.qty += 1
          } else {
            groupMap.set(sig, { qty: 1, toppings: cupTops })
          }
        }

        const groups = Array.from(groupMap.values())
        // Giữ phần basePrice nếu thu ngân có chỉnh tay đơn giá gốc
        const fullToppingSum = selectedToppings.reduce((s, t) => s + t.price, 0)
        const effectiveBaseWithSize = Math.max(0, editUnitPrice - fullToppingSum)

        // Nhóm đầu tiên cập nhật vào dòng hiện tại
        const first = groups[0]
        const firstPrice = effectiveBaseWithSize + first.toppings.reduce((s, t) => s + t.price, 0)
        const firstNote = buildNote(
          selectedSize,
          selectedIce,
          selectedSugar,
          selectedMilk,
          selectedExtras,
          first.toppings,
          customNoteText,
          isDrink,
          showSugar,
          showMilk
        )
        await orderService.updateItemDetails(
          editingOrderItem.id,
          currentOrder.id,
          firstNote,
          firstPrice,
          first.qty,
          editingOrderItem.product_name
        )

        // Các nhóm còn lại thêm thành dòng mới
        for (let i = 1; i < groups.length; i++) {
          const g = groups[i]
          const gPrice = effectiveBaseWithSize + g.toppings.reduce((s, t) => s + t.price, 0)
          const gNote = buildNote(
            selectedSize,
            selectedIce,
            selectedSugar,
            selectedMilk,
            selectedExtras,
            g.toppings,
            customNoteText,
            isDrink,
            showSugar,
            showMilk
          )
          await orderService.addItem(currentOrder.id, {
            product_id: editingOrderItem.product_id,
            product_name: editingOrderItem.product_name,
            unit_price: gPrice,
            quantity: g.qty,
            subtotal: gPrice * g.qty,
            note: gNote || undefined,
          })
        }

        void sizeExtra
        success(`Đã tự tách thành ${groups.length} dòng cho ${editingOrderItem.product_name}`)
      }

      const updated = await orderService.getOpenByTable(currentOrder.table_id)
      if (updated) {
        setCurrentOrder(updated)
        setOrderItems(updated.items ?? [])
      }

      setEditingOrderItem(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu món'
      toastError(msg)
    }
  }

  // Add product to order directly (standard 1 qty)
  const handleAddProduct = async (product: Product) => {
    if (!selectedTable) {
      toastError('Vui lòng bấm chọn một bàn (ở cột bên trái) trước khi chọn món!')
      return
    }
    if (!currentOrder) {
      toastError('Chưa mở được order cho bàn này, vui lòng bấm chọn lại bàn')
      return
    }
    try {
      const cartItem: CartItem = {
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: 1,
        subtotal: product.price,
      }
      await orderService.addItem(currentOrder.id, cartItem)
      // Refresh order
      const updated = await orderService.getOpenByTable(currentOrder.table_id)
      if (updated) {
        setCurrentOrder(updated)
        setOrderItems(updated.items ?? [])
      }
      // Auto reset về trạng thái ban đầu sau khi chọn món
      setSearchQuery('')
      setShowSearchDropdown(false)
      setHighlightedSearchIndex(0)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể thêm món'
      toastError(msg)
    }
  }

  // Chọn món từ thanh tìm kiếm: thêm món, auto reset và focus lại ô tìm kiếm
  const handleSelectSearchProduct = async (product: Product) => {
    await handleAddProduct(product)
    setSearchQuery('')
    setShowSearchDropdown(false)
    setHighlightedSearchIndex(0)
    setTimeout(() => {
      searchInputRef.current?.focus()
    }, 50)
  }

  // Update quantity
  const handleQtyChange = async (item: OrderItem, delta: number) => {
    if (!currentOrder) return
    const newQty = item.quantity + delta
    try {
      await orderService.updateItemQuantity(item.id, currentOrder.id, newQty)
      const updated = await orderService.getOpenByTable(currentOrder.table_id)
      if (updated) {
        setCurrentOrder(updated)
        setOrderItems(updated.items ?? [])
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? `Không thể cập nhật: ${err.message}` : 'Không thể cập nhật')
    }
  }

  // Remove item
  const handleRemoveItem = async (item: OrderItem) => {
    if (!currentOrder) return
    try {
      await orderService.removeItem(item.id, currentOrder.id)
      const updated = await orderService.getOpenByTable(currentOrder.table_id)
      if (updated) {
        setCurrentOrder(updated)
        setOrderItems(updated.items ?? [])
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? `Không thể xóa món: ${err.message}` : 'Không thể xóa món')
    }
  }

  // Set discount
  const handleSetDiscount = async (overrideAmount?: number) => {
    if (!currentOrder) return
    const amount = overrideAmount !== undefined ? overrideAmount : discount
    if (amount < 0) { toastError('Giảm giá không thể âm'); return }
    try {
      await orderService.setDiscount(currentOrder.id, amount)
      const updated = await orderService.getOpenByTable(currentOrder.table_id)
      if (updated) {
        setCurrentOrder(updated)
        setDiscount(amount)
      }
      success(`Đã áp dụng giảm giá ${formatCurrency(amount)}`)
    } catch (err: unknown) {
      toastError(err instanceof Error ? `Lỗi khi giảm giá: ${err.message}` : 'Lỗi khi giảm giá')
    }
  }

  const applyDiscountPreset = (value: number, mode: 'VND' | 'PCT') => {
    if (mode === 'PCT') {
      const amount = Math.round((subtotal * value) / 100)
      setDiscountMode('PCT')
      setDiscountPct(value)
      setDiscount(amount)
      handleSetDiscount(amount)
    } else {
      setDiscountMode('VND')
      setDiscountPct('')
      setDiscount(value)
      handleSetDiscount(value)
    }
  }

  const openPaymentModal = () => {
    const finalSubtotal = currentOrder?.subtotal ?? orderItems.reduce((s, i) => s + i.subtotal, 0)
    const finalTotal = Math.max(0, finalSubtotal - Math.max(0, discount))
    const half = Math.round(finalTotal / 2)
    setPayTab('FULL')
    setShowMixedFull(false)
    setMixedCash(half)
    setMixedBank(Math.max(0, finalTotal - half))
    setSplitSelections({})
    setSplitMethod('CASH')
    setSplitMixedCash(0)
    setSplitMixedBank(0)
    setSplitDiscount(0)
    setPrintCustomerBill(false)
    setShowPayment(true)
  }

  // Pay Full (Single method)
  const handlePay = async (method: 'CASH' | 'BANK_TRANSFER') => {
    if (!currentOrder || !user || paying) return
    setPaying(true)
    try {
      const finalSubtotal = currentOrder.subtotal ?? orderItems.reduce((s, i) => s + i.subtotal, 0)
      const finalDiscount = Math.max(0, discount)
      const finalTotal = Math.max(0, finalSubtotal - finalDiscount)

      if (finalDiscount !== (currentOrder.discount ?? 0)) {
        await orderService.setDiscount(currentOrder.id, finalDiscount)
      }

      await orderService.pay(currentOrder.id, method, finalTotal, user.id)

      const paidData: PrintableOrder = {
        invoice_number: currentOrder.invoice_number,
        table_name: selectedTable?.name ?? 'Mang về',
        cashier_name: profile?.name ?? 'Thu ngân',
        created_at: currentOrder.created_at || new Date().toISOString(),
        items: orderItems.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
          note: i.note,
        })),
        subtotal: finalSubtotal,
        discount: finalDiscount,
        total: finalTotal,
        payment_method: method,
      }

      setShowPayment(false)

      const settings = printerService.getSettings()
      printAutoOnPay(paidData, settings, printCustomerBill)

      setSelectedTable(null)
      setCurrentOrder(null)
      setOrderItems([])
      setDiscount(0)
      loadData()
      success(`Đã thanh toán ${formatCurrency(paidData.total)} (${method === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'})`)
    } catch (err: unknown) {
      console.error('Lỗi thanh toán:', err)
      toastError(err instanceof Error ? `Thanh toán thất bại: ${err.message}` : 'Thanh toán thất bại')
    } finally {
      setPaying(false)
    }
  }

  // Pay Full (Mixed: Tiền mặt + Chuyển khoản)
  const handlePayMixedFull = async () => {
    if (!currentOrder || !user || paying) return
    const finalSubtotal = currentOrder.subtotal ?? orderItems.reduce((s, i) => s + i.subtotal, 0)
    const finalDiscount = Math.max(0, discount)
    const finalTotal = Math.max(0, finalSubtotal - finalDiscount)
    const cashVal = Math.max(0, Number(mixedCash) || 0)
    const bankVal = Math.max(0, Number(mixedBank) || 0)

    if (cashVal + bankVal !== finalTotal) {
      toastError(`Tổng Tiền mặt (${formatCurrency(cashVal)}) + Chuyển khoản (${formatCurrency(bankVal)}) phải bằng ${formatCurrency(finalTotal)}`)
      return
    }

    setPaying(true)
    try {
      if (finalDiscount !== (currentOrder.discount ?? 0)) {
        await orderService.setDiscount(currentOrder.id, finalDiscount)
      }
      const paymentsPayload: { method: 'CASH' | 'BANK_TRANSFER'; amount: number }[] = []
      if (cashVal > 0) paymentsPayload.push({ method: 'CASH', amount: cashVal })
      if (bankVal > 0) paymentsPayload.push({ method: 'BANK_TRANSFER', amount: bankVal })

      await orderService.pay(currentOrder.id, paymentsPayload, finalTotal, user.id)

      const paidData: PrintableOrder = {
        invoice_number: currentOrder.invoice_number,
        table_name: selectedTable?.name ?? 'Mang về',
        cashier_name: profile?.name ?? 'Thu ngân',
        created_at: currentOrder.created_at || new Date().toISOString(),
        items: orderItems.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
          note: i.note,
        })),
        subtotal: finalSubtotal,
        discount: finalDiscount,
        total: finalTotal,
        payment_method: paymentsPayload.length > 1 ? 'MIXED' : paymentsPayload[0]?.method,
        payments: paymentsPayload,
      }

      setShowPayment(false)
      const settings = printerService.getSettings()
      printAutoOnPay(paidData, settings, printCustomerBill)

      setSelectedTable(null)
      setCurrentOrder(null)
      setOrderItems([])
      setDiscount(0)
      loadData()
      success(`Đã thanh toán ${formatCurrency(finalTotal)} (TM ${formatCurrency(cashVal)} + CK ${formatCurrency(bankVal)})`)
    } catch (err: unknown) {
      toastError(err instanceof Error ? `Thanh toán thất bại: ${err.message}` : 'Thanh toán thất bại')
    } finally {
      setPaying(false)
    }
  }

  // Split & Pay partial bill
  const handleSplitAndPay = async () => {
    if (!currentOrder || !user || paying) return
    const selectedEntries = Object.entries(splitSelections)
      .filter(([, qty]) => qty > 0)
      .map(([order_item_id, quantity]) => ({ order_item_id, quantity }))

    if (selectedEntries.length === 0) {
      toastError('Vui lòng tích chọn ít nhất 1 món để tách thanh toán')
      return
    }

    const splitSub = orderItems.reduce((sum, it) => {
      const q = splitSelections[it.id] || 0
      return sum + q * it.unit_price
    }, 0)
    const discVal = Math.min(splitSub, Math.max(0, Number(splitDiscount) || 0))
    const splitTot = Math.max(0, splitSub - discVal)

    let paymentsPayload: { method: 'CASH' | 'BANK_TRANSFER'; amount: number }[] = []
    if (splitMethod === 'MIXED') {
      const c = Math.max(0, Number(splitMixedCash) || 0)
      const b = Math.max(0, Number(splitMixedBank) || 0)
      if (c + b !== splitTot) {
        toastError(`Tổng Tiền mặt + Chuyển khoản phải bằng ${formatCurrency(splitTot)}`)
        return
      }
      if (c > 0) paymentsPayload.push({ method: 'CASH', amount: c })
      if (b > 0) paymentsPayload.push({ method: 'BANK_TRANSFER', amount: b })
    } else {
      paymentsPayload = [{ method: splitMethod, amount: splitTot }]
    }

    setPaying(true)
    try {
      const res = await orderService.splitAndPay(currentOrder.id, selectedEntries, paymentsPayload, user.id, discVal)

      const paidData: PrintableOrder = {
        invoice_number: res.paidOrder.invoice_number,
        table_name: selectedTable?.name ?? 'Mang về',
        cashier_name: profile?.name ?? 'Thu ngân',
        created_at: currentOrder.created_at || new Date().toISOString(),
        items: res.paidOrder.items,
        subtotal: res.paidOrder.subtotal,
        discount: res.paidOrder.discount,
        total: res.paidOrder.total,
        payment_method: paymentsPayload.length > 1 ? 'MIXED' : paymentsPayload[0]?.method,
        payments: paymentsPayload,
      }

      const settings = printerService.getSettings()
      printAutoOnPay(paidData, settings, printCustomerBill)

      if (res.fullPaid || res.remainingCount === 0) {
        setShowPayment(false)
        setSelectedTable(null)
        setCurrentOrder(null)
        setOrderItems([])
        setDiscount(0)
        loadData()
        success(`Đã thanh toán hết hóa đơn ${res.invoice_number} (${formatCurrency(splitTot)})`)
      } else {
        const updated = await orderService.getOpenByTable(currentOrder.table_id)
        if (updated) {
          setCurrentOrder(updated)
          setOrderItems(updated.items ?? [])
          setDiscount(updated.discount ?? 0)
        }
        setSplitSelections({})
        setSplitDiscount(0)
        setSplitMixedCash(0)
        setSplitMixedBank(0)
        loadData()
        success(`Đã tách & thanh toán ${res.invoice_number} (${formatCurrency(splitTot)}). Bàn còn ${res.remainingCount} dòng món.`)
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? `Lỗi tách bill: ${err.message}` : 'Lỗi tách bill')
    } finally {
      setPaying(false)
    }
  }

  // Print pre-bill (phiếu tạm tính)
  const handlePrintPreBill = () => {
    if (!currentOrder || orderItems.length === 0) return
    const preBillData: PrintableOrder = {
      invoice_number: currentOrder.invoice_number,
      table_name: selectedTable?.name ?? 'Mang về',
      cashier_name: profile?.name ?? 'Thu ngân',
      created_at: currentOrder.created_at || new Date().toISOString(),
      items: orderItems.map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
        note: i.note,
      })),
      subtotal,
      discount,
      total,
    }
    printReceipt(preBillData, undefined, true)
    success('Đã gửi lệnh in tạm tính')
  }

  // Print Bar ticket (phiếu Quầy Pha Chế gọn tiết kiệm giấy)
  const handlePrintBarTicket = () => {
    if (!currentOrder || orderItems.length === 0) return
    const barData: PrintableOrder = {
      invoice_number: currentOrder.invoice_number,
      table_name: selectedTable?.name ?? 'Mang về',
      cashier_name: profile?.name ?? 'Thu ngân',
      created_at: currentOrder.created_at || new Date().toISOString(),
      items: orderItems.map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.subtotal,
        note: i.note,
      })),
      subtotal,
      discount,
      total,
    }
    printBarTicket(barData)
    success('Đã gửi lệnh in phiếu Quầy Pha Chế (Bar)')
  }

  // Back to table selection (bấm Rời bàn / Quay lại)
  const handleBack = async () => {
    if (currentOrder && selectedTable) {
      if (orderItems.length === 0) {
        // Bấm nhầm vào bàn trống thực sự không có khách -> tự động dọn dẹp để bàn trở về trạng thái trống
        try {
          await orderService.cancelEmptyOrder(currentOrder.id, selectedTable.id)
        } catch {
          // ignore
        }
      } else {
        // Nếu có món trong đó -> hiển thị tổng số món và tổng tiền cần thanh toán
        const totalQty = orderItems.reduce((s, i) => s + i.quantity, 0)
        success(`${selectedTable.name}: ${totalQty} món • ${formatCurrency(total)} (chờ thanh toán)`)
      }
    }

    // ĐỒNG BỘ DỮ LIỆU HOÀN TẤT TRƯỚC KHI RỜI BÀN ĐỂ TRÁNH LỖI HIỂN THỊ
    await loadData()

    setSelectedTable(null)
    setCurrentOrder(null)
    setOrderItems([])
    setDiscount(0)
    setDiscountMode('VND')
    setDiscountPct(0)
    setSearchQuery('')
    setShowSearchDropdown(false)
    setHighlightedSearchIndex(0)
    setActiveCategory('all')
  }

  const filteredProducts = useMemo(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]))

    const getMatchaSubGroupRank = (prodName: string): number => {
      const n = removeVietnameseTones(prodName)
      if (n.includes('matcha')) return 1
      if (n.includes('cacao')) return 2
      if (n.includes('khoai mon')) return 3
      return 4
    }

    const filtered = products.filter((p) => {
      if (searchQuery.trim()) {
        const matchesSearch = matchSearchWithAcronym(p.name, searchQuery)
        if (!matchesSearch) return false
        if (activeCategory !== 'all' && p.category_id !== activeCategory) {
          return false
        }
        return true
      }
      return activeCategory === 'all' ? true : p.category_id === activeCategory
    })

    return [...filtered].sort((a, b) => {
      const catA = catMap.get(a.category_id)
      const catB = catMap.get(b.category_id)
      const orderA = catA?.sort_order ?? 999
      const orderB = catB?.sort_order ?? 999
      if (orderA !== orderB) return orderA - orderB

      // Riêng mục Matcha, Cacao, Khoai môn: sắp xếp theo nhóm Matcha -> Cacao -> Khoai môn rồi mới đến giá
      const catNameNoTone = removeVietnameseTones(catA?.name || '')
      if (
        catNameNoTone.includes('matcha') ||
        catNameNoTone.includes('cacao') ||
        catNameNoTone.includes('khoai mon')
      ) {
        const rankA = getMatchaSubGroupRank(a.name)
        const rankB = getMatchaSubGroupRank(b.name)
        if (rankA !== rankB) return rankA - rankB
      }

      // Mặc định trong mỗi danh mục (và mỗi nhóm Matcha/Cacao/Khoai môn): rẻ đến đắt
      if (a.price !== b.price) return a.price - b.price
      return a.name.localeCompare(b.name, 'vi')
    })
  }, [products, categories, searchQuery, activeCategory])

  // Danh sách món gợi ý khi tìm kiếm xổ xuống (tìm kiếm trên toàn bộ menu món)
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) return []
    return products.filter((p) => matchSearchWithAcronym(p.name, q))
  }, [products, searchQuery])

  // Đóng dropdown tìm kiếm khi nhấp chuột ra ngoài
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowSearchDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const subtotal = currentOrder?.subtotal ?? orderItems.reduce((s, i) => s + i.subtotal, 0)
  const total = Math.max(0, subtotal - discount)
  const totalQuantity = orderItems.reduce((s, i) => s + i.quantity, 0)

  // ── KEYBOARD NAVIGATION & AUTO-FOCUS ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (editingOrderItem || showDailyReportModal || showPayment) {
        if (e.key === 'Escape') {
          if (editingOrderItem) setEditingOrderItem(null)
          if (showDailyReportModal) setShowDailyReportModal(false)
          if (showPayment) setShowPayment(false)
        }
        return
      }
      if (e.key === 'F2') {
        e.preventDefault()
        searchInputRef.current?.focus()
        if (searchQuery.trim()) {
          setShowSearchDropdown(true)
        }
      }
      if (e.key === 'Escape') {
        if (searchQuery || showSearchDropdown) {
          setSearchQuery('')
          setShowSearchDropdown(false)
          setHighlightedSearchIndex(0)
        } else if (selectedTable) {
          handleBack()
        }
      }
      if (e.key === 'F9' && selectedTable && orderItems.length > 0) {
        e.preventDefault()
        document.getElementById('btn-checkout-pay')?.click()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingOrderItem, showDailyReportModal, showPayment, searchQuery, selectedTable, orderItems.length])

  useEffect(() => {
    if (selectedTable) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [selectedTable])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <LoadingSpinner size={32} />
      </div>
    )
  }

  // ── TABLE SELECTION VIEW ────────────────────────────────────
  if (!selectedTable) {
    return (
      <div className="animate-fade-in" style={{ height: '100%', overflowY: 'auto', paddingRight: '0.25rem' }}>
        <ToastContainer toasts={toasts} onRemove={removeToast} />
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 className="page-title">Bán hàng</h1>
            <p className="page-subtitle">Chọn bàn để bắt đầu order hoặc xem đơn đang mở</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {hasRole('OWNER', 'MANAGER') && (
              <button
                className="btn btn-secondary"
                onClick={() => setShowDailyReportModal(true)}
                style={{ gap: '0.5rem', fontWeight: 600 }}
              >
                <FileText size={16} color="var(--color-coffee-500)" />
                Báo cáo cuối ngày
              </button>
            )}
          </div>
        </div>

        <div
          className="stagger-children"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '1rem',
          }}
        >
          {tables.map((table) => {
            const openOrder = openOrders.find((o) => o.table_id === table.id)
            const openItemsCount = (openOrder?.items ?? []).reduce((s, i) => s + i.quantity, 0)
            const openTotalAmount =
              openOrder?.total && openOrder.total > 0
                ? openOrder.total
                : (openOrder?.items ?? []).reduce((s, i) => s + i.subtotal, 0)
            const isOccupied = table.status === 'OCCUPIED' || openItemsCount > 0

            return (
              <button
                key={table.id}
                onClick={() => handleSelectTable(table)}
                disabled={table.status === 'DISABLED'}
                className={`glass-card ${
                  table.status === 'DISABLED'
                    ? 'table-disabled'
                    : isOccupied
                    ? 'table-occupied'
                    : 'table-available'
                }`}
                style={{
                  padding: '1.25rem 1rem',
                  cursor: table.status === 'DISABLED' ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                  border: isOccupied ? '2px solid #f59e0b' : '2px solid rgba(16, 185, 129, 0.4)',
                  background: isOccupied
                    ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.45) 0%, rgba(255, 255, 255, 0.95) 100%)'
                    : undefined,
                  transition: 'all 0.18s ease',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '120px',
                }}
              >
                <div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.35rem', color: 'var(--color-coffee-900)' }}>
                    {table.name}
                  </div>
                  <span
                    className={`badge ${
                      table.status === 'DISABLED'
                        ? 'badge-info'
                        : openItemsCount > 0
                        ? 'badge-warning'
                        : isOccupied
                        ? 'badge-warning'
                        : 'badge-success'
                    }`}
                    style={{ fontWeight: 600 }}
                  >
                    {table.status === 'DISABLED'
                      ? 'Tắt'
                      : openItemsCount > 0
                      ? 'Đang dùng'
                      : isOccupied
                      ? 'Đang mở'
                      : 'Trống'}
                  </span>
                </div>

                {/* Show items count and total amount in REALTIME */}
                {openItemsCount > 0 ? (
                  <div
                    style={{
                      marginTop: '0.625rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px dashed rgba(217, 119, 6, 0.45)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#b45309',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.125rem',
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', color: '#d97706' }}>
                      {openItemsCount} món
                    </span>
                    <span style={{ fontSize: '0.95rem', color: '#b45309', letterSpacing: '-0.2px' }}>
                      {formatCurrency(openTotalAmount)}
                    </span>
                  </div>
                ) : isOccupied ? (
                  <div
                    style={{
                      marginTop: '0.5rem',
                      paddingTop: '0.375rem',
                      borderTop: '1px dashed rgba(217, 119, 6, 0.25)',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    Chưa gọi món
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>

        {tables.length === 0 && (
          <EmptyState
            icon={<CupSoda size={48} />}
            title="Chưa có bàn nào"
            description="Vui lòng thêm bàn trong mục Quản lý bàn"
          />
        )}

        {/* ── Daily Sales Report Modal ── */}
        {showDailyReportModal && hasRole('OWNER', 'MANAGER') && createPortal(
          <div
            className="daily-report-modal-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              zIndex: 10000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem',
              boxSizing: 'border-box',
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowDailyReportModal(false)
            }}
          >
            <div
              className="daily-report-modal-content"
              style={{
                width: '100%',
                maxWidth: '1240px',
                height: 'calc(100% - 2rem)',
                maxHeight: 'calc(100% - 2rem)',
                margin: '0 auto',
                display: 'flex',
                flexDirection: 'column',
                borderRadius: 'var(--radius-xl)',
                overflow: 'hidden',
                background: '#ffffff',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
              }}
            >
              <DailySalesReportSheet
                isModal
                onClose={() => setShowDailyReportModal(false)}
              />
            </div>
          </div>,
          document.body
        )}
      </div>
    )
  }

  // ── ORDER VIEW ──────────────────────────────────────────────
  return (
    <div
      className="animate-fade-in pos-order-layout"
      style={{
        display: 'flex',
        gap: '0.875rem',
        height: '100%',
        maxHeight: '100%',
        minHeight: 0,
        flex: 1,
        overflow: 'hidden',
      }}
    >
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {/* LEFT: Menu */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%', minHeight: 0, overflow: 'hidden' }}>
        {/* Header with back button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem', flexWrap: 'wrap', gap: '0.5rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              id="btn-back-tables"
              className="btn btn-secondary btn-sm"
              onClick={handleBack}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontWeight: 600 }}
              title="Lưu tạm đơn và quay về danh sách bàn [ESC]"
            >
              <ArrowLeft size={16} />
              Quay lại danh sách bàn
            </button>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-coffee-900)' }}>
              {selectedTable.name}
            </h2>
            <span className="badge badge-coffee">{currentOrder?.invoice_number}</span>
          </div>

          {/* Realtime summary pill on top header */}
          {totalQuantity > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  padding: '0.3rem 0.75rem',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(217, 119, 6, 0.12)',
                  border: '1px solid rgba(217, 119, 6, 0.3)',
                  color: '#b45309',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                <span>Đang chọn: <strong>{totalQuantity} món</strong></span>
                <span>•</span>
                <span style={{ color: '#92400e' }}>{formatCurrency(total)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Search Bar with Autocomplete Dropdown */}
        <div
          ref={searchContainerRef}
          style={{ position: 'relative', marginBottom: '0.5rem', flexShrink: 0, zIndex: 60 }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
          <input
            ref={searchInputRef}
            type="text"
            className="input"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowSearchDropdown(true)
              setHighlightedSearchIndex(0)
            }}
            onFocus={() => {
              if (searchQuery.trim()) {
                setShowSearchDropdown(true)
              }
            }}
            onKeyDown={(e) => {
              if (showSearchDropdown && searchSuggestions.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightedSearchIndex((prev) => {
                    const next = prev < searchSuggestions.length - 1 ? prev + 1 : 0
                    const el = document.getElementById(`search-drop-item-${next}`)
                    el?.scrollIntoView({ block: 'nearest' })
                    return next
                  })
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightedSearchIndex((prev) => {
                    const next = prev > 0 ? prev - 1 : searchSuggestions.length - 1
                    const el = document.getElementById(`search-drop-item-${next}`)
                    el?.scrollIntoView({ block: 'nearest' })
                    return next
                  })
                  return
                }
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const selected = searchSuggestions[highlightedSearchIndex] || searchSuggestions[0]
                  if (selected) {
                    handleSelectSearchProduct(selected)
                  }
                  return
                }
              }
              if (e.key === 'Escape') {
                if (searchQuery || showSearchDropdown) {
                  e.preventDefault()
                  setSearchQuery('')
                  setShowSearchDropdown(false)
                  setHighlightedSearchIndex(0)
                }
              }
            }}
            placeholder="Tìm kiếm nhanh món [F2] - (gõ tên món, chữ viết tắt...)"
            style={{
              paddingLeft: '2.25rem',
              paddingRight: searchQuery ? '2.25rem' : '1rem',
              height: 42,
              fontSize: '0.9375rem',
              borderRadius: 'var(--radius-lg)',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('')
                setShowSearchDropdown(false)
                setHighlightedSearchIndex(0)
                searchInputRef.current?.focus()
              }}
              className="btn-ghost"
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                padding: '0.25rem',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                color: 'var(--color-text-muted)',
                zIndex: 2,
              }}
              title="Xóa tìm kiếm"
            >
              <X size={14} />
            </button>
          )}

          {/* Dropdown Gợi Ý Kết Quả Xổ Xuống */}
          {showSearchDropdown && searchQuery.trim().length > 0 && (
            <div
              ref={searchDropdownRef}
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 1000,
                background: '#ffffff',
                borderRadius: 'var(--radius-lg, 12px)',
                border: '1.5px solid var(--color-coffee-300, #d7ccc8)',
                boxShadow: '0 12px 36px -4px rgba(40, 20, 10, 0.2), 0 4px 12px rgba(0, 0, 0, 0.08)',
                maxHeight: '340px',
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {searchSuggestions.length > 0 ? (
                <>
                  <div
                    style={{
                      padding: '0.35rem 0.85rem',
                      background: 'var(--color-coffee-50, #faf6f0)',
                      borderBottom: '1px solid var(--color-coffee-100, #f0e6dc)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--color-coffee-800, #785549)',
                      fontWeight: 600,
                    }}
                  >
                    <span>Tìm thấy {searchSuggestions.length} món phù hợp</span>
                    <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                      Phím [↑] [↓] chọn, [Enter] để thêm
                    </span>
                  </div>

                  {searchSuggestions.map((product, idx) => {
                    const isHighlighted = idx === highlightedSearchIndex
                    const cat = categories.find((c) => c.id === product.category_id)
                    return (
                      <div
                        key={product.id}
                        id={`search-drop-item-${idx}`}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => handleSelectSearchProduct(product)}
                        onMouseEnter={() => setHighlightedSearchIndex(idx)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.65rem 0.875rem',
                          cursor: 'pointer',
                          background: isHighlighted ? '#fffbeb' : '#ffffff',
                          borderLeft: isHighlighted
                            ? '4px solid var(--color-coffee-600, #8B4513)'
                            : '4px solid transparent',
                          borderBottom:
                            idx === searchSuggestions.length - 1
                              ? 'none'
                              : '1px solid #f5efe6',
                          transition: 'background 0.1s ease',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <span
                            style={{
                              fontWeight: isHighlighted ? 700 : 600,
                              fontSize: '0.9375rem',
                              color: isHighlighted
                                ? 'var(--color-coffee-950, #2b1810)'
                                : '#1f2937',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {product.name}
                          </span>
                          {cat && (
                            <span
                              style={{
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: '#f5efe6',
                                color: '#785549',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {cat.name}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.6rem',
                            flexShrink: 0,
                            marginLeft: '0.75rem',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: '0.9375rem',
                              color: 'var(--color-coffee-700, #92400e)',
                            }}
                          >
                            {formatCurrency(product.price)}
                          </span>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: isHighlighted ? 'var(--color-coffee-600, #8B4513)' : '#e5e7eb',
                              color: isHighlighted ? '#ffffff' : '#6b7280',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              transition: 'all 0.15s ease',
                            }}
                            title="Thêm món"
                          >
                            +
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </>
              ) : (
                <div
                  style={{
                    padding: '1.5rem 1rem',
                    textAlign: 'center',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <Search size={22} style={{ color: 'var(--color-text-muted)', opacity: 0.6 }} />
                  <span style={{ fontSize: '0.875rem' }}>
                    Không tìm thấy món nào với từ khóa "<strong>{searchQuery}</strong>"
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.5rem', flexWrap: 'wrap', paddingBottom: '0.15rem', flexShrink: 0 }}>
          <button
            onClick={() => setActiveCategory('all')}
            className={`btn btn-sm ${activeCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Tất cả ({products.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`btn btn-sm ${activeCategory === cat.id ? 'btn-primary' : 'btn-secondary'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(115px, 1fr))',
            gap: '0.5rem',
            alignContent: 'start',
          }}
        >
          {filteredProducts.map((product) => {
            const cat = categories.find(c => c.id === product.category_id)
            const catName = cat?.name.toLowerCase() || ''
            let catClass = ''
            if (catName.includes('cà phê') || catName.includes('coffee') || catName.includes('cf')) catClass = 'cat-ca-phe'
            else if (catName.includes('trà') || catName.includes('tea')) catClass = 'cat-tra'
            else if (catName.includes('đá xay') || catName.includes('sinh tố') || catName.includes('matcha')) catClass = 'cat-da-xay'
            else if (catName.includes('bánh') || catName.includes('ăn vặt')) catClass = 'cat-banh'
            
            return (
              <div
                key={product.id}
                role="button"
                tabIndex={0}
                onClick={() => handleAddProduct(product)}
                className={`glass-card product-card ${catClass}`}
                style={{
                  padding: '0.5rem 0.625rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  border: '1px solid var(--color-border)',
                  boxSizing: 'border-box',
                }}
              >
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1.35, wordBreak: 'break-word' }}>{product.name}</div>
                <div
                  className="tabular-nums"
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--color-coffee-500)',
                    fontWeight: 700,
                    marginTop: 'auto',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={formatCurrency(product.price)}
                >
                  {formatCurrency(product.price)}
                </div>
              </div>
            )
          })}

          {filteredProducts.length === 0 && (
            <div className="empty-state" style={{ gridColumn: '1 / -1', padding: '2rem' }}>
              <CupSoda size={36} style={{ opacity: 0.3, margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontWeight: 600, margin: 0 }}>
                {searchQuery
                  ? `Không tìm thấy món nào với từ khóa "${searchQuery}"`
                  : 'Chưa có món trong danh mục này'}
              </p>
              {searchQuery && (
                <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                  {activeCategory !== 'all' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => setActiveCategory('all')}>
                      Tìm trong tất cả danh mục
                    </button>
                  )}
                  <button className="btn btn-primary btn-sm" onClick={() => setSearchQuery('')}>
                    Xóa tìm kiếm
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Order Panel */}
      <div
        className="glass-card pos-cart-panel"
        style={{
          width: 'clamp(310px, 28vw, 390px)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          maxHeight: '100%',
          minHeight: 0,
          padding: '0.625rem 0.75rem',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.35rem', flexShrink: 0 }}>
          <ShoppingBag size={15} color="var(--color-coffee-400)" />
          <h3 style={{ fontSize: '0.8125rem', fontWeight: 700, margin: 0, color: 'var(--color-coffee-900)' }}>Đơn hàng</h3>
          <span className="badge badge-coffee" style={{ marginLeft: 'auto', fontWeight: 700, fontSize: '0.6875rem' }}>
            {totalQuantity} món • {formatCurrency(total)}
          </span>
        </div>

        {/* Order Items list */}
        <div className="pos-cart-items" style={{ flex: '1 1 0%', overflowY: 'auto', minHeight: 0, paddingRight: '2px' }}>
          {orderItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)' }}>
              <ShoppingBag size={28} style={{ opacity: 0.2, margin: '0 auto 0.5rem', display: 'block' }} />
              <p style={{ fontSize: '0.8125rem', margin: 0 }}>Chọn món từ menu bên trái</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {orderItems.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    padding: '0.375rem 0.5rem',
                    background: idx % 2 === 0 ? 'var(--color-surface)' : 'transparent',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid transparent',
                    transition: 'border-color 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                >
                  {/* Row 1: name + subtotal */}
                  <div
                    onClick={() => handleOpenEditModal(item)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem', cursor: 'pointer' }}
                    title="Bấm để sửa giá / topping / ghi chú"
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.2, color: 'var(--color-text-primary)' }}>
                        {item.product_name}
                      </span>
                      {/* Note text written horizontally on one line */}
                      {item.note && (
                        <span style={{
                          fontSize: '0.55rem', color: 'var(--color-coffee-400)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {item.note}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-coffee-500)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>

                  {/* Row 2: unit price + qty controls + delete */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.2rem' }}>
                    <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(item.unit_price)} / món
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.125rem' }}>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleQtyChange(item, -1)}
                        style={{ padding: '0.15rem', width: '24px', height: '24px' }}
                      >
                        <Minus size={12} />
                      </button>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, minWidth: '20px', textAlign: 'center', color: 'var(--color-text-primary)' }}>
                        {item.quantity}
                      </span>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleQtyChange(item, 1)}
                        style={{ padding: '0.15rem', width: '24px', height: '24px' }}
                      >
                        <Plus size={12} />
                      </button>
                      <button
                        className="btn btn-ghost"
                        onClick={() => handleRemoveItem(item)}
                        style={{ padding: '0.15rem', width: '24px', height: '24px', color: 'var(--color-danger)', marginLeft: '0.125rem' }}
                        title="Xóa món"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Discount + Totals + Pay */}
        <div
          className="pos-cart-footer"
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: '0.35rem',
            marginTop: 'auto',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {/* Label + Toggle mode */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Percent size={12} /> Giảm giá
            </span>
            <div style={{ display: 'flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--color-border)', fontSize: '0.625rem', fontWeight: 700 }}>
              <button
                type="button"
                onClick={() => { setDiscountMode('VND'); setDiscountPct(''); setDiscount(0) }}
                style={{
                  padding: '0.12rem 0.35rem',
                  background: discountMode === 'VND' ? 'var(--color-coffee-600)' : 'transparent',
                  color: discountMode === 'VND' ? '#fff' : 'var(--color-text-muted)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >VNĐ</button>
              <button
                type="button"
                onClick={() => { setDiscountMode('PCT'); setDiscount(0) }}
                style={{
                  padding: '0.12rem 0.35rem',
                  background: discountMode === 'PCT' ? 'var(--color-coffee-600)' : 'transparent',
                  color: discountMode === 'PCT' ? '#fff' : 'var(--color-text-muted)',
                  border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                }}
              >%</button>
            </div>
          </div>

          {/* Preset chips */}
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
            {discountMode === 'PCT'
              ? [5, 10, 15, 20, 30].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => applyDiscountPreset(pct, 'PCT')}
                    style={{
                      padding: '0.12rem 0.35rem',
                      fontSize: '0.625rem', fontWeight: 700,
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${discountPct === pct ? 'var(--color-coffee-500)' : 'var(--color-border)'}`,
                      background: discountPct === pct ? 'rgba(217,119,6,0.15)' : 'var(--color-surface)',
                      color: discountPct === pct ? 'var(--color-coffee-300)' : 'var(--color-text-secondary)',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >{pct}%</button>
                ))
              : [10000, 20000, 50000, 100000].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => applyDiscountPreset(v, 'VND')}
                    style={{
                      padding: '0.12rem 0.35rem',
                      fontSize: '0.625rem', fontWeight: 700,
                      borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${discount === v ? 'var(--color-coffee-500)' : 'var(--color-border)'}`,
                      background: discount === v ? 'rgba(217,119,6,0.15)' : 'var(--color-surface)',
                      color: discount === v ? 'var(--color-coffee-300)' : 'var(--color-text-secondary)',
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                  >{v >= 1000 ? `${v/1000}k` : v}</button>
                ))
            }
          </div>

          {/* Manual input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.35rem' }}>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              placeholder={discountMode === 'PCT' ? 'Nhập % giảm (0–100)' : 'Nhập số tiền giảm (VNĐ)'}
              value={discountMode === 'PCT' ? (discountPct === '' ? '' : discountPct) : (discount ? discount.toLocaleString('en-US') : '')}
              onChange={(e) => {
                const rawVal = e.target.value.replace(/\D/g, '')
                const val = Number(rawVal) || 0
                if (discountMode === 'PCT') {
                  const pctVal = Math.min(val, 100)
                  setDiscountPct(rawVal === '' ? '' : pctVal)
                  setDiscount(Math.round((subtotal * pctVal) / 100))
                } else {
                  setDiscount(val)
                }
              }}
              style={{ flex: 1, fontSize: '0.75rem', padding: '0.25rem 0.5rem', height: '28px' }}
            />
            {discountMode === 'PCT' && discount > 0 && (
              <span style={{ fontSize: '0.625rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                = {formatCurrency(discount)}
              </span>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => handleSetDiscount()}
              title="Áp dụng giảm giá"
              style={{ padding: '0.25rem 0.45rem', height: '28px' }}
            >
              <Check size={13} />
            </button>
            {discount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => { setDiscount(0); setDiscountPct(0); handleSetDiscount(0) }}
                title="Xóa giảm giá"
                style={{ color: 'var(--color-danger)', padding: '0.25rem', height: '28px' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Totals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', fontSize: '0.8125rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
              <span>Tạm tính</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-danger)', fontSize: '0.75rem' }}>
                <span>Giảm giá</span>
                <span className="tabular-nums">-{formatCurrency(discount)}</span>
              </div>
            )}
            <hr className="divider" style={{ margin: '0.15rem 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800 }}>
              <span style={{ fontSize: '0.8125rem' }}>Tổng cộng</span>
              <span className="tabular-nums" style={{ color: 'var(--color-coffee-400)', fontSize: '1.15rem' }}>{formatCurrency(total)}</span>
            </div>
          </div>

            {/* Pre-bill, In Bar & Pay Button */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
            {orderItems.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: printerService.getSettings().printPreBill ? '1fr 1fr' : '1fr', gap: '0.35rem' }}>
                {printerService.getSettings().printPreBill && (
                  <button
                    id="btn-pre-bill"
                    type="button"
                    className="btn btn-secondary"
                    onClick={handlePrintPreBill}
                    title="In phiếu tạm tính cho khách kiểm tra trước khi tính tiền [F4]"
                    style={{ height: '34px', fontSize: '0.8rem', fontWeight: 600, padding: '0 0.5rem' }}
                  >
                    <Printer size={14} />
                    Tạm tính
                  </button>
                )}
                <button
                  id="btn-print-bar"
                  type="button"
                  className="btn btn-secondary"
                  onClick={handlePrintBarTicket}
                  title="In bill pha chế gọn cho Quầy Bar"
                  style={{ height: '34px', fontSize: '0.8rem', fontWeight: 600, padding: '0 0.5rem' }}
                >
                  <Printer size={14} />
                  In Quầy Bar
                </button>
              </div>
            )}

            <button
              id="btn-checkout-pay"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', height: '42px', fontSize: '0.9375rem', fontWeight: 700 }}
              disabled={orderItems.length === 0}
              onClick={openPaymentModal}
              title="Thanh toán đơn hàng [F9]"
            >
              Thanh toán (F9)
            </button>
          </div>
        </div>
      </div>

      {/* Edit Order Item (Sửa giá, thêm topping, ghi chú) Modal */}
      <Modal
        open={!!editingOrderItem}
        onClose={() => setEditingOrderItem(null)}
        title={`Chỉnh sửa món: ${editingOrderItem?.product_name ?? ''}`}
        wide
        contentStyle={{
          width: '100%',
          maxWidth: '780px',
          padding: '1.5rem 1.75rem',
          borderRadius: '1.25rem',
        }}
      >
        {editingOrderItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Row 1: Đơn giá món */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.6rem 1rem',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                  Đơn giá:
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="input"
                  value={editUnitPrice ? editUnitPrice.toLocaleString('en-US') : ''}
                  onChange={(e) => {
                    const rawVal = e.target.value.replace(/\D/g, '')
                    setEditUnitPrice(Number(rawVal) || 0)
                  }}
                  placeholder="Nhập giá mới..."
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--color-coffee-700)',
                    width: '160px',
                    padding: '0.35rem 0.75rem',
                    height: '38px',
                    borderRadius: '8px',
                  }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                  (Giá gốc niêm yết: {formatCurrency(editBasePrice)})
                </span>
              </div>
              {editUnitPrice !== editBasePrice && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    const toppingTotal = selectedToppings.reduce((sum, t) => sum + t.price, 0)
                    const prod = products.find((p) => p.id === editingOrderItem.product_id)
                    const isDrink = isDrinkCategory(prod?.category_id)
                    const sizeExtra = isDrink && selectedSize === 'L' ? sizeLSurcharge : 0
                    setEditUnitPrice(editBasePrice + toppingTotal + sizeExtra)
                  }}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', height: '34px' }}
                  title="Khôi phục giá chuẩn theo menu + topping"
                >
                  Đặt lại giá gốc
                </button>
              )}
            </div>

            {/* Row 1.5: Size Cốc (Drinks only - đặt trên Topping) */}
            {(() => {
              const prod = products.find((p) => p.id === editingOrderItem.product_id)
              if (!isDrinkCategory(prod?.category_id)) return null
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', paddingTop: '0.15rem' }}>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                    Size cốc:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', flex: 1 }}>
                    <button
                      type="button"
                      onClick={() => handleSelectSize('M')}
                      style={{
                        padding: '0.4rem 0.95rem',
                        borderRadius: 'var(--radius-md)',
                        border: selectedSize === 'M' ? '1.5px solid var(--color-coffee-600)' : '1px solid var(--color-border)',
                        background: selectedSize === 'M' ? 'var(--color-coffee-600)' : '#ffffff',
                        color: selectedSize === 'M' ? '#ffffff' : 'var(--color-text-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem',
                        fontWeight: selectedSize === 'M' ? 700 : 500,
                        height: '36px',
                      }}
                    >
                      <span>Size M (chuẩn)</span>
                      {selectedSize === 'M' && <Check size={14} color="#ffffff" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectSize('L')}
                      style={{
                        padding: '0.4rem 0.95rem',
                        borderRadius: 'var(--radius-md)',
                        border: selectedSize === 'L' ? '1.5px solid var(--color-coffee-600)' : '1px solid var(--color-border)',
                        background: selectedSize === 'L' ? 'var(--color-coffee-600)' : '#ffffff',
                        color: selectedSize === 'L' ? '#ffffff' : 'var(--color-text-primary)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        fontSize: '0.85rem',
                        fontWeight: selectedSize === 'L' ? 700 : 500,
                        height: '36px',
                      }}
                    >
                      <span>Size L (+{sizeLSurcharge / 1000}k)</span>
                      {selectedSize === 'L' && <Check size={14} color="#ffffff" />}
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Row 2: Topping + điều chỉnh số lượng topping (khi SL cốc > 1) */}
            {availableToppings.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', paddingTop: '0.15rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                  Topping:
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.55rem',
                    }}
                  >
                    {availableToppings.map((top) => {
                      const selectedObj = selectedToppings.find(
                        (t) => t.name.toLowerCase() === top.name.toLowerCase()
                      )
                      const isSelected = Boolean(selectedObj)
                      return (
                        <div key={top.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                          <button
                            type="button"
                            onClick={() => toggleTopping(top)}
                            style={{
                              padding: '0.4rem 0.85rem',
                              borderRadius: 'var(--radius-md)',
                              border: isSelected
                                ? '1.5px solid var(--color-coffee-600)'
                                : '1px solid var(--color-border)',
                              background: isSelected ? 'var(--color-coffee-600)' : '#ffffff',
                              color: isSelected ? '#ffffff' : 'var(--color-text-primary)',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              fontSize: '0.85rem',
                              fontWeight: isSelected ? 700 : 500,
                              height: '36px',
                              boxShadow: isSelected ? '0 2px 6px rgba(107, 79, 79, 0.25)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <span>{top.name} (+{top.price / 1000}k)</span>
                            {isSelected && <Check size={14} color="#ffffff" />}
                          </button>

                          {isSelected && selectedObj && editQuantity > 1 && (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                                background: '#fdf8f0',
                                border: '1px solid var(--color-coffee-400)',
                                borderRadius: 'var(--radius-md)',
                                padding: '0 0.3rem',
                                height: '36px',
                              }}
                              title={`Số cốc thêm ${top.name} (trên tổng ${editQuantity} cốc)`}
                            >
                              <button
                                type="button"
                                onClick={() => updateToppingQty(top.name, selectedObj.qty - 1)}
                                disabled={selectedObj.qty <= 1}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px', fontWeight: 800, color: 'var(--color-coffee-700)', opacity: selectedObj.qty <= 1 ? 0.35 : 1 }}
                              >
                                -
                              </button>
                              <span style={{ fontSize: '0.8rem', fontWeight: 800, minWidth: '28px', textAlign: 'center', color: 'var(--color-coffee-800)' }}>
                                {selectedObj.qty}/{editQuantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateToppingQty(top.name, selectedObj.qty + 1)}
                                disabled={selectedObj.qty >= editQuantity}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px', fontWeight: 800, color: 'var(--color-coffee-700)', opacity: selectedObj.qty >= editQuantity ? 0.35 : 1 }}
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {editQuantity > 1 && selectedToppings.some((t) => t.qty < editQuantity) && (
                    <div style={{ fontSize: '0.76rem', color: '#b45309', background: '#fffbeb', padding: '0.3rem 0.6rem', borderRadius: '6px', border: '1px solid #fde68a' }}>
                      Lưu ý: Khi lưu, hệ thống sẽ tự động tách thành các dòng riêng theo số lượng topping đã chọn.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Row 3, 4, 5: Đá, Đường / Sữa đặc (theo công thức món), Yêu cầu thêm (Drinks only) */}
            {(() => {
              const prod = products.find((p) => p.id === editingOrderItem.product_id)
              const isDrink = isDrinkCategory(prod?.category_id)
              if (!isDrink) return null
              const { showSugar, showMilk } = getProductSweetenerConfig(editingOrderItem.product_id)
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingTop: '0.15rem' }}>
                  {/* Mức đá */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                      Mức đá:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', flex: 1 }}>
                      {ICE_OPTIONS.map((ice) => {
                        const isSelected = selectedIce === ice
                        return (
                          <button
                            key={ice}
                            type="button"
                            onClick={() => setSelectedIce(ice)}
                            style={{
                              padding: '0.4rem 0.85rem',
                              borderRadius: 'var(--radius-md)',
                              border: isSelected ? '1.5px solid var(--color-coffee-600)' : '1px solid var(--color-border)',
                              background: isSelected ? 'var(--color-coffee-600)' : '#ffffff',
                              color: isSelected ? '#ffffff' : 'var(--color-text-primary)',
                              fontSize: '0.85rem',
                              fontWeight: isSelected ? 700 : 500,
                              height: '36px',
                              cursor: 'pointer',
                              boxShadow: isSelected ? '0 2px 6px rgba(107, 79, 79, 0.25)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {ice}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Mức đường (hiển thị nếu món có đường trong công thức hoặc chưa cài công thức) */}
                  {showSugar && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                        Đường:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', flex: 1 }}>
                        {SUGAR_OPTIONS.map((sugar) => {
                          const isSelected = selectedSugar === sugar
                          return (
                            <button
                              key={sugar}
                              type="button"
                              onClick={() => setSelectedSugar(sugar)}
                              style={{
                                padding: '0.4rem 0.85rem',
                                borderRadius: 'var(--radius-md)',
                                border: isSelected ? '1.5px solid var(--color-coffee-600)' : '1px solid var(--color-border)',
                                background: isSelected ? 'var(--color-coffee-600)' : '#ffffff',
                                color: isSelected ? '#ffffff' : 'var(--color-text-primary)',
                                fontSize: '0.85rem',
                                fontWeight: isSelected ? 700 : 500,
                                height: '36px',
                                cursor: 'pointer',
                                boxShadow: isSelected ? '0 2px 6px rgba(107, 79, 79, 0.25)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {sugar}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Mức sữa đặc (hiển thị nếu món có sữa đặc trong công thức) */}
                  {showMilk && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                        Sữa đặc:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', flex: 1 }}>
                        {MILK_OPTIONS.map((milk) => {
                          const isSelected = selectedMilk === milk
                          return (
                            <button
                              key={milk}
                              type="button"
                              onClick={() => setSelectedMilk(milk)}
                              style={{
                                padding: '0.4rem 0.85rem',
                                borderRadius: 'var(--radius-md)',
                                border: isSelected ? '1.5px solid var(--color-coffee-600)' : '1px solid var(--color-border)',
                                background: isSelected ? 'var(--color-coffee-600)' : '#ffffff',
                                color: isSelected ? '#ffffff' : 'var(--color-text-primary)',
                                fontSize: '0.85rem',
                                fontWeight: isSelected ? 700 : 500,
                                height: '36px',
                                cursor: 'pointer',
                                boxShadow: isSelected ? '0 2px 6px rgba(107, 79, 79, 0.25)' : 'none',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {milk}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Yêu cầu thêm */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                      Thêm:
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', flex: 1 }}>
                      {EXTRA_OPTIONS.map((extra) => {
                        const isSelected = selectedExtras.includes(extra)
                        return (
                          <button
                            key={extra}
                            type="button"
                            onClick={() => toggleExtra(extra)}
                            style={{
                              padding: '0.4rem 0.85rem',
                              borderRadius: 'var(--radius-md)',
                              border: isSelected ? '1.5px solid var(--color-coffee-600)' : '1px solid var(--color-border)',
                              background: isSelected ? 'var(--color-coffee-600)' : '#ffffff',
                              color: isSelected ? '#ffffff' : 'var(--color-text-primary)',
                              fontSize: '0.85rem',
                              fontWeight: isSelected ? 700 : 500,
                              height: '36px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              boxShadow: isSelected ? '0 2px 6px rgba(107, 79, 79, 0.25)' : 'none',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {isSelected && <Check size={14} color="#ffffff" />}
                            {extra}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Row 6: Custom Note input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', paddingTop: '0.15rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, minWidth: '72px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                Ghi chú:
              </span>
              <input
                type="text"
                className="input"
                value={customNoteText}
                onChange={(e) => setCustomNoteText(e.target.value)}
                placeholder="Ví dụ: ít ngọt hơn nữa, cho 2 ống hút, mang ra cùng đồ ăn..."
                style={{ fontSize: '0.875rem', width: '100%', padding: '0.45rem 0.85rem', height: '38px', borderRadius: '8px' }}
              />
            </div>

            {/* Row 7: Quantity + Total + Action Buttons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '0.75rem 1.15rem',
                background: 'var(--color-surface)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                marginTop: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              {/* Số lượng */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginRight: '4px' }}>
                  Số lượng:
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => updateEditQuantity(editQuantity - 1)}
                  style={{ width: 34, height: 34, padding: 0 }}
                >
                  <Minus size={15} />
                </button>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, minWidth: 32, textAlign: 'center' }}>
                  {editQuantity}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => updateEditQuantity(editQuantity + 1)}
                  style={{ width: 34, height: 34, padding: 0 }}
                >
                  <Plus size={15} />
                </button>
              </div>

              {/* Price Calculation preview */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Tổng thanh toán:</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-coffee-700)' }}>
                  {(() => {
                    const fullToppingSum = selectedToppings.reduce((s, t) => s + t.price, 0)
                    const effectiveBase = Math.max(0, editUnitPrice - fullToppingSum)
                    const totalPreview =
                      effectiveBase * editQuantity +
                      selectedToppings.reduce((s, t) => s + t.price * t.qty, 0)
                    return formatCurrency(totalPreview)
                  })()}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.65rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.45rem 1.25rem', fontSize: '0.875rem', height: '38px', fontWeight: 600 }}
                  onClick={() => setEditingOrderItem(null)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.45rem 1.5rem', fontSize: '0.9rem', fontWeight: 700, height: '38px' }}
                  onClick={handleSaveItemEdit}
                >
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Payment & Split Bill Modal */}
      <Modal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        wide={payTab === 'SPLIT'}
        title={payTab === 'SPLIT' ? 'Tách bill & Thanh toán từng phần' : 'Thanh toán hóa đơn'}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginBottom: '0.5rem' }}>
          {/* Tab chuyển: Toàn bộ vs Tách bill */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: '#f1f5f9', padding: '0.3rem', borderRadius: 'var(--radius-md)' }}>
            <button
              type="button"
              className={`btn btn-sm ${payTab === 'FULL' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPayTab('FULL')}
            >
              Thanh toán toàn bộ
            </button>
            <button
              type="button"
              className={`btn btn-sm ${payTab === 'SPLIT' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPayTab('SPLIT')}
            >
              Tách bill / Trả từng phần
            </button>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.84rem',
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: printCustomerBill ? '#fdf8f0' : '#f8fafc',
              border: `1px solid ${printCustomerBill ? 'var(--color-coffee-400)' : 'var(--color-border-light)'}`,
              cursor: 'pointer',
              fontWeight: printCustomerBill ? 700 : 500,
              color: printCustomerBill ? 'var(--color-coffee-800)' : 'var(--color-text-secondary)',
            }}
          >
            <input
              type="checkbox"
              checked={printCustomerBill}
              onChange={(e) => setPrintCustomerBill(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--color-coffee-600)', cursor: 'pointer' }}
            />
            <span>In thêm bill chi tiết đưa khách (mặc định chỉ in Quầy Bar)</span>
          </label>

          {payTab === 'FULL' ? (
            <>
              <div
                style={{
                  textAlign: 'center',
                  padding: '0.875rem',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.2rem' }}>Tổng thanh toán</div>
                <div className="stat-value">{formatCurrency(total)}</div>
              </div>

              <button
                className="btn btn-primary btn-lg"
                disabled={paying}
                onClick={() => handlePay('CASH')}
                style={{ width: '100%' }}
              >
                <Banknote size={20} />
                {paying ? 'Đang xử lý...' : 'Tiền mặt'}
              </button>

              <button
                className="btn btn-secondary btn-lg"
                disabled={paying}
                onClick={() => handlePay('BANK_TRANSFER')}
                style={{ width: '100%' }}
              >
                <CreditCard size={20} />
                {paying ? 'Đang xử lý...' : 'Chuyển khoản'}
              </button>

              <button
                type="button"
                className={`btn btn-lg ${showMixedFull ? 'btn-primary' : 'btn-secondary'}`}
                disabled={paying}
                onClick={() => {
                  const next = !showMixedFull
                  setShowMixedFull(next)
                  if (next) {
                    setMixedCash(0)
                    setMixedBank(total)
                  }
                }}
                style={{ width: '100%' }}
              >
                Kết hợp (Tiền mặt + Chuyển khoản)
              </button>

              {showMixedFull && (
                <div style={{ padding: '0.875rem', background: '#fdf8f0', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-coffee-300)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
                    <div>
                      <label className="input-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>Tiền mặt (đ)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input"
                        placeholder="Nhập tiền mặt..."
                        value={mixedCash > 0 ? mixedCash.toLocaleString('en-US') : ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '')
                          const v = Math.min(total, Number(raw) || 0)
                          setMixedCash(v)
                          setMixedBank(Math.max(0, total - v))
                        }}
                        style={{
                          color: '#0f172a',
                          caretColor: '#0f172a',
                          backgroundColor: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          cursor: 'text',
                        }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="input-label" style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>Chuyển khoản (đ)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="input"
                        placeholder="Tự tính hoặc nhập..."
                        value={mixedBank > 0 ? mixedBank.toLocaleString('en-US') : ''}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '')
                          const v = Math.min(total, Number(raw) || 0)
                          setMixedBank(v)
                          setMixedCash(Math.max(0, total - v))
                        }}
                        style={{
                          color: '#0f172a',
                          caretColor: '#0f172a',
                          backgroundColor: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          cursor: 'text',
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={paying || mixedCash + mixedBank !== total}
                    onClick={handlePayMixedFull}
                    style={{ width: '100%' }}
                  >
                    {paying ? 'Đang xử lý...' : `Xác nhận thu ${formatCurrency(total)}`}
                  </button>
                </div>
              )}
            </>
          ) : (
            (() => {
              const splitSubtotal = orderItems.reduce((sum, it) => sum + (splitSelections[it.id] || 0) * it.unit_price, 0)
              const splitDisc = Math.min(splitSubtotal, Math.max(0, Number(splitDiscount) || 0))
              const splitTotal = Math.max(0, splitSubtotal - splitDisc)
              const remainingOnTable = Math.max(0, subtotal - splitSubtotal)
              const hasAnySelected = Object.values(splitSelections).some((q) => q > 0)

              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    <span>Tích chọn món &amp; số lượng khách trả trong lượt này:</span>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          const all: Record<string, number> = {}
                          orderItems.forEach((it) => { all[it.id] = it.quantity })
                          setSplitSelections(all)
                        }}
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setSplitSelections({})}
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  <div style={{ maxHeight: '230px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                    {orderItems.map((it) => {
                      const selQty = splitSelections[it.id] || 0
                      const isChecked = selQty > 0
                      return (
                        <div
                          key={it.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.65rem',
                            padding: '0.55rem 0.75rem',
                            borderBottom: '1px solid var(--color-border-light)',
                            background: isChecked ? '#fdf8f0' : '#ffffff',
                          }}
                        >
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                setSplitSelections((prev) => ({
                                  ...prev,
                                  [it.id]: e.target.checked ? it.quantity : 0,
                                }))
                              }}
                              style={{ width: 17, height: 17, accentColor: 'var(--color-coffee-600)', cursor: 'pointer' }}
                            />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>
                                {it.product_name} <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>({formatCurrency(it.unit_price)})</span>
                              </div>
                              {it.note && <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{it.note}</div>}
                            </div>
                          </label>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {isChecked ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', border: '1px solid var(--color-coffee-400)', borderRadius: '6px', padding: '0 0.25rem', background: '#fff' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.15rem 0.35rem', fontWeight: 700 }}
                                  onClick={() => setSplitSelections((prev) => ({ ...prev, [it.id]: Math.max(0, selQty - 1) }))}
                                >
                                  -
                                </button>
                                <span style={{ fontSize: '0.82rem', fontWeight: 800, minWidth: '32px', textAlign: 'center' }}>
                                  {selQty}/{it.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  style={{ padding: '0.15rem 0.35rem', fontWeight: 700 }}
                                  disabled={selQty >= it.quantity}
                                  onClick={() => setSplitSelections((prev) => ({ ...prev, [it.id]: Math.min(it.quantity, selQty + 1) }))}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>SL: {it.quantity}</span>
                            )}
                            <strong style={{ minWidth: '72px', textAlign: 'right', fontSize: '0.85rem' }}>
                              {formatCurrency((isChecked ? selQty : it.quantity) * it.unit_price)}
                            </strong>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Tóm tắt phần tách & giảm giá nếu có */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem', alignItems: 'center', padding: '0.75rem', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        Phần chọn lần này: <strong style={{ color: 'var(--color-coffee-700)', fontSize: '1.05rem' }}>{formatCurrency(splitTotal)}</strong>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                        Còn lại trên bàn sau khi tách: <strong>{formatCurrency(remainingOnTable)}</strong>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Giảm giá phần này:</span>
                      <input
                        type="number"
                        min={0}
                        max={splitSubtotal}
                        className="input"
                        value={splitDiscount || ''}
                        onChange={(e) => setSplitDiscount(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="0"
                        style={{ width: 95, padding: '0.3rem 0.5rem', textAlign: 'right', fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>

                  {/* Chọn hình thức thanh toán cho phần tách */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${splitMethod === 'CASH' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSplitMethod('CASH')}
                    >
                      Tiền mặt
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${splitMethod === 'BANK_TRANSFER' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setSplitMethod('BANK_TRANSFER')}
                    >
                      Chuyển khoản
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${splitMethod === 'MIXED' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => {
                        setSplitMethod('MIXED')
                        setSplitMixedCash(0)
                        setSplitMixedBank(splitTotal)
                      }}
                    >
                      Kết hợp TM+CK
                    </button>
                  </div>

                  {splitMethod === 'MIXED' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', padding: '0.65rem', background: '#fdf8f0', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-coffee-300)' }}>
                      <div>
                        <label className="input-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Tiền mặt (đ)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input"
                          placeholder="Nhập tiền mặt..."
                          value={splitMixedCash > 0 ? splitMixedCash.toLocaleString('en-US') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '')
                            const v = Math.min(splitTotal, Number(raw) || 0)
                            setSplitMixedCash(v)
                            setSplitMixedBank(Math.max(0, splitTotal - v))
                          }}
                          style={{
                            color: '#0f172a',
                            caretColor: '#0f172a',
                            backgroundColor: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            cursor: 'text',
                          }}
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="input-label" style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Chuyển khoản (đ)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input"
                          placeholder="Tự tính hoặc nhập..."
                          value={splitMixedBank > 0 ? splitMixedBank.toLocaleString('en-US') : ''}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '')
                            const v = Math.min(splitTotal, Number(raw) || 0)
                            setSplitMixedBank(v)
                            setSplitMixedCash(Math.max(0, splitTotal - v))
                          }}
                          style={{
                            color: '#0f172a',
                            caretColor: '#0f172a',
                            backgroundColor: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.92rem',
                            cursor: 'text',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    disabled={paying || !hasAnySelected}
                    onClick={handleSplitAndPay}
                    style={{ width: '100%' }}
                  >
                    {paying
                      ? 'Đang tách & thanh toán...'
                      : `Thanh toán & In bill phần này (${formatCurrency(splitTotal)})`}
                  </button>
                </>
              )
            })()
          )}
        </div>
      </Modal>
    </div>
  )
}
