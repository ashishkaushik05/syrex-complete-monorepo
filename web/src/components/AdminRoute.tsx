import { Loader2 } from 'lucide-react'
import { Navigate } from 'react-router-dom'

import { useAuth } from '@/hooks/useAuth'

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { authQuery, isAuthenticated, user, permissions } = useAuth()

  if (authQuery.isLoading) return <FullScreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.userType !== 'internal') return <Navigate to="/forbidden" replace />
  if (permissions.length === 0) return <Navigate to="/forbidden" replace />

  return <>{children}</>
}
