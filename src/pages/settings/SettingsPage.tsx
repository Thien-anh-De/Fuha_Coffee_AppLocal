import { useState, useEffect } from 'react'
import { callDb } from '@/services/localDatabase'
import {
  Database,
  Save,
  Download,
  RotateCcw,
  Store,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  FileCheck,
  Clock,
  ShieldCheck,
  Trash2,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react'
import { useZoom } from '@/hooks/useZoom'

interface BackupItem {
  filename: string
  size: number
  createdAt: string
}

export default function SettingsPage() {
  const { zoomPercent, zoomFactor, setZoom, zoomIn, zoomOut, resetZoom } = useZoom()
  const [shopName, setShopName] = useState('FUHA CAFE')
  const [shopAddress, setShopAddress] = useState('Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ')
  const [shopPhone, setShopPhone] = useState('0985162004')
  const [wifiPass, setWifiPass] = useState('Hanu2026')

  const [backups, setBackups] = useState<BackupItem[]>([])
  const [dataInfo, setDataInfo] = useState<{ dbPath: string; dataDir: string; backupDir: string; size: number } | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSettings()
    loadBackups()
    loadDataInfo()
  }, [])

  const loadDataInfo = async () => {
    try {
      const info = await callDb('getDataInfo')
      setDataInfo(info)
    } catch (_) {}
  }

  const handleOpenFolder = async () => {
    try {
      await callDb('openDataFolder')
    } catch (e: any) {
      alert('Đường dẫn thư mục: ' + (dataInfo?.dataDir || ''))
    }
  }

  const loadSettings = async () => {
    try {
      const s = await callDb('getSettings')
      if (s) {
        if (s.shop_name) setShopName(s.shop_name)
        if (s.shop_address) {
          if (s.shop_address.includes('123 Đường') || s.shop_address === 'Căng tin HANU' || !s.shop_address.includes('Đại Mỗ')) {
            setShopAddress('Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ')
          } else {
            setShopAddress(s.shop_address)
          }
        }
        if (s.shop_phone) {
          if (s.shop_phone.includes('0901 234') || s.shop_phone.includes('0901 994')) {
            setShopPhone('0985162004')
          } else {
            setShopPhone(s.shop_phone)
          }
        }
        if (s.wifi_pass) {
          if (s.wifi_pass === '0985162004' || s.wifi_pass.includes('Molliee') || !s.wifi_pass.includes('Hanu2026')) {
            setWifiPass('Hanu2026')
          } else {
            setWifiPass(s.wifi_pass)
          }
        }
      }
    } catch (err) {
      console.error('Lỗi nạp cấu hình:', err)
    }
  }

  const loadBackups = async () => {
    try {
      const list = await callDb<BackupItem[]>('listBackups')
      setBackups(list || [])
    } catch (err) {
      console.error('Lỗi nạp danh sách backup:', err)
    }
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setMessage(null)
    try {
      await callDb('saveSetting', 'shop_name', shopName)
      await callDb('saveSetting', 'shop_address', shopAddress)
      await callDb('saveSetting', 'shop_phone', shopPhone)
      await callDb('saveSetting', 'wifi_pass', wifiPass)
      
      // Cũng đồng bộ sang localStorage cho printerService
      try {
        const pSettings = JSON.parse(localStorage.getItem('pos_fuha_printer_settings') || localStorage.getItem('pos_molliee_printer_settings') || '{}')
        pSettings.shopName = shopName
        pSettings.shopAddress = shopAddress
        pSettings.shopPhone = shopPhone
        pSettings.wifi = wifiPass.toLowerCase().includes('wifi') ? wifiPass : `Wifi: HANU COFFEE - Pass: ${wifiPass}`
        localStorage.setItem('pos_fuha_printer_settings', JSON.stringify(pSettings))
      } catch (_) {}

      setMessage({ type: 'success', text: 'Đã lưu thông tin cửa hàng thành công!' })
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi lưu cấu hình' })
    } finally {
      setSavingSettings(false)
    }
  }

  const handleCreateBackup = async () => {
    setCreatingBackup(true)
    setMessage(null)
    try {
      const res = await callDb('createBackup')
      setMessage({ type: 'success', text: `Đã tạo bản sao lưu an toàn: ${res.filename}` })
      await loadBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi sao lưu dữ liệu' })
    } finally {
      setCreatingBackup(false)
    }
  }

  const handleRestore = async (filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn khôi phục dữ liệu từ file '${filename}'? Hệ thống sẽ tự động tạo một bản sao lưu an toàn trước khi khôi phục.`)) {
      return
    }
    setMessage(null)
    try {
      await callDb('restoreBackup', filename)
      setMessage({ type: 'success', text: `Khôi phục thành công từ file '${filename}'! Hãy tải lại trang để xem số liệu mới.` })
      await loadBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khôi phục dữ liệu' })
    }
  }

  const handleCleanTestData = async () => {
    if (!window.confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ đơn hàng test, hóa đơn và lịch sử thanh toán về 0 (chuẩn bị cho ngày khai trương). Thực đơn món, giá bán và tài khoản nhân viên vẫn được giữ nguyên. Hệ thống sẽ tự động sao lưu 1 bản dự phòng trước khi xóa. Bạn có chắc chắn không?')) {
      return
    }
    setMessage(null)
    try {
      await callDb('cleanTestData')
      setMessage({ type: 'success', text: 'Đã dọn dẹp sạch toàn bộ đơn hàng test! Doanh thu và hóa đơn đã về 0.' })
      await loadBackups()
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Lỗi khi dọn dẹp dữ liệu test' })
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-coffee-800)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <Database className="text-primary" size={28} />
          Cài Đặt & Cơ Sở Dữ Liệu Offline
        </h1>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Quản lý thông tin quán in trên bill và sao lưu cơ sở dữ liệu SQLite an toàn tại máy thu ngân.
        </p>
      </div>

      {/* Thông báo */}
      {message && (
        <div
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: message.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          }}
        >
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{message.text}</span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
        {/* Cột 1: Thông tin quán */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
            <Store size={22} className="text-primary" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Thông Tin Cửa Hàng</h2>
          </div>

          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Tên quán (In trên đầu hóa đơn):
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="FUHA CAFE"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Địa chỉ:
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Trường ĐH Hà Nội, Km9 Nguyễn Trãi, Đại Mỗ"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Số điện thoại liên hệ:
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
                placeholder="0985162004"
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.375rem' }}>
                Mật khẩu WiFi (in trên chân hóa đơn):
              </label>
              <input
                type="text"
                className="input"
                style={{ width: '100%' }}
                value={wifiPass}
                onChange={(e) => setWifiPass(e.target.value)}
                placeholder="Hanu2026"
              />
            </div>

            <div style={{ marginTop: '0.5rem' }}>
              <button type="submit" className="btn btn-primary" disabled={savingSettings} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Save size={18} />
                {savingSettings ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </form>
        </div>

        {/* Cột 2: Cài đặt hiển thị & Trạng thái sao lưu */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Cài đặt Tỉ lệ hiển thị (Zoom) */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <Maximize2 size={22} className="text-primary" />
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Tỉ Lệ Màn Hình (Zoom)</h2>
              </div>
              <span className="badge badge-coffee" style={{ fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}>
                Hiện tại: {zoomPercent}%
              </span>
            </div>

            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Điều chỉnh kích thước chữ và giao diện để phù hợp nhất với kích cỡ màn hình máy POS của bạn.
            </p>

            {/* Presets */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
              {[
                { label: '80%', factor: 0.8 },
                { label: '90%', factor: 0.9 },
                { label: '100%', factor: 1.0 },
                { label: '110%', factor: 1.1 },
                { label: '120%', factor: 1.2 },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setZoom(p.factor)}
                  className={`btn ${Math.round(zoomFactor * 100) === Math.round(p.factor * 100) ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                  style={{ padding: '0.4rem 0.25rem', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Manual nudge buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={zoomOut}
                style={{ flex: 1, gap: '0.375rem' }}
              >
                <ZoomOut size={15} />
                Thu nhỏ (-5%)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={resetZoom}
                style={{ flex: 1 }}
              >
                Mặc định (100%)
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={zoomIn}
                style={{ flex: 1, gap: '0.375rem' }}
              >
                <ZoomIn size={15} />
                Phóng to (+5%)
              </button>
            </div>

            {/* Phím tắt gợi ý */}
            <div style={{ marginTop: '0.875rem', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              💡 <strong>Phím tắt nhanh:</strong> Bấm <kbd style={{ padding: '1px 5px', background: '#e2e8f0', borderRadius: 3 }}>Ctrl +</kbd> để phóng to, <kbd style={{ padding: '1px 5px', background: '#e2e8f0', borderRadius: 3 }}>Ctrl -</kbd> để thu nhỏ, <kbd style={{ padding: '1px 5px', background: '#e2e8f0', borderRadius: 3 }}>Ctrl 0</kbd> để về mặc định, hoặc giữ <kbd style={{ padding: '1px 5px', background: '#e2e8f0', borderRadius: 3 }}>Ctrl</kbd> + cuộn chuột.
            </div>
          </div>

          {/* Trạng thái hệ thống */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem' }}>
              <ShieldCheck size={22} style={{ color: '#10b981' }} />
              <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Trạng Thái Vận Hành Offline</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px dashed var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Cơ chế lưu trữ:</span>
                <span style={{ fontWeight: 600, color: '#10b981' }}>SQLite Local (WAL Mode)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px dashed var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Kết nối Internet:</span>
                <span style={{ fontWeight: 600, color: '#10b981' }}>Không cần Internet (100% Offline)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px dashed var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Tự động sao lưu:</span>
                <span style={{ fontWeight: 600, color: 'var(--color-coffee-800)' }}>Mỗi khi tắt phần mềm</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', padding: '0.5rem 0' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Vị trí file dữ liệu trên máy:</span>
                <code style={{ fontSize: '0.75rem', padding: '0.375rem 0.5rem', background: '#f1f5f9', borderRadius: '4px', wordBreak: 'break-all', color: '#0f172a' }}>
                  {dataInfo?.dbPath || 'data/fuha-pos.db'}
                </code>
              </div>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={handleOpenFolder}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <HardDrive size={16} />
                Mở thư mục chứa dữ liệu trong Windows
              </button>
            </div>
          </div>

          {/* Nút hành động sao lưu nhanh */}
          <div className="card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(236, 72, 153, 0.05))' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>Sao Lưu Cơ Sở Dữ Liệu Tức Thì</h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
              Tạo bản sao lưu đầy đủ toàn bộ thực đơn, tài khoản và lịch sử hóa đơn ra thư mục an toàn.
            </p>
            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center' }}
            >
              <Download size={18} />
              {creatingBackup ? 'Đang tạo bản sao lưu...' : 'Tạo bản sao lưu ngay (.db)'}
            </button>
          </div>

          {/* Nút dọn dẹp đơn test */}
          <div className="card" style={{ padding: '1.25rem', border: '1px dashed #f87171', background: '#fff5f5' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#991b1b', margin: '0 0 0.25rem 0' }}>Dọn Dẹp Đơn Hàng Test</h3>
            <p style={{ fontSize: '0.8rem', color: '#7f1d1d', marginBottom: '0.75rem' }}>
              Xóa toàn bộ đơn test, hóa đơn và doanh thu về 0 trước khi khai trương. Thực đơn và tài khoản được giữ nguyên.
            </p>
            <button
              type="button"
              onClick={handleCleanTestData}
              className="btn btn-sm"
              style={{ background: '#dc2626', color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', justifyContent: 'center' }}
            >
              <Trash2 size={16} />
              Xóa sạch đơn hàng test về 0
            </button>
          </div>
        </div>
      </div>

      {/* Danh sách các bản sao lưu */}
      <div className="card" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <HardDrive size={22} className="text-primary" />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, margin: 0 }}>Lịch Sử Các Bản Sao Lưu Đã Lưu Trữ</h2>
          </div>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
            Lưu tối đa 30 bản sao lưu gần nhất
          </span>
        </div>

        {backups.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
            <FileCheck size={40} style={{ opacity: 0.3, margin: '0 auto 0.75rem auto' }} />
            <div>Chưa có bản sao lưu nào. Hãy bấm "Tạo bản sao lưu ngay" ở trên.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Tên File Backup</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Dung lượng</th>
                  <th style={{ textAlign: 'left', padding: '0.75rem' }}>Thời gian tạo</th>
                  <th style={{ textAlign: 'right', padding: '0.75rem' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Database size={16} className="text-primary" />
                      {b.filename}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {formatBytes(b.size)}
                    </td>
                    <td style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Clock size={14} />
                        {new Date(b.createdAt).toLocaleString('vi-VN')}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <button
                        onClick={() => handleRestore(b.filename)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: '#d97706', display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}
                        title="Khôi phục dữ liệu từ bản này"
                      >
                        <RotateCcw size={15} />
                        Khôi phục
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
