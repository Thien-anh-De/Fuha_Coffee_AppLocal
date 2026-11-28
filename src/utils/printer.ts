// ============================================================
// POS FuHa Cafe — Thermal Receipt Print Utility
// Generates clean, printer-ready HTML and prints via isolated iframe
// ============================================================

import { printerService, type PrinterSettings } from '@/services/printerService'
import { formatDateTime } from '@/utils/helpers'

export interface PrintableOrderItem {
  product_name: string
  quantity: number
  unit_price: number
  subtotal: number
  note?: string
}

export interface PrintableOrder {
  invoice_number?: string
  table_name: string
  cashier_name?: string
  created_at?: string
  items: PrintableOrderItem[]
  subtotal: number
  discount: number
  total: number
  payment_method?: 'CASH' | 'BANK_TRANSFER' | 'MIXED' | string
  payments?: { method: string; amount: number }[]
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Định dạng giá tiền cho hóa đơn in nhiệt: loại bỏ ký tự 'đ' / '₫' ở sau (ví dụ: 30.000)
 */
function formatReceiptPrice(amount: number | string): string {
  const num = typeof amount === 'number' ? amount : Number(String(amount || 0).replace(/[^0-9.-]+/g, '')) || 0
  const formatted = new Intl.NumberFormat('vi-VN').format(Math.round(num))
  return formatted.replace(/\s*(?:[₫đĐ]|vnđ|vnd)/gi, '').trim()
}

/**
 * Làm sạch ghi chú / topping trên hóa đơn: loại bỏ ký tự 'đ' / '₫' sau các con số
 * (ví dụ: "+ Trân châu (+5.000 ₫)" -> "+ Trân châu (+5.000)")
 */
function cleanReceiptNote(note: string): string {
  if (!note) return ''
  return note
    .replace(/(\d[\d.,]*)\s*(?:vnđ|vnd|[₫đĐ])(?![a-zA-Z\u00C0-\u1EF9])/gi, '$1')
    .replace(/[₫]/g, '')
    .trim()
}

/**
 * Định dạng dòng ghi chú / topping để in rõ nét trên máy in nhiệt
 */
function formatReceiptNote(note: string): string {
  const cleaned = cleanReceiptNote(note)
  if (!cleaned) return ''
  // Nếu đã bắt đầu bằng dấu + hoặc • hoặc - thì giữ nguyên, ngược lại thêm •
  const prefix = /^[+•\-]/.test(cleaned) ? '' : '• '
  return `${prefix}${escapeHtml(cleaned)}`
}

/**
 * Loại bỏ giá tiền (+5.000, +10.000 đ...) khỏi topping/ghi chú khi in bill Quầy Pha Chế để tiết kiệm giấy
 */
function stripToppingPrices(note: string): string {
  if (!note) return ''
  return note
    .replace(/\s*\(\s*\+[\d.,]+\s*(?:vnđ|vnd|[₫đĐkK])?\s*\)/gi, '')
    .replace(/[₫]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Định dạng mã hóa đơn ngắn gọn khi bật chế độ in Mã hóa đơn lớn thay số bàn
 */
function getShortInvoiceCode(invoiceNumber?: string): string {
  if (!invoiceNumber) return 'TẠM TÍNH'
  const parts = invoiceNumber.split('-')
  const tail = parts[parts.length - 1]
  return tail && /^\d+$/.test(tail) ? `#${tail}` : invoiceNumber
}

function formatTimeOnly(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date()
  if (Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Sinh mã HTML cho một liên hóa đơn
 */
export function generateReceiptHtml(
  order: PrintableOrder,
  settings: PrinterSettings,
  isPreBill: boolean = false,
  copyLabel?: string
): string {
  const isK58 = settings.paperSize === 'K58'
  const fontScale = settings.fontScale || 'standard'

  // K58 độ rộng đầu in nhiệt thực tế là 48mm (384 dots); K80 là ~70mm.
  // Đặt lề an toàn để máy in bill không bao giờ bị cắt mép chữ bên phải.
  let paperWidth = isK58 ? '48mm' : '70mm'
  if (fontScale === 'compact') {
    paperWidth = isK58 ? '46mm' : '68mm'
  } else if (fontScale === 'large') {
    paperWidth = isK58 ? '50mm' : '72mm'
  }

  // Cỡ chữ được tinh chỉnh cho hóa đơn khách: nhỏ hơn trước 1 chút ở những chỗ to để gọn gàng, tiết kiệm giấy
  let fontSize = isK58 ? '10.5px' : '12px'
  let storeSize = isK58 ? '13px' : '15px'
  let titleSize = isK58 ? '12px' : '13.5px'
  let totalSize = isK58 ? '13px' : '14.5px'
  let metaSize = isK58 ? '9.5px' : '11px'
  let noteSize = isK58 ? '9.5px' : '10.5px'
  let toppingSize = isK58 ? '10.5px' : '11.5px' // In rõ nét, không bị mờ
  let priceSize = isK58 ? '10.5px' : '12px'
  let tableNameSize = isK58 ? '10px' : '11px'
  let invoiceHeroSize = isK58 ? '16px' : '18px'

  if (fontScale === 'compact') {
    fontSize = isK58 ? '9.5px' : '11px'
    storeSize = isK58 ? '12px' : '14px'
    titleSize = isK58 ? '11px' : '12.5px'
    totalSize = isK58 ? '12px' : '13.5px'
    metaSize = isK58 ? '9px' : '10px'
    noteSize = isK58 ? '8.5px' : '9.5px'
    toppingSize = isK58 ? '9.5px' : '10.5px'
    priceSize = isK58 ? '9.5px' : '11px'
    tableNameSize = isK58 ? '9px' : '10px'
    invoiceHeroSize = isK58 ? '14px' : '16px'
  } else if (fontScale === 'large') {
    fontSize = isK58 ? '11.5px' : '13.5px'
    storeSize = isK58 ? '14.5px' : '17px'
    titleSize = isK58 ? '13.5px' : '15px'
    totalSize = isK58 ? '14.5px' : '16px'
    metaSize = isK58 ? '10.5px' : '12px'
    noteSize = isK58 ? '10px' : '11px'
    toppingSize = isK58 ? '11.5px' : '12.5px'
    priceSize = isK58 ? '11.5px' : '13.5px'
    tableNameSize = isK58 ? '10.5px' : '12px'
    invoiceHeroSize = isK58 ? '18px' : '21px'
  }

  // Tỷ lệ độ rộng các cột bảng món (cố định để không tràn bill)
  const qtyWidth = isK58 ? '18px' : '22px'
  const unitPriceWidth = isK58 ? '40px' : '48px'
  const totalPriceWidth = isK58 ? '46px' : '56px'

  const methodLabel: Record<string, string> = {
    CASH: 'Tiền mặt',
    BANK_TRANSFER: 'Chuyển khoản',
  }

  // Xử lý hiển thị bàn: làm rõ nhưng in nhỏ lại, lệch trái
  const rawTableName = (order.table_name || '').trim()
  let displayTableName = 'BÀN: --'
  if (rawTableName) {
    if (/^(bàn|ban)\s*[:\-]?\s*/i.test(rawTableName)) {
      displayTableName = `BÀN: ${rawTableName.replace(/^(bàn|ban)\s*[:\-]?\s*/i, '').trim()}`
    } else if (/^(mang về|mang ve|take away)/i.test(rawTableName)) {
      displayTableName = rawTableName.toUpperCase()
    } else {
      displayTableName = `BÀN: ${rawTableName}`
    }
  }

  // Thông tin địa chỉ & Wifi mặc định
  const shopAddress = (settings.shopAddress || '').trim() || 'Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ'

  // Xử lý thông tin Wifi: mặc định HANU COFFEE, pass: Hanu2026
  const rawWifi = (settings.wifi || '').trim()
  let displayWifi = 'Wifi: HANU COFFEE - Pass: Hanu2026'
  if (rawWifi) {
    if (/^wifi/i.test(rawWifi)) {
      displayWifi = rawWifi
    } else if (rawWifi.toLowerCase().includes('hanu2026')) {
      displayWifi = 'Wifi: HANU COFFEE - Pass: Hanu2026'
    } else {
      displayWifi = `Wifi: HANU COFFEE - Pass: ${rawWifi}`
    }
  }

  const isUpdateV1 = settings.receiptStyle === 'update_v1'

  const itemsHtml = order.items
    .map((item) => {
      const hasNote = Boolean(item.note && item.note.trim())
      const hasMultiQty = item.quantity > 1

      if (!isUpdateV1) {
        return `
      <tr>
        <td style="padding: 2px 2px 2px 0; word-break: break-word; overflow-wrap: break-word; vertical-align: top;">
          <div style="font-weight: 700; color: #000; line-height: 1.25;">${escapeHtml(item.product_name)}</div>
          ${hasNote ? `<div style="font-size: ${toppingSize}; color: #000; font-weight: 700; font-style: normal; padding-left: 2px; margin-top: 1px; line-height: 1.3;">${formatReceiptNote(item.note!)}</div>` : ''}
        </td>
        <td style="padding: 2px 0; text-align: center; white-space: nowrap; vertical-align: top; font-weight: 600;">${item.quantity}</td>
        <td style="padding: 2px 0; text-align: right; white-space: nowrap; vertical-align: top; font-size: ${priceSize}; font-weight: 600;">${formatReceiptPrice(item.unit_price)}</td>
        <td style="padding: 2px 0; text-align: right; font-weight: 800; white-space: nowrap; vertical-align: top; font-size: ${priceSize};">${formatReceiptPrice(item.subtotal)}</td>
      </tr>
    `
      }

      const nameWeight = hasNote ? '800' : '400'
      const qtyHtml = hasMultiQty
        ? `<span style="display: inline-block; background: #000; color: #fff; font-weight: 800; padding: 0 5px; border-radius: 2px; line-height: 1.35;">${item.quantity}</span>`
        : `<span style="font-weight: 400;">${item.quantity}</span>`

      return `
      <tr>
        <td style="padding: 3px 2px 3px 0; word-break: break-word; overflow-wrap: break-word; vertical-align: top;">
          <div style="font-weight: ${nameWeight}; color: #000; line-height: 1.25;">${escapeHtml(item.product_name)}</div>
          ${
            hasNote
              ? `<div style="display: inline-block; font-size: ${toppingSize}; color: #000; font-weight: 800; font-style: normal; border: 1.5px solid #000; border-radius: 2px; padding: 1px 4px; margin-top: 2px; line-height: 1.3;">${formatReceiptNote(item.note!)}</div>`
              : ''
          }
        </td>
        <td style="padding: 3px 0; text-align: center; white-space: nowrap; vertical-align: top;">${qtyHtml}</td>
        <td style="padding: 3px 0; text-align: right; white-space: nowrap; vertical-align: top; font-size: ${priceSize}; font-weight: 400;">${formatReceiptPrice(item.unit_price)}</td>
        <td style="padding: 3px 0; text-align: right; font-weight: 600; white-space: nowrap; vertical-align: top; font-size: ${priceSize};">${formatReceiptPrice(item.subtotal)}</td>
      </tr>
    `
    })
    .join('')

  return `
    <div class="receipt" style="
      width: ${paperWidth};
      max-width: ${paperWidth};
      margin: 0 auto;
      font-family: Arial, 'Segoe UI', Tahoma, Helvetica, sans-serif;
      font-size: ${fontSize};
      line-height: 1.3;
      color: #000;
      background: #fff;
      padding: 2px 1.5mm 8px 1.5mm;
      box-sizing: border-box;
      word-wrap: break-word;
      overflow-wrap: break-word;
      -webkit-font-smoothing: antialiased;
    ">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 5px;">
        <div style="font-size: ${storeSize}; font-weight: 800; letter-spacing: 0.3px; text-transform: uppercase;">
          ${escapeHtml(settings.shopName || 'FUHA CAFE')}
        </div>
        ${shopAddress ? `<div style="font-size: ${metaSize}; margin-top: 2px; line-height: 1.25;">${escapeHtml(shopAddress)}</div>` : ''}
        ${settings.shopPhone ? `<div style="font-size: ${metaSize};">Hotline: ${escapeHtml(settings.shopPhone)}</div>` : ''}
      </div>

      <!-- Title -->
      <div style="text-align: center; margin: 6px 0 4px 0;">
        <div style="font-size: ${titleSize}; font-weight: 800; text-transform: uppercase;">
          ${isPreBill ? 'PHIẾU TẠM TÍNH' : 'HÓA ĐƠN THANH TOÁN'}
        </div>
        ${copyLabel ? `<div style="font-size: ${noteSize}; font-style: italic;">(${escapeHtml(copyLabel)})</div>` : ''}
      </div>

      <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>
      
      <!-- Bàn hoặc Mã hóa đơn lớn (tiết kiệm giấy) -->
      ${
        settings.invoiceNumberMode
          ? `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 0;">
          <span style="font-size: ${metaSize}; font-weight: 700;">SỐ PHIẾU:</span>
          <span style="font-size: ${invoiceHeroSize}; font-weight: 900; letter-spacing: 0.5px; color: #000;">${escapeHtml(getShortInvoiceCode(order.invoice_number))}</span>
        </div>
      `
          : `
        <div style="text-align: left; font-size: ${tableNameSize}; font-weight: 800; color: #000; padding: 1px 0; text-transform: uppercase; letter-spacing: 0.2px;">
          ${escapeHtml(displayTableName)}
        </div>
      `
      }

      <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>

      <!-- Meta Info -->
      <div style="font-size: ${metaSize}; margin-bottom: 5px;">
        <div style="display: flex; justify-content: space-between; gap: 4px;">
          <span style="white-space: nowrap;"><strong>Mã HĐ:</strong> ${escapeHtml(order.invoice_number || 'Tạm tính')}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 2px;">
          <span><strong>Ngày:</strong> ${formatDateTime(order.created_at || new Date().toISOString())}</span>
        </div>
        ${
          order.cashier_name
            ? `<div style="margin-top: 2px;"><strong>Thu ngân:</strong> ${escapeHtml(order.cashier_name)}</div>`
            : ''
        }
      </div>

      <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; font-size: ${fontSize}; table-layout: fixed;">
        <colgroup>
          <col style="width: auto;" />
          <col style="width: ${qtyWidth};" />
          <col style="width: ${unitPriceWidth};" />
          <col style="width: ${totalPriceWidth};" />
        </colgroup>
        <thead>
          <tr style="border-bottom: 1px dashed #000;">
            <th style="text-align: left; padding-bottom: 3px; font-weight: 700;">Món</th>
            <th style="text-align: center; padding-bottom: 3px; font-weight: 700;">SL</th>
            <th style="text-align: right; padding-bottom: 3px; font-weight: 700;">Đ.Giá</th>
            <th style="text-align: right; padding-bottom: 3px; font-weight: 700;">T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="border-top: 1px dashed #000; margin: 5px 0;"></div>

      <!-- Totals -->
      <div style="margin-top: 4px; font-size: ${fontSize};">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Tạm tính:</span>
          <span>${formatReceiptPrice(order.subtotal)}</span>
        </div>
        ${
          order.discount > 0
            ? `
          <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
            <span>Giảm giá:</span>
            <span>-${formatReceiptPrice(order.discount)}</span>
          </div>
        `
            : ''
        }
        <div style="border-top: 1px solid #000; margin: 3px 0;"></div>
        <div style="display: flex; justify-content: space-between; font-size: ${totalSize}; font-weight: 800;">
          <span>TỔNG TIỀN:</span>
          <span>${formatReceiptPrice(order.total)}</span>
        </div>
        ${
          !isPreBill && (order.payments?.length || order.payment_method)
            ? order.payments && order.payments.length > 1
              ? `
          <div style="margin-top: 3px; font-size: ${metaSize};">
            <div style="display: flex; justify-content: space-between;">
              <span>Hình thức:</span>
              <span><strong>Kết hợp (${order.payments.map((p) => `${methodLabel[p.method] || p.method}: ${formatReceiptPrice(p.amount)}`).join(' | ')})</strong></span>
            </div>
          </div>
        `
              : `
          <div style="display: flex; justify-content: space-between; margin-top: 3px; font-size: ${metaSize};">
            <span>Hình thức:</span>
            <span><strong>${methodLabel[order.payments?.[0]?.method || order.payment_method || 'CASH'] || order.payment_method}</strong></span>
          </div>
        `
            : ''
        }
      </div>

      <div style="border-top: 1px dashed #000; margin: 6px 0 5px 0;"></div>

      <!-- Footer Info -->
      <div style="text-align: center; font-size: ${metaSize}; margin-top: 4px;">
        ${displayWifi ? `<div style="margin-bottom: 3px; font-size: ${noteSize}; font-weight: 700; color: #000;">${escapeHtml(displayWifi)}</div>` : ''}
        <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(settings.footerMessage || 'Cảm ơn Quý khách & Hẹn gặp lại!')}</div>
        <div style="font-size: ${noteSize}; color: #333; margin-top: 4px;">
          Powered by POS FuHa Cafe
        </div>
      </div>
    </div>
  `
}

/**
 * Sinh mã HTML gọn tiết kiệm giấy cho Quầy Pha Chế (Bar):
 * Gồm: Bàn (hoặc Mã HĐ lớn), Mã HĐ, Giờ vào, Món, SL (nhấn đậm), Topping/Note (chỉ nội dung, bỏ tiền), Giá.
 * Cắt bớt header quán, wifi, tổng tiền, cảm ơn...
 */
export function generateBarReceiptHtml(
  order: PrintableOrder,
  settings: PrinterSettings
): string {
  const isK58 = settings.paperSize === 'K58'
  const paperWidth = isK58 ? '48mm' : '70mm'

  // Size chữ quầy Bar: đủ rõ ràng, không quá to
  const fontSize = isK58 ? '11px' : '12px'
  const metaSize = isK58 ? '9.5px' : '10.5px'
  const toppingSize = isK58 ? '10.5px' : '11.5px'
  const headerSize = isK58 ? '12px' : '13px'
  const heroCodeSize = isK58 ? '15px' : '17px'
  const qtyWidth = isK58 ? '22px' : '26px'
  const priceWidth = isK58 ? '46px' : '54px'

  const rawTableName = (order.table_name || '').trim()
  let displayTableName = 'BÀN: --'
  if (rawTableName) {
    if (/^(bàn|ban)\s*[:\-]?\s*/i.test(rawTableName)) {
      displayTableName = `BÀN: ${rawTableName.replace(/^(bàn|ban)\s*[:\-]?\s*/i, '').trim()}`
    } else if (/^(mang về|mang ve|take away)/i.test(rawTableName)) {
      displayTableName = rawTableName.toUpperCase()
    } else {
      displayTableName = `BÀN: ${rawTableName}`
    }
  }

  const timeIn = formatTimeOnly(order.created_at)

  const itemsHtml = order.items
    .map((item) => {
      const strippedNote = item.note ? stripToppingPrices(item.note) : ''
      const hasNote = Boolean(strippedNote)
      const hasMultiQty = item.quantity > 1

      const qtyHtml = hasMultiQty
        ? `<span style="display: inline-block; background: #000; color: #fff; font-weight: 800; padding: 0 5px; border-radius: 2px; line-height: 1.35;">${item.quantity}</span>`
        : `<span style="font-weight: 700;">${item.quantity}</span>`

      return `
      <tr>
        <td style="padding: 3px 2px 3px 0; word-break: break-word; overflow-wrap: break-word; vertical-align: top;">
          <div style="font-weight: 700; color: #000; line-height: 1.25;">${escapeHtml(item.product_name)}</div>
          ${
            hasNote
              ? `<div style="display: inline-block; font-size: ${toppingSize}; color: #000; font-weight: 800; border: 1.2px solid #000; border-radius: 2px; padding: 1px 4px; margin-top: 2px; line-height: 1.25;">${formatReceiptNote(strippedNote)}</div>`
              : ''
          }
        </td>
        <td style="padding: 3px 0; text-align: center; white-space: nowrap; vertical-align: top;">${qtyHtml}</td>
        <td style="padding: 3px 0; text-align: right; white-space: nowrap; vertical-align: top; font-size: ${metaSize}; font-weight: 600;">${formatReceiptPrice(item.subtotal)}</td>
      </tr>
    `
    })
    .join('')

  return `
    <div class="receipt" style="
      width: ${paperWidth};
      max-width: ${paperWidth};
      margin: 0 auto;
      font-family: Arial, 'Segoe UI', Tahoma, Helvetica, sans-serif;
      font-size: ${fontSize};
      line-height: 1.25;
      color: #000;
      background: #fff;
      padding: 2px 1.5mm 4px 1.5mm;
      box-sizing: border-box;
      word-wrap: break-word;
      overflow-wrap: break-word;
      -webkit-font-smoothing: antialiased;
    ">
      <!-- Header gọn cho Bar: Bàn / Số phiếu + Giờ vào + Mã HĐ -->
      <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 4px; border-bottom: 1.5px solid #000; padding-bottom: 3px; margin-bottom: 3px;">
        ${
          settings.invoiceNumberMode
            ? `<span style="font-size: ${heroCodeSize}; font-weight: 900; letter-spacing: 0.4px;">${escapeHtml(getShortInvoiceCode(order.invoice_number))}</span>`
            : `<span style="font-size: ${headerSize}; font-weight: 800; text-transform: uppercase;">${escapeHtml(displayTableName)}</span>`
        }
        <span style="font-size: ${metaSize}; font-weight: 700;">Vào: ${escapeHtml(timeIn)}</span>
      </div>
      <div style="font-size: ${metaSize}; margin-bottom: 4px; display: flex; justify-content: space-between;">
        <span><strong>Mã HĐ:</strong> ${escapeHtml(order.invoice_number || 'Tạm')}</span>
        <span><strong>PHA CHẾ</strong></span>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: ${fontSize}; table-layout: fixed;">
        <colgroup>
          <col style="width: auto;" />
          <col style="width: ${qtyWidth};" />
          <col style="width: ${priceWidth};" />
        </colgroup>
        <thead>
          <tr style="border-top: 1px dashed #000; border-bottom: 1px dashed #000;">
            <th style="text-align: left; padding: 2px 0; font-weight: 700; font-size: ${metaSize};">Món / Topping</th>
            <th style="text-align: center; padding: 2px 0; font-weight: 700; font-size: ${metaSize};">SL</th>
            <th style="text-align: right; padding: 2px 0; font-weight: 700; font-size: ${metaSize};">Giá</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
    </div>
  `
}

function sendHtmlToPrintIframe(fullHtml: string, title: string): void {
  // Tạo hoặc lấy iframe in ẩn
  let iframe = document.getElementById('receipt-print-iframe') as HTMLIFrameElement | null
  if (!iframe) {
    iframe = document.createElement('iframe')
    iframe.id = 'receipt-print-iframe'
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
  }

  const doc = iframe.contentWindow?.document
  if (!doc) {
    window.print()
    return
  }

  doc.open()
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          @page {
            size: auto;
            margin: 0mm !important;
          }
          * {
            box-sizing: border-box !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            font-family: Arial, 'Segoe UI', Tahoma, Helvetica, sans-serif;
          }
          .receipt {
            margin: 0 auto !important;
            box-sizing: border-box !important;
          }
        </style>
      </head>
      <body>
        ${fullHtml}
      </body>
    </html>
  `)
  doc.close()

  setTimeout(() => {
    iframe?.contentWindow?.focus()
    iframe?.contentWindow?.print()
  }, 150)
}

/**
 * Thực hiện in hóa đơn ra máy in qua iframe ẩn
 */
export function printReceipt(
  order: PrintableOrder,
  customSettings?: PrinterSettings,
  isPreBill: boolean = false
): void {
  const settings = customSettings || printerService.getSettings()
  const copies = isPreBill ? 1 : Math.max(1, settings.numberOfCopies || 1)
  const useCompactBar = settings.barPrintCompact !== false

  let fullHtml = ''
  for (let i = 1; i <= copies; i++) {
    if (i > 1 && useCompactBar) {
      fullHtml += generateBarReceiptHtml(order, settings)
    } else {
      const copyLabel = copies > 1 ? 'Liên 1: Khách hàng' : undefined
      fullHtml += generateReceiptHtml(order, settings, isPreBill, copyLabel)
    }
    if (i < copies) {
      fullHtml += '<div style="page-break-after: always; height: 16px; border-bottom: 2px dashed #999; margin: 16px 0;"></div>'
    }
  }

  sendHtmlToPrintIframe(fullHtml, `${isPreBill ? 'Tam_Tinh' : 'Hoa_Don'}_${order.invoice_number || 'bill'}`)
}

/**
 * In riêng phiếu cho Quầy Pha Chế (Bar) - mẫu gọn tiết kiệm giấy
 */
export function printBarTicket(
  order: PrintableOrder,
  customSettings?: PrinterSettings
): void {
  const settings = customSettings || printerService.getSettings()
  const html = generateBarReceiptHtml(order, settings)
  sendHtmlToPrintIframe(html, `Bar_${order.invoice_number || 'bill'}`)
}

/**
 * Sinh mã HTML cho Phiếu Mã Hóa Đơn mini (thay thẻ bàn) - siêu gọn tiết kiệm giấy (~2-3cm)
 */
export function generatePickupSlipHtml(
  order: PrintableOrder,
  settings: PrinterSettings
): string {
  const isK58 = settings.paperSize === 'K58'
  const paperWidth = isK58 ? '48mm' : '70mm'
  const codeSize = isK58 ? '20px' : '24px'
  const metaSize = isK58 ? '9.5px' : '10.5px'
  const shortCode = getShortInvoiceCode(order.invoice_number)
  const timeIn = formatTimeOnly(order.created_at)

  return `
    <div class="receipt" style="
      width: ${paperWidth};
      max-width: ${paperWidth};
      margin: 0 auto;
      font-family: Arial, 'Segoe UI', Tahoma, Helvetica, sans-serif;
      color: #000;
      background: #fff;
      padding: 4px 1.5mm 6px 1.5mm;
      box-sizing: border-box;
      text-align: center;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
    ">
      <div style="font-size: ${metaSize}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">
        ${escapeHtml(settings.shopName || 'FUHA CAFE')} · SỐ PHIẾU
      </div>
      <div style="font-size: ${codeSize}; font-weight: 900; letter-spacing: 1px; margin: 2px 0; line-height: 1.1;">
        ${escapeHtml(shortCode)}
      </div>
      <div style="font-size: ${metaSize}; color: #000;">
        Mã: ${escapeHtml(order.invoice_number || '--')} · ${escapeHtml(timeIn)}
      </div>
    </div>
  `
}

export function printPickupSlip(
  order: PrintableOrder,
  customSettings?: PrinterSettings
): void {
  const settings = customSettings || printerService.getSettings()
  const html = generatePickupSlipHtml(order, settings)
  sendHtmlToPrintIframe(html, `SoPhieu_${order.invoice_number || 'bill'}`)
}

/**
 * In tự động khi thanh toán dựa trên cấu hình máy in + tùy chọn "In thêm bill khách"
 */
export function printAutoOnPay(
  order: PrintableOrder,
  customSettings?: PrinterSettings,
  includeCustomerBill: boolean = false
): void {
  const settings = customSettings || printerService.getSettings()
  if (!settings.autoPrintOnPay && !includeCustomerBill) return

  const target = settings.autoPrintTarget || 'BAR_ONLY'
  const useCompactBar = settings.barPrintCompact !== false
  const pages: string[] = []

  const wantCustomer =
    includeCustomerBill ||
    (settings.autoPrintOnPay && (target === 'CUSTOMER_ONLY' || target === 'CUSTOMER_AND_BAR'))
  const wantBar =
    settings.autoPrintOnPay && (target === 'BAR_ONLY' || target === 'CUSTOMER_AND_BAR')
  const wantPickup = settings.autoPrintOnPay && Boolean(settings.printPickupSlip)

  if (wantCustomer) {
    pages.push(generateReceiptHtml(order, settings, false, wantBar ? 'Liên 1: Khách hàng' : undefined))
  }
  if (wantBar) {
    pages.push(
      useCompactBar
        ? generateBarReceiptHtml(order, settings)
        : generateReceiptHtml(order, settings, false, 'Liên 2: Quầy pha chế')
    )
  }
  if (wantPickup) {
    pages.push(generatePickupSlipHtml(order, settings))
  }

  if (pages.length === 0) return

  const fullHtml = pages.join(
    '<div style="page-break-after: always; height: 14px; border-bottom: 2px dashed #999; margin: 12px 0;"></div>'
  )
  sendHtmlToPrintIframe(fullHtml, `Hoa_Don_${order.invoice_number || 'bill'}`)
}

/**
 * Đơn hàng mẫu dùng để xem trước và in thử
 */
export const SAMPLE_PRINT_ORDER: PrintableOrder = {
  invoice_number: 'INV-SAMPLE-01',
  table_name: 'Bàn 01',
  cashier_name: 'Thu ngân 1',
  created_at: new Date().toISOString(),
  items: [
    { product_name: 'Cà phê nâu', quantity: 2, unit_price: 30000, subtotal: 60000, note: '+ Trân châu (+5.000)' },
    { product_name: 'Bạc xỉu', quantity: 1, unit_price: 35000, subtotal: 35000, note: 'Ít ngọt • Nhiều sữa' },
    { product_name: 'Trà đào cam sả', quantity: 1, unit_price: 35000, subtotal: 35000, note: '+ Đào miếng (+8.000) • 50% Đá' },
    { product_name: 'Khô gà lá chanh', quantity: 1, unit_price: 30000, subtotal: 30000 },
  ],
  subtotal: 160000,
  discount: 10000,
  total: 150000,
  payment_method: 'CASH',
}
