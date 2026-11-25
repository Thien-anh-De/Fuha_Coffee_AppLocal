import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

interface ZoomContextType {
  zoomFactor: number
  zoomPercent: number
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  setZoom: (factor: number) => void
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined)

const STORAGE_KEY = 'fuha_pos_zoom_level'
const MIN_ZOOM = 0.75 // 75%
const MAX_ZOOM = 1.50 // 150%
const STEP = 0.05     // 5% per step for smooth scaling

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoomFactor, setZoomFactorState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const val = parseFloat(saved)
        if (!isNaN(val) && val >= MIN_ZOOM && val <= MAX_ZOOM) {
          return Math.round(val * 100) / 100
        }
      }
    } catch (_) {}
    return 1.0
  })

  const [indicatorText, setIndicatorText] = useState<string | null>(null)

  // Apply zoom factor to environment (Electron native or Web document style)
  const applyZoom = useCallback((factor: number, showToast = false) => {
    const clamped = Math.min(Math.max(Math.round(factor * 100) / 100, MIN_ZOOM), MAX_ZOOM)
    setZoomFactorState(clamped)
    try {
      localStorage.setItem(STORAGE_KEY, clamped.toString())
    } catch (_) {}

    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.isElectron

    if (isElectron) {
      // In Electron: set native Chromium zoom factor
      try {
        ;(window as any).electronAPI.invoke('app:setZoomFactor', clamped)
      } catch (err) {
        console.error('Failed to set Electron zoom:', err)
      }
    } else {
      // In Web / Edge App mode: apply via CSS zoom on root HTML element
      try {
        ;(document.documentElement.style as any).zoom = clamped.toString()
      } catch (err) {
        console.error('Failed to set Web zoom:', err)
      }
    }

    if (showToast) {
      const pct = Math.round(clamped * 100)
      setIndicatorText(`Tỉ lệ: ${pct}%`)
    }
  }, [])

  // Auto clear indicator after 1.5s
  useEffect(() => {
    if (!indicatorText) return
    const timer = setTimeout(() => setIndicatorText(null), 1500)
    return () => clearTimeout(timer)
  }, [indicatorText])

  // Sync initial zoom on mount
  useEffect(() => {
    applyZoom(zoomFactor, false)

    // Listen to zoom changed from Electron main process
    const isElectron = typeof window !== 'undefined' && !!(window as any).electronAPI?.on
    if (isElectron) {
      const cleanup = (window as any).electronAPI.on('app:zoom-changed', (factor: number) => {
        const clamped = Math.min(Math.max(Math.round(factor * 100) / 100, MIN_ZOOM), MAX_ZOOM)
        setZoomFactorState(clamped)
        try {
          localStorage.setItem(STORAGE_KEY, clamped.toString())
        } catch (_) {}
        setIndicatorText(`Tỉ lệ: ${Math.round(clamped * 100)}%`)
      })
      return () => {
        if (typeof cleanup === 'function') cleanup()
      }
    }
  }, [applyZoom, zoomFactor])

  const zoomIn = useCallback(() => {
    setZoomFactorState((prev) => {
      const next = Math.min(Math.round((prev + STEP) * 100) / 100, MAX_ZOOM)
      applyZoom(next, true)
      return next
    })
  }, [applyZoom])

  const zoomOut = useCallback(() => {
    setZoomFactorState((prev) => {
      const next = Math.max(Math.round((prev - STEP) * 100) / 100, MIN_ZOOM)
      applyZoom(next, true)
      return next
    })
  }, [applyZoom])

  const resetZoom = useCallback(() => {
    applyZoom(1.0, true)
  }, [applyZoom])

  const setZoom = useCallback((factor: number) => {
    applyZoom(factor, true)
  }, [applyZoom])

  // Global keyboard shortcuts & mouse wheel zoom listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Zoom in: Ctrl + (+ / = / NumpadAdd)
        if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd' || e.code === 'Equal') {
          e.preventDefault()
          zoomIn()
        }
        // Zoom out: Ctrl + (- / _ / NumpadSubtract / Minus)
        else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract' || e.code === 'Minus') {
          e.preventDefault()
          zoomOut()
        }
        // Reset zoom: Ctrl + 0
        else if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault()
          resetZoom()
        }
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        if (e.deltaY < 0) {
          zoomIn()
        } else if (e.deltaY > 0) {
          zoomOut()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('wheel', handleWheel)
    }
  }, [zoomIn, zoomOut, resetZoom])

  return (
    <ZoomContext.Provider
      value={{
        zoomFactor,
        zoomPercent: Math.round(zoomFactor * 100),
        zoomIn,
        zoomOut,
        resetZoom,
        setZoom,
      }}
    >
      {children}

      {/* Floating HUD Indicator on Zoom Action */}
      {indicatorText && (
        <div
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.88)',
            color: '#ffffff',
            padding: '0.45rem 0.9rem',
            borderRadius: '999px',
            fontSize: '0.8125rem',
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backdropFilter: 'blur(8px)',
            animation: 'fadeIn 0.15s ease-out',
          }}
        >
          <span>🔍</span>
          <span>{indicatorText}</span>
          <span style={{ fontSize: '0.65rem', opacity: 0.75, marginLeft: '0.25rem' }}>
            (Ctrl 0 để đặt lại)
          </span>
        </div>
      )}
    </ZoomContext.Provider>
  )
}

export function useZoom() {
  const context = useContext(ZoomContext)
  if (!context) {
    throw new Error('useZoom must be used within a ZoomProvider')
  }
  return context
}
