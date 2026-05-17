import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

export function ForbiddenPage() {
  const navigate = useNavigate()
  const { logoutMutation } = useAuth()

  const onSignOut = async () => {
    try {
      await logoutMutation.mutateAsync()
    } finally {
      navigate('/login')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-center">
      <div className="w-full max-w-md">
        <p className="text-8xl font-semibold tracking-tight text-slate-700">403</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Access Denied</h1>
        <p className="mt-3 text-sm text-slate-300">
          This dashboard is for internal staff only.
        </p>
        <Button
          variant="outline"
          className="mt-8 border-slate-700 bg-transparent text-white hover:bg-slate-800"
          onClick={onSignOut}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? 'Signing Out...' : 'Sign Out'}
        </Button>
      </div>
    </div>
  )
}
