import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, UsersRound } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermission } from '@/context/PermissionContext'
import { api, trpcMutation } from '@/lib/api'
import { apiErrorMessage } from '@/lib/http'

type UserRecord = {
  id: string
  name: string
  email: string
  userType: 'internal' | 'outlet'
  isActive: boolean
  isFieldEnabled?: boolean
  role?: { id?: string; name?: string } | null
}

type RoleOption = {
  id: string
  name: string
}

export function UsersPage() {
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canWriteUsers = can('users:write')

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roleId, setRoleId] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [manageError, setManageError] = useState<string | null>(null)
  const [manageSuccess, setManageSuccess] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const usersQuery = useQuery({
    queryKey: ['users-page-lite'],
    queryFn: async () => {
      const response = await api.get<{ data?: UserRecord[] } | UserRecord[]>('/users')
      const payload = response.data as { data?: UserRecord[] } | UserRecord[] | undefined
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.data)) return payload.data
      return []
    },
  })

  const rolesQuery = useQuery({
    queryKey: ['roles-list'],
    queryFn: async () => {
      const response = await api.get<{ data: RoleOption[] }>('/roles')
      const payload = response.data as { data?: RoleOption[] } | RoleOption[]
      if (Array.isArray(payload)) return payload
      if (Array.isArray((payload as { data?: RoleOption[] }).data)) return (payload as { data: RoleOption[] }).data
      return []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const roles = rolesQuery.data ?? []
      const role = roles.find((r) => r.id === roleId)
      if (!role) throw new Error('Select a role')
      await api.post('/users', { name: name.trim(), email: email.trim(), password, role: role.name })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users-page-lite'] })
      setCreateOpen(false)
      resetForm()
    },
    onError: (error) => {
      setFormError(apiErrorMessage(error, 'Unable to create user.'))
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected')
      const roles = rolesQuery.data ?? []
      const role = roles.find((item) => item.id === selectedRoleId)
      if (!role) throw new Error('Select a role')
      await api.patch(`/users/${selectedUser.id}/role`, { role: role.name })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users-page-lite'] })
      setManageSuccess('Role updated successfully.')
      setManageError(null)
    },
    onError: (error) => {
      setManageError(apiErrorMessage(error, 'Unable to update role.'))
      setManageSuccess(null)
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected')
      const passwordValue = newPassword.trim()
      if (passwordValue.length < 8) throw new Error('Password must be at least 8 characters.')
      await api.patch(`/users/${selectedUser.id}/password`, { newPassword: passwordValue })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users-page-lite'] })
      setNewPassword('')
      setManageSuccess('Password reset successfully.')
      setManageError(null)
    },
    onError: (error) => {
      setManageError(apiErrorMessage(error, 'Unable to reset password.'))
      setManageSuccess(null)
    },
  })

  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('No user selected')
      await api.delete(`/users/${selectedUser.id}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users-page-lite'] })
      handleManageDialogChange(false)
    },
    onError: (error) => {
      setManageError(apiErrorMessage(error, 'Unable to delete user.'))
      setManageSuccess(null)
    },
  })

  const toggleFieldSenseMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!selectedUser) throw new Error('No user selected')
      await trpcMutation('users.toggleFieldSense', { id: selectedUser.id, enabled })
      return enabled
    },
    onSuccess: async (enabled) => {
      await queryClient.invalidateQueries({ queryKey: ['users-page-lite'] })
      if (selectedUser) setSelectedUser({ ...selectedUser, isFieldEnabled: enabled })
      setManageSuccess(`Field Sense ${enabled ? 'enabled' : 'disabled'}.`)
      setManageError(null)
    },
    onError: (error) => {
      setManageError(apiErrorMessage(error, 'Unable to toggle Field Sense.'))
      setManageSuccess(null)
    },
  })

  function resetForm() {
    setName('')
    setEmail('')
    setPassword('')
    setRoleId('')
    setFormError(null)
  }

  function handleOpenChange(open: boolean) {
    setCreateOpen(open)
    if (!open) resetForm()
  }

  function openManageDialog(user: UserRecord) {
    setSelectedUser(user)
    setSelectedRoleId(user.role?.id ?? '')
    setNewPassword('')
    setManageError(null)
    setManageSuccess(null)
    setManageOpen(true)
  }

  function handleManageDialogChange(open: boolean) {
    setManageOpen(open)
    if (!open) {
      setSelectedUser(null)
      setSelectedRoleId('')
      setNewPassword('')
      setManageError(null)
      setManageSuccess(null)
      setDeleteConfirm(false)
    }
  }

  function submitCreate() {
    if (!name.trim()) { setFormError('Name is required.'); return }
    if (!email.trim()) { setFormError('Email is required.'); return }
    if (!password) { setFormError('Password is required.'); return }
    if (!roleId) { setFormError('Select a role.'); return }
    setFormError(null)
    createMutation.mutate()
  }

  const filteredUsers = useMemo(() => {
    const rows = usersQuery.data ?? []
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((user) => {
      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.role?.name ?? '').toLowerCase().includes(term)
      )
    })
  }, [search, usersQuery.data])

  if (usersQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UsersRound className="h-5 w-5" />
            Users
          </CardTitle>
          {canWriteUsers ? (
            <Button onClick={() => setCreateOpen(true)}>New User</Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <Input className="pl-9" placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>User Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Field Sense</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role?.name ?? '-'}</TableCell>
                  <TableCell>{user.userType}</TableCell>
                  <TableCell>{user.isActive ? 'active' : 'inactive'}</TableCell>
                  <TableCell>
                    {user.userType === 'internal' ? (
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${user.isFieldEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {user.isFieldEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openManageDialog(user)} disabled={!canWriteUsers}>
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!usersQuery.isLoading && filteredUsers.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No users found.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New User</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Full name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            >
              <option value="">Select role</option>
              {(rolesQuery.data ?? []).map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manageOpen} onOpenChange={handleManageDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-900">{selectedUser?.name ?? '-'}</p>
              <p className="text-xs text-slate-500">{selectedUser?.email ?? '-'}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Switch Role</p>
              <select
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={selectedRoleId}
                onChange={(event) => setSelectedRoleId(event.target.value)}
              >
                <option value="">Select role</option>
                {(rolesQuery.data ?? []).map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                onClick={() => updateRoleMutation.mutate()}
                disabled={!canWriteUsers || updateRoleMutation.isPending || !selectedRoleId}
              >
                {updateRoleMutation.isPending ? 'Updating...' : 'Update Role'}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Reset Password</p>
              <Input
                type="password"
                placeholder="New password (min 8 characters)"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <Button
                variant="outline"
                onClick={() => resetPasswordMutation.mutate()}
                disabled={!canWriteUsers || resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </div>
            {selectedUser?.userType === 'internal' && canWriteUsers ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Field Sense</p>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600">
                    {selectedUser.isFieldEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleFieldSenseMutation.mutate(!selectedUser.isFieldEnabled)}
                    disabled={toggleFieldSenseMutation.isPending}
                  >
                    {toggleFieldSenseMutation.isPending
                      ? 'Updating...'
                      : selectedUser.isFieldEnabled
                        ? 'Disable'
                        : 'Enable'}
                  </Button>
                </div>
              </div>
            ) : null}
            {canWriteUsers && (
              <div className="space-y-2 border-t border-slate-200 pt-3">
                <p className="text-sm font-medium text-red-700">Danger Zone</p>
                {deleteConfirm ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      This will permanently remove <strong>{selectedUser?.name}</strong>. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteUserMutation.mutate()}
                        disabled={deleteUserMutation.isPending}
                      >
                        {deleteUserMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    Delete User
                  </Button>
                )}
              </div>
            )}
            {manageError ? <p className="text-sm text-red-600">{manageError}</p> : null}
            {manageSuccess ? <p className="text-sm text-emerald-700">{manageSuccess}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleManageDialogChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
