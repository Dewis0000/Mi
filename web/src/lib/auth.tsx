import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DEMO } from './env'
import { api, hasSession, refreshSession, setAccessToken, subscribeAuth, type AuthResponse } from './api'
import type { User } from './types'

type AuthState = {
  user: User | null
  ready: boolean
  signIn: (data: AuthResponse) => void
  signOut: () => Promise<void>
  setUser: (u: User) => void
  can: (perm: string) => boolean
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const qc = useQueryClient()

  useEffect(() => {
    subscribeAuth((data) => setUser(data?.user ?? null))
    // восстановление сессии по refresh-cookie; если API на том же домене и маркера сессии нет —
    // посетитель анонимный, лишний запрос не нужен
    const sameOrigin = !import.meta.env.VITE_API_URL
    if (!DEMO && sameOrigin && !document.cookie.split('; ').includes('hs=1')) setReady(true)
    else refreshSession().finally(() => setReady(true))
    // продлеваем access-токен заранее, пока вкладка открыта
    const t = setInterval(() => hasSession() && refreshSession(), 12 * 60_000)
    return () => clearInterval(t)
  }, [])

  const signIn = useCallback((data: AuthResponse) => {
    setAccessToken(data.accessToken)
    setUser(data.user)
  }, [])

  const signOut = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null)
    setAccessToken(null)
    setUser(null)
    qc.clear()
  }, [qc])

  const value = useMemo<AuthState>(
    () => ({ user, ready, signIn, signOut, setUser, can: (p) => !!user?.permissions.includes(p) }),
    [user, ready, signIn, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}
