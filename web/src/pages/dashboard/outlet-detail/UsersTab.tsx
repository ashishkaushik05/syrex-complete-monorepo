import type { FormEvent } from 'react'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { timeAgo } from '@/lib/format'
import { apiErrorMessage } from '@/lib/http'
import type { OutletUserItem, OutletUserRole } from './types'

interface Props { id: string }

export function UsersTab({ id }: Props) {
  const queryClient = useQueryClient()

  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userRole] = useState<OutletUserRole>('owner')
  const [userMessage, setUserMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [resetPasswordByUserId, setResetPasswordByUserId] = useState<Record<string, string>>({})

  const outletUsersQuery = useQuery({
    queryKey: ['outlet-users', id],
    queryFn: async () => {
      const r = await api.get<{ data: OutletUserItem[] }>(`/outlets/${id}/users`)
      return r.data.data
    },
  })

  const createUserMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; role: OutletUserRole }) => {
      await api.post(`/outlets/${id}/users`, payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-users', id] })
    },
  })

  const resetUserPasswordMutation = useMutation({
    mutationFn: async (payload: { userId: string; newPassword: string }) => {
      await api.patch(`/users/${payload.userId}/password`, { newPassword: payload.newPassword })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-users', id] })
    },
  })

  const toggleUserStatusMutation = useMutation({
    mutationFn: async (payload: { userId: string; isActive: boolean }) => {
      await api.patch(`/users/${payload.userId}`, { isActive: payload.isActive })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['outlet-users', id] })
    },
  })

  const handleCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setUserMessage(null)
    try {
      await createUserMutation.mutateAsync({ name: userName.trim(), email: userEmail.trim(), password: userPassword, role: userRole })
      setUserName(''); setUserEmail(''); setUserPassword('')
      setUserMessage({ text: 'User created successfully.', type: 'success' })
    } catch (error) {
      setUserMessage({ text: apiErrorMessage(error, 'Unable to create user.'), type: 'error' })
    }
  }

  const handleResetUserPassword = async (user: OutletUserItem) => {
    const nextPassword = (resetPasswordByUserId[user.id] ?? '').trim()
    if (nextPassword.length < 6) {
      setUserMessage({ text: `Password for ${user.name} must be at least 6 characters.`, type: 'error' })
      return
    }
    setUserMessage(null)
    try {
      await resetUserPasswordMutation.mutateAsync({ userId: user.id, newPassword: nextPassword })
      setResetPasswordByUserId((prev) => ({ ...prev, [user.id]: '' }))
      setUserMessage({ text: `Password reset for ${user.name}.`, type: 'success' })
    } catch (error) {
      setUserMessage({ text: apiErrorMessage(error, `Unable to reset password for ${user.name}.`), type: 'error' })
    }
  }

  const handleToggleUserStatus = async (user: OutletUserItem) => {
    setUserMessage(null)
    try {
      await toggleUserStatusMutation.mutateAsync({ userId: user.id, isActive: !user.isActive })
      setUserMessage({
        text: `${user.name} has been ${user.isActive ? 'revoked (deactivated)' : 'reactivated'}.`,
        type: 'success',
      })
    } catch (error) {
      setUserMessage({
        text: apiErrorMessage(error, `Unable to ${user.isActive ? 'revoke' : 'reactivate'} ${user.name}.`),
        type: 'error',
      })
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current Outlet Users</CardTitle>
          <p className="text-sm text-slate-500">View all users registered under this outlet, reset passwords, and revoke/reactivate access.</p>
        </CardHeader>
        <CardContent>
          {outletUsersQuery.isLoading ? (
            <p className="py-4 text-center text-sm text-slate-500">Loading outlet users...</p>
          ) : outletUsersQuery.isError ? (
            <p className="py-4 text-center text-sm text-slate-500">Unable to load outlet users.</p>
          ) : (outletUsersQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center">
              <User className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No users registered for this outlet yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {(outletUsersQuery.data ?? []).map((user) => (
                <div key={user.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                      <p className="mt-1 text-xs text-slate-400">Role: {user.outletRole} · Created {timeAgo(user.createdAt)}</p>
                    </div>
                    <Badge className={user.isActive ? 'border-emerald-300 bg-emerald-100 text-emerald-800' : 'border-slate-300 bg-slate-200 text-slate-700'}>
                      {user.isActive ? 'Active' : 'Revoked'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
                    <Input
                      value={resetPasswordByUserId[user.id] ?? ''}
                      onChange={(e) => setResetPasswordByUserId((prev) => ({ ...prev, [user.id]: e.target.value }))}
                      placeholder="Set new password (min 6 chars)"
                      type="password"
                      minLength={6}
                    />
                    <Button type="button" variant="outline" onClick={() => handleResetUserPassword(user)} disabled={resetUserPasswordMutation.isPending}>
                      {resetUserPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
                    </Button>
                    <Button type="button" variant={user.isActive ? 'destructive' : 'default'} onClick={() => handleToggleUserStatus(user)} disabled={toggleUserStatusMutation.isPending}>
                      {toggleUserStatusMutation.isPending ? 'Updating...' : user.isActive ? 'Revoke User' : 'Reactivate User'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {userMessage ? (
        <div className={`rounded-md border px-3 py-2 text-sm ${userMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {userMessage.text}
        </div>
      ) : null}

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Create Outlet User</CardTitle>
          <p className="text-sm text-slate-500">Create a login account for the outlet owner.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateUser} className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="user-name">Full Name</Label>
              <Input id="user-name" value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="e.g. Ramesh Kumar" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-email">Email Address</Label>
              <Input id="user-email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="user@example.com" required type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="user-password">Temporary Password</Label>
              <p className="text-xs text-slate-400">Minimum 6 characters. User should change this after first login.</p>
              <Input id="user-password" value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="Set a temporary password" required minLength={6} type="password" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <p className="text-sm text-slate-600 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2">Owner — full access</p>
            </div>
            <Button type="submit" disabled={createUserMutation.isPending}>
              {createUserMutation.isPending ? 'Creating...' : 'Create User Account'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
