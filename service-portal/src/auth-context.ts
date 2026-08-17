import { createContext, useContext } from 'react'
import type { AuthSession, ServiceUser } from './types'

export type AuthContextValue = {
  user: ServiceUser | null
  loading: boolean
  acceptSession: (session: AuthSession) => void
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
