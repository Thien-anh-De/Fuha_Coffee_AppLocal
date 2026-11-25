// ============================================================
// POS 1994 Coffee — Printer Settings Service
// Manages thermal printer configuration via localStorage
// ============================================================

export interface PrinterSettings {
  paperSize: 'K80' | 'K58'
  fontScale?: 'compact' | 'standard' | 'large'
  shopName: string
  shopAddress: string
  shopPhone: string
  wifi: string
  footerMessage: string
  autoPrintOnPay: boolean
  printPreBill: boolean
  numberOfCopies: number
}

export const DEFAULT_PRINTER_SETTINGS: PrinterSettings = {
  paperSize: 'K80',
  fontScale: 'standard',
  shopName: 'FUHA CAFE',
  shopAddress: 'Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ',
  shopPhone: '0985162004',
  wifi: 'Wifi: HANU COFFEE - Pass: Hanu2026',
  footerMessage: 'Cảm ơn Quý khách & Hẹn gặp lại!',
  autoPrintOnPay: true,
  printPreBill: true,
  numberOfCopies: 1,
}

const STORAGE_KEY = 'pos_fuha_printer_settings'

export const printerService = {
  getSettings(): PrinterSettings {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('pos_molliee_printer_settings')
      if (stored) {
        const parsed = JSON.parse(stored)
        // Tự động nâng cấp địa chỉ/sđt/wifi nếu còn dùng mẫu thử cũ
        if (!parsed.shopAddress || parsed.shopAddress.includes('123 Đường') || parsed.shopAddress.includes('Căng tin HANU') || !parsed.shopAddress.includes('Đại Mỗ')) {
          parsed.shopAddress = DEFAULT_PRINTER_SETTINGS.shopAddress
        }
        if (!parsed.shopPhone || parsed.shopPhone.includes('0901 994') || parsed.shopPhone.includes('0901 234')) {
          parsed.shopPhone = DEFAULT_PRINTER_SETTINGS.shopPhone
        }
        if (!parsed.wifi || parsed.wifi.includes('Căng tin HANU') || parsed.wifi.includes('0985162004') || parsed.wifi.includes('Molliee') || !parsed.wifi.includes('Hanu2026')) {
          parsed.wifi = DEFAULT_PRINTER_SETTINGS.wifi
        }
        return { ...DEFAULT_PRINTER_SETTINGS, ...parsed }
      }
    } catch {
      // ignore parse errors
    }
    return { ...DEFAULT_PRINTER_SETTINGS }
  },

  saveSettings(settings: PrinterSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  },

  resetSettings(): PrinterSettings {
    localStorage.removeItem(STORAGE_KEY)
    return { ...DEFAULT_PRINTER_SETTINGS }
  },
}
