import { useMemo } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Loader2, MailCheck, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'

export function InvitationAcceptPage() {
  const [searchParams] = useSearchParams()
  const { authQuery, isAuthenticated } = useAuth()

  const token = useMemo(
    () => searchParams.get('token') ?? searchParams.get('inviteToken') ?? '',
    [searchParams],
  )

  if (authQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      <Card className="w-full max-w-md border-slate-700 bg-white shadow-2xl">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white">
            <MailCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
            Accept Invitation
          </CardTitle>
          <p className="text-sm text-slate-500">Invitation acceptance is not enabled in Phase 1.</p>
        </CardHeader>
        <CardContent>
          {!token ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="mb-2 flex items-center gap-2 font-medium">
                <ShieldAlert className="h-4 w-4" />
                Invalid invite link
              </div>
              <p>Token is missing. Open the invite URL exactly as received.</p>
              <Link to="/login" className="mt-3 inline-block text-slate-700 underline">
                Back to sign in
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                Ask an administrator to activate your account, then sign in from the login page.
              </div>
              <Link to="/login">
                <Button className="w-full">Back to sign in</Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
