import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { callDb } from '@/services/localDatabase'
import type { Profile, UserRole } from '@/types'

interface SimpleUser {
  id: string
  email?: string
}

interface SimpleSession {
  access_token: string
  user: SimpleUser
}

interface AuthState {
  user: SimpleUser | null
  session: SimpleSession | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  hasRole: (...roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthState | undefined>(undefined)

const STORAGE_KEY = 'fuha_pos_offline_auth'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SimpleUser | null>(null)
  const [session, setSession] = useState<SimpleSession | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Khôi phục phiên đăng nhập từ localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('molliee_pos_offline_auth')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.profile && parsed.user) {
          setUser(parsed.user)
          setSession(parsed.session || { access_token: 'local-session', user: parsed.user })
          setProfile(parsed.profile)

          // Cập nhật profile mới nhất từ DB; nếu tài khoản không còn tồn tại trong DB hiện tại thì đăng xuất để tránh lỗi FOREIGN KEY
          callDb('getProfile', parsed.user.id).then((freshProfile) => {
            if (freshProfile) {
              setProfile(freshProfile)
              localStorage.setItem(STORAGE_KEY, JSON.stringify({
                user: parsed.user,
                session: parsed.session,
                profile: freshProfile,
              }))
            } else {
              localStorage.removeItem(STORAGE_KEY)
              setUser(null)
              setSession(null)
              setProfile(null)
            }
          }).catch(() => {})
        }
      }
    } catch (e) {
      console.error('Lỗi nạp phiên đăng nhập offline:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const signIn = async (email: string, password: string) => {
    try {
      const res = await callDb('login', email.trim().toLowerCase(), password)
      if (res.error || !res.profile) {
        return { error: res.error || 'Email hoặc mật khẩu không chính xác' }
      }

      setUser(res.user)
      setSession(res.session)
      setProfile(res.profile)

      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        user: res.user,
        session: res.session,
        profile: res.profile,
      }))

      return { error: null }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xác thực hệ thống'
      return { error: msg }
    }
  }

  const signOut = async () => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
    setSession(null)
    setProfile(null)
  }

  const hasRole = (...roles: UserRole[]) => {
    if (!profile) return false
    return roles.includes(profile.role)
  }

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signIn, signOut, hasRole }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
