import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { initDatabase, dbService } from './database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow = null

function getDbPath() {
  if (app.isPackaged) {
    const userDir = app.getPath('userData')
    const userDbPath = path.join(userDir, 'fuha-pos.db')
    const oldLocalDbPath = path.join(path.dirname(process.execPath), 'data', 'fuha-pos.db')
    
    // Nếu chưa có ở AppData nhưng lại tồn tại ở thư mục cài đặt cũ, thì copy sang
    if (!fs.existsSync(userDbPath) && fs.existsSync(oldLocalDbPath)) {
      try {
        fs.copyFileSync(oldLocalDbPath, userDbPath)
        console.log('[FuHa Cafe POS] Đã di chuyển dữ liệu từ thư mục cài đặt sang AppData.')
      } catch (err) {
        console.error('[FuHa Cafe POS] Không thể di chuyển dữ liệu cũ:', err)
      }
    }
    return userDbPath
  }

  // Khi chạy dev (npm run dev) thì lưu ở thư mục code
  const localDataDir = path.join(process.cwd(), 'data')
  if (!fs.existsSync(localDataDir)) fs.mkdirSync(localDataDir, { recursive: true })
  return path.join(localDataDir, 'fuha-pos.db')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'FuHa Cafe POS - Hệ Thống Bán Hàng (Bản Offline)',
    icon: path.join(__dirname, '../public/favicon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
    show: false,
  })

  mainWindow.maximize()
  mainWindow.show()

  // Xử lý phím tắt Zoom toàn cục trong Electron: Ctrl + (+), Ctrl + (-), Ctrl + 0
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.control || input.meta) {
      // Zoom In: Ctrl + '=', Ctrl + '+', NumpadAdd
      if (input.key === '=' || input.key === '+' || input.code === 'NumpadAdd' || input.code === 'Equal') {
        event.preventDefault()
        const currentZoom = mainWindow.webContents.getZoomFactor()
        const nextZoom = Math.min(Math.round((currentZoom + 0.1) * 10) / 10, 1.5)
        mainWindow.webContents.setZoomFactor(nextZoom)
        mainWindow.webContents.send('app:zoom-changed', nextZoom)
      }
      // Zoom Out: Ctrl + '-', NumpadSubtract, Minus
      else if (input.key === '-' || input.key === '_' || input.code === 'NumpadSubtract' || input.code === 'Minus') {
        event.preventDefault()
        const currentZoom = mainWindow.webContents.getZoomFactor()
        const nextZoom = Math.max(Math.round((currentZoom - 0.1) * 10) / 10, 0.7)
        mainWindow.webContents.setZoomFactor(nextZoom)
        mainWindow.webContents.send('app:zoom-changed', nextZoom)
      }
      // Reset Zoom: Ctrl + '0', Numpad0
      else if (input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0') {
        event.preventDefault()
        mainWindow.webContents.setZoomFactor(1.0)
        mainWindow.webContents.send('app:zoom-changed', 1.0)
      }
    }
  })

  // Xử lý nạp trang
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5174'

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(devServerUrl)
  } else if (isDev && !process.env.VITE_DEV_SERVER_URL) {
    // Thử load dev URL nếu đang chạy dev, nếu không fallback sang dist
    mainWindow.loadURL(devServerUrl).catch(() => {
      const distPath = path.join(__dirname, '../dist/index.html')
      if (fs.existsSync(distPath)) {
        mainWindow.loadFile(distPath)
      }
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// Khởi động Database & IPC handlers
app.whenReady().then(() => {
  const dbPath = getDbPath()
  console.log('[FuHa Cafe POS] Khởi tạo Database tại:', dbPath)
  initDatabase(dbPath)

  // IPC Handler cho tất cả database operations
  ipcMain.handle('db:call', async (event, { method, args = [] }) => {
    try {
      if (typeof dbService[method] !== 'function') {
        throw new Error(`Database method '${method}' không tồn tại.`)
      }
      const result = await dbService[method](...args)
      return { data: result, error: null }
    } catch (err) {
      console.error(`[DB IPC Error] ${method}:`, err)
      return { data: null, error: err.message || 'Lỗi cơ sở dữ liệu' }
    }
  })

  // IPC Handler cho in ấn hoặc hộp thoại
  ipcMain.handle('app:print', async (event, options = {}) => {
    if (!mainWindow) return { success: false }
    return new Promise((resolve) => {
      mainWindow.webContents.print(options, (success, failureReason) => {
        resolve({ success, failureReason })
      })
    })
  })

  // IPC Handler xuất PDF — dùng Electron printToPDF native
  ipcMain.handle('app:exportPDF', async (event, { filename = 'BaoCao', htmlContent }) => {
    if (!mainWindow) return { success: false, error: 'Cửa sổ không tồn tại' }
    try {
      // Mở hộp thoại lưu file
      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
        title: 'Lưu báo cáo PDF',
        defaultPath: path.join(app.getPath('documents'), `${filename}.pdf`),
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        buttonLabel: 'Lưu PDF',
      })
      if (canceled || !filePath) return { success: false, error: 'Đã hủy' }

      // Tạo cửa sổ ẩn để render HTML → PDF
      const pdfWin = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      })

      const encodedHtml = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
      await pdfWin.loadURL(encodedHtml)

      // Chờ load xong rồi print
      const pdfBuffer = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.5, bottom: 0.5, left: 0.75, right: 0.75 },
      })
      pdfWin.destroy()

      fs.writeFileSync(filePath, pdfBuffer)
      return { success: true, filePath }
    } catch (err) {
      console.error('[PDF Export Error]', err)
      return { success: false, error: err.message || 'Lỗi xuất PDF' }
    }
  })

  // IPC Handler cho Zoom Factor (Phóng to / Thu nhỏ ứng dụng)
  ipcMain.handle('app:setZoomFactor', async (event, factor) => {
    if (!mainWindow) return 1.0
    const clamped = Math.min(Math.max(Number(factor) || 1.0, 0.7), 1.5)
    mainWindow.webContents.setZoomFactor(clamped)
    return clamped
  })

  ipcMain.handle('app:getZoomFactor', async () => {
    if (!mainWindow) return 1.0
    return mainWindow.webContents.getZoomFactor()
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Tự động sao lưu dữ liệu khi tắt ứng dụng
  try {
    dbService.createBackup()
    console.log('[FuHa Cafe POS] Đã tự động tạo bản sao lưu khi đóng app.')
  } catch (err) {
    console.error('[Backup Error]', err)
  }

  if (process.platform !== 'darwin') {
    app.quit()
  }
})
