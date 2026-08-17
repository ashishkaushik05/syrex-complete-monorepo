import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import {
  clearSession,
  hasStoredSession,
  PORTAL_SESSION_CLEARED_EVENT,
  portalApi,
  setSession,
} from './lib/api'
import { AuthContext, type AuthContextValue, useAuth } from './auth-context'
import type { ServiceUser } from './types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ServiceUser | null>(null)
  const [loading, setLoading] = useState(hasStoredSession())

  useEffect(() => {
    const handleSessionCleared = () => setUser(null)
    window.addEventListener(PORTAL_SESSION_CLEARED_EVENT, handleSessionCleared)
    if (hasStoredSession()) {
      portalApi.me()
        .then(setUser)
        .catch(() => clearSession(true))
        .finally(() => setLoading(false))
    }
    return () => window.removeEventListener(PORTAL_SESSION_CLEARED_EVENT, handleSessionCleared)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    acceptSession(session) {
      setSession(session)
      setUser(session.user)
      setLoading(false)
    },
    async signOut() {
      try {
        await portalApi.logout()
      } finally {
        clearSession()
        setUser(null)
      }
    },
  }), [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="page-state">Checking your session...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page-state">Checking your session...</div>
  if (user) return <Navigate to="/complaints" replace />
  return children
}
