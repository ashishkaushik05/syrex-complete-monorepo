import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { usePermission } from '@/context/PermissionContext'

type RoleRecord = {
  id: string
  name: string
  isSystem: boolean
  permissions: string[]
  memberships?: Array<{ permission: string }>
}

type UserRecord = {
  id: string
  name: string
  email: string
  userType: 'internal' | 'outlet'
  isActive: boolean
  role?: { id: string; name: string } | null
}

type PermissionCatalogRow = {
  key: string
  module: string
  action: string
  label: string
  description: string
  risk: 'low' | 'medium' | 'high'
  group: string
}

type PermissionNode = {
  key: string
  label: string
  fullPath?: string
  isLeaf: boolean
  children: PermissionNode[]
}

function unwrapData<T>(payload: unknown): T | undefined {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data?: T }).data
  }
  return payload as T | undefined
}

function normalizeRole(role: RoleRecord): RoleRecord {
  const fromMemberships = (role.memberships ?? []).map((m) => m.permission)
  const permissions = Array.from(new Set([...(role.permissions ?? []), ...fromMemberships])).sort()
  return { ...role, permissions }
}

function buildPermissionTree(permissions: string[]): PermissionNode[] {
  const root: PermissionNode = {
    key: 'root',
    label: 'root',
    isLeaf: false,
    children: [],
  }

  for (const permission of permissions) {
    if (permission === '*') {
      root.children.push({
        key: 'perm:*',
        label: '*',
        fullPath: '*',
        isLeaf: true,
        children: [],
      })
      continue
    }

    const parts = permission.split(':')
    let current = root
    let prefix = ''

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index]
      prefix = prefix ? `${prefix}:${part}` : part
      const nodeKey = index === parts.length - 1 ? `perm:${prefix}` : `group:${prefix}`
      const existing = current.children.find((node) => node.key === nodeKey)

      if (existing) {
        current = existing
        continue
      }

      const nextNode: PermissionNode = {
        key: nodeKey,
        label: part,
        fullPath: index === parts.length - 1 ? prefix : undefined,
        isLeaf: index === parts.length - 1,
        children: [],
      }

      current.children.push(nextNode)
      current = nextNode
    }
  }

  const sortNode = (nodes: PermissionNode[]) => {
    nodes.sort((a, b) => {
      if (a.label === '*') return -1
      if (b.label === '*') return 1
      if (a.isLeaf !== b.isLeaf) return a.isLeaf ? 1 : -1
      return a.label.localeCompare(b.label)
    })
    for (const node of nodes) {
      if (!node.isLeaf) sortNode(node.children)
    }
  }

  sortNode(root.children)
  return root.children
}

function filterTree(nodes: PermissionNode[], query: string): PermissionNode[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return nodes

  const visit = (node: PermissionNode): PermissionNode | null => {
    const labelMatch = node.label.toLowerCase().includes(normalized)
    const pathMatch = (node.fullPath ?? '').toLowerCase().includes(normalized)

    if (node.isLeaf) {
      return labelMatch || pathMatch ? node : null
    }

    const filteredChildren = node.children
      .map(visit)
      .filter((child): child is PermissionNode => child !== null)

    if (labelMatch || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      }
    }

    return null
  }

  return nodes.map(visit).filter((node): node is PermissionNode => node !== null)
}

function collectLeafPaths(nodes: PermissionNode[]): string[] {
  const out: string[] = []
  const visit = (node: PermissionNode) => {
    if (node.isLeaf && node.fullPath) {
      out.push(node.fullPath)
      return
    }
    for (const child of node.children) {
      visit(child)
    }
  }

  for (const node of nodes) visit(node)
  return out
}

type PermissionTreeEditorProps = {
  tree: PermissionNode[]
  selected: Set<string>
  search: string
  onSearchChange: (value: string) => void
  onSelectionChange: (next: Set<string>) => void
  metaByPermission: Map<string, { module: string; action: string; label: string; description: string; risk: 'low' | 'medium' | 'high'; group: string }>
  disabled?: boolean
}

function PermissionTreeEditor({
  tree,
  selected,
  search,
  onSearchChange,
  onSelectionChange,
  metaByPermission,
  disabled = false,
}: PermissionTreeEditorProps) {
  const filteredTree = useMemo(() => filterTree(tree, search), [tree, search])
  const hasWildcard = selected.has('*')

  const toggleLeaf = (permission: string) => {
    if (disabled) return

    const next = new Set(selected)

    if (permission === '*') {
      if (next.has('*')) {
        next.delete('*')
      } else {
        next.clear()
        next.add('*')
      }
      onSelectionChange(next)
      return
    }

    if (next.has(permission)) {
      next.delete(permission)
    } else {
      next.delete('*')
      next.add(permission)
    }
    onSelectionChange(next)
  }

  const toggleGroup = (node: PermissionNode) => {
    if (disabled || hasWildcard) return

    const groupLeaves = collectLeafPaths([node]).filter((permission) => permission !== '*')
    if (groupLeaves.length === 0) return

    const allSelected = groupLeaves.every((permission) => selected.has(permission))
    const next = new Set(selected)

    if (allSelected) {
      for (const permission of groupLeaves) next.delete(permission)
    } else {
      for (const permission of groupLeaves) next.add(permission)
    }

    onSelectionChange(next)
  }

  const renderNode = (node: PermissionNode, depth: number) => {
    if (node.isLeaf && node.fullPath) {
      const isWildcardLeaf = node.fullPath === '*'
      const isChecked = selected.has(node.fullPath)
      const isDisabled = disabled || (hasWildcard && !isWildcardLeaf)
      const meta = metaByPermission.get(node.fullPath)

      return (
        <div key={node.key} className="space-y-1">
          <label
            className="flex items-center justify-between gap-3 rounded border border-slate-200 bg-white px-3 py-2 text-sm"
            style={{ marginLeft: `${depth * 12}px` }}
          >
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isDisabled}
                onChange={() => toggleLeaf(node.fullPath!)}
              />
              <span className={isDisabled ? 'text-slate-400' : 'text-slate-700'}>{node.fullPath}</span>
            </span>
            <span className="flex items-center gap-1">
              {meta?.module ? <Badge variant="secondary">{meta.module}</Badge> : null}
              {meta?.risk ? <Badge variant={meta.risk === 'high' ? 'destructive' : 'secondary'}>{meta.risk}</Badge> : null}
            </span>
          </label>
          {meta?.description ? (
            <p className="pl-8 text-xs text-slate-500" style={{ marginLeft: `${depth * 12}px` }}>
              {meta.description}
            </p>
          ) : null}
        </div>
      )
    }

    const leaves = collectLeafPaths([node]).filter((permission) => permission !== '*')
    const selectedCount = leaves.filter((permission) => selected.has(permission)).length
    const isChecked = leaves.length > 0 && selectedCount === leaves.length
    const isPartiallyChecked = selectedCount > 0 && selectedCount < leaves.length

    return (
      <div key={node.key} className="space-y-2">
        <div
          className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-3 py-2"
          style={{ marginLeft: `${depth * 12}px` }}
        >
          <button
            type="button"
            className="text-left text-sm font-medium text-slate-700"
            onClick={() => toggleGroup(node)}
            disabled={disabled || hasWildcard || leaves.length === 0}
          >
            {node.label}
          </button>
          <span className="text-xs text-slate-500">
            {isChecked ? 'all selected' : isPartiallyChecked ? `${selectedCount}/${leaves.length}` : `${leaves.length} items`}
          </span>
        </div>
        <div className="space-y-2">{node.children.map((child) => renderNode(child, depth + 1))}</div>
      </div>
    )
  }

  const selectedItems = Array.from(selected).sort()

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Search Permissions</Label>
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search permission (e.g. field:read)"
          disabled={disabled}
        />
      </div>

      {selectedItems.length > 0 ? (
        <p className="text-xs text-slate-600">Selected ({selectedItems.length}): {selectedItems.join(', ')}</p>
      ) : (
        <p className="text-xs text-slate-500">No permissions selected.</p>
      )}

      {hasWildcard ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Wildcard `*` is selected. Granular permissions are disabled.
        </p>
      ) : null}

      <div className="max-h-[360px] space-y-2 overflow-auto rounded border border-slate-200 p-3">
        {filteredTree.length > 0 ? filteredTree.map((node) => renderNode(node, 0)) : (
          <p className="text-sm text-slate-500">No permissions match your search.</p>
        )}
      </div>
    </div>
  )
}

export function RolesPage() {
  const ROLES_PER_PAGE = 8
  const USERS_PER_PAGE = 10
  const queryClient = useQueryClient()
  const { can } = usePermission()
  const canReadRoles = can('roles:read')
  const canWriteRoles = can('roles:write')
  const canWriteUsers = can('users:write')

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createSelectedPermissions, setCreateSelectedPermissions] = useState<Set<string>>(new Set())
  const [createPermissionSearch, setCreatePermissionSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSelectedPermissions, setEditSelectedPermissions] = useState<Set<string>>(new Set())
  const [editPermissionSearch, setEditPermissionSearch] = useState('')
  const [viewRole, setViewRole] = useState<RoleRecord | null>(null)
  const [rolesPage, setRolesPage] = useState(1)
  const [usersPage, setUsersPage] = useState(1)

  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleName, setSelectedRoleName] = useState('')

  const rolesQuery = useQuery({
    queryKey: ['roles-page', 'roles'],
    enabled: canReadRoles,
    queryFn: async () => {
      const response = await api.get<{ data?: RoleRecord[] } | RoleRecord[]>('/roles')
      const rows = unwrapData<RoleRecord[]>(response.data) ?? []
      return rows.map(normalizeRole)
    },
  })

  const permissionCatalogQuery = useQuery({
    queryKey: ['roles-page', 'permissions-catalog'],
    enabled: canReadRoles,
    queryFn: async () => {
      const response = await api.get<{ data?: PermissionCatalogRow[] } | PermissionCatalogRow[]>('/permissions')
      return unwrapData<PermissionCatalogRow[]>(response.data) ?? []
    },
  })

  const usersQuery = useQuery({
    queryKey: ['roles-page', 'users'],
    enabled: canWriteUsers,
    queryFn: async () => {
      const response = await api.get<{ data?: UserRecord[] } | UserRecord[]>('/users')
      const payload = response.data as { data?: UserRecord[] } | UserRecord[] | undefined
      const list = Array.isArray(payload) ? payload : ((payload as { data?: UserRecord[] })?.data ?? [])
      return list.filter((u) => u.userType === 'internal')
    },
  })

  const roles = rolesQuery.data ?? []
  const users = usersQuery.data ?? []
  const rolesTotalPages = Math.max(1, Math.ceil(roles.length / ROLES_PER_PAGE))
  const usersTotalPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE))
  const pagedRoles = useMemo(
    () => roles.slice((rolesPage - 1) * ROLES_PER_PAGE, rolesPage * ROLES_PER_PAGE),
    [roles, rolesPage, ROLES_PER_PAGE],
  )
  const pagedUsers = useMemo(
    () => users.slice((usersPage - 1) * USERS_PER_PAGE, usersPage * USERS_PER_PAGE),
    [users, usersPage, USERS_PER_PAGE],
  )

  const catalogPermissions = ['*', ...(permissionCatalogQuery.data ?? []).map((row) => row.key)]
  const permissionTree = useMemo(() => buildPermissionTree(catalogPermissions), [catalogPermissions])
  const permissionMetaByPermission = useMemo(() => {
    const map = new Map<string, { module: string; action: string; label: string; description: string; risk: 'low' | 'medium' | 'high'; group: string }>()
    for (const row of permissionCatalogQuery.data ?? []) {
      map.set(row.key, {
        module: row.module,
        action: row.action,
        label: row.label,
        description: row.description,
        risk: row.risk,
        group: row.group,
      })
    }
    return map
  }, [permissionCatalogQuery.data])

  const createRoleMutation = useMutation({
    mutationFn: async (payload: { name: string; permissions: string[]; isSystem?: boolean }) => {
      const response = await api.post<{ data: RoleRecord }>('/roles', payload)
      return response.data.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles-page', 'roles'] })
      await queryClient.invalidateQueries({ queryKey: ['roles-page', 'permissions-catalog'] })
      await queryClient.invalidateQueries({ queryKey: ['roles-list'] })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: async (payload: { id: string; name: string; permissions: string[] }) => {
      const response = await api.patch<{ data: RoleRecord }>(`/roles/${payload.id}`, {
        name: payload.name,
        permissions: payload.permissions,
      })
      return response.data.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles-page', 'roles'] })
      await queryClient.invalidateQueries({ queryKey: ['roles-page', 'permissions-catalog'] })
      await queryClient.invalidateQueries({ queryKey: ['roles-list'] })
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: async (payload: { userId: string; role: string }) => {
      await api.patch(`/users/${payload.userId}/role`, { role: payload.role })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roles-page', 'users'] })
    },
  })

  const roleOptions = useMemo(() => roles.map((r) => r.name).sort(), [roles])

  const rolePermissionsToPayload = (selected: Set<string>) => {
    if (selected.has('*')) return ['*']
    return Array.from(selected).sort()
  }

  const startEdit = (role: RoleRecord) => {
    setEditingRoleId(role.id)
    setEditName(role.name)
    setEditSelectedPermissions(new Set(role.permissions))
    setEditPermissionSearch('')
    setIsEditOpen(true)
  }

  const cancelEdit = () => {
    setIsEditOpen(false)
    setEditingRoleId(null)
    setEditName('')
    setEditSelectedPermissions(new Set())
    setEditPermissionSearch('')
  }

  const handleCreateRole = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    try {
      await createRoleMutation.mutateAsync({
        name: createName.trim(),
        permissions: rolePermissionsToPayload(createSelectedPermissions),
      })
      setCreateName('')
      setCreateSelectedPermissions(new Set())
      setCreatePermissionSearch('')
      setIsCreateOpen(false)
      setMessage('Role created successfully.')
    } catch (error: any) {
      setMessage(error?.response?.data?.error?.message ?? 'Unable to create role.')
    }
  }

  const handleUpdateRole = async (roleId: string) => {
    setMessage(null)
    try {
      await updateRoleMutation.mutateAsync({
        id: roleId,
        name: editName.trim(),
        permissions: rolePermissionsToPayload(editSelectedPermissions),
      })
      cancelEdit()
      setMessage('Role updated successfully.')
    } catch (error: any) {
      setMessage(error?.response?.data?.error?.message ?? 'Unable to update role.')
    }
  }

  const handleAssignRole = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(null)

    if (!selectedUserId || !selectedRoleName) {
      setMessage('Select user and role before assigning.')
      return
    }

    try {
      await assignRoleMutation.mutateAsync({ userId: selectedUserId, role: selectedRoleName })
      setMessage('User role updated successfully.')
    } catch (error: any) {
      setMessage(error?.response?.data?.error?.message ?? 'Unable to assign role.')
    }
  }

  if (!canReadRoles) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">You need `roles:read` permission to view role management.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Role Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWriteRoles ? (
            <Button onClick={() => setIsCreateOpen(true)}>Create Role</Button>
          ) : (
            <p className="text-sm text-slate-600">Read-only mode. `roles:write` required for role mutations.</p>
          )}

          {message ? <p className="text-sm text-slate-700">{message}</p> : null}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Permissions</TableHead>
                  {canWriteRoles ? <TableHead className="text-right">Actions</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedRoles.map((role) => {
                  return (
                    <TableRow key={role.id}>
                      <TableCell className="font-medium align-top">
                        <button
                          type="button"
                          className="text-left text-blue-700 hover:underline"
                          onClick={() => setViewRole(role)}
                        >
                          {role.name}
                        </button>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={role.isSystem ? 'default' : 'secondary'}>
                          {role.isSystem ? 'System' : 'Custom'}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <p className="text-xs text-slate-600">
                          {role.permissions.length} permission{role.permissions.length === 1 ? '' : 's'}
                        </p>
                      </TableCell>
                      {canWriteRoles ? (
                        <TableCell className="text-right align-top space-x-2">
                          <Button size="sm" variant="outline" onClick={() => startEdit(role)}>
                            Edit
                          </Button>
                          {!role.isSystem ? (
                            <Button size="sm" variant="destructive" disabled title="Not available in Phase 1 backend">
                              Delete
                            </Button>
                          ) : null}
                        </TableCell>
                      ) : null}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={rolesPage <= 1} onClick={() => setRolesPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <span className="text-xs text-slate-600">Page {rolesPage} of {rolesTotalPages}</span>
            <Button size="sm" variant="outline" disabled={rolesPage >= rolesTotalPages} onClick={() => setRolesPage((current) => Math.min(rolesTotalPages, current + 1))}>Next</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Role Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {canWriteUsers ? (
            <form className="grid gap-3 md:grid-cols-3" onSubmit={handleAssignRole}>
              <div className="space-y-1">
                <Label>User</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                >
                  <option value="">Select user</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <select
                  className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm"
                  value={selectedRoleName}
                  onChange={(event) => setSelectedRoleName(event.target.value)}
                >
                  <option value="">Select role</option>
                  {roleOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:self-end">
                <Button type="submit" disabled={assignRoleMutation.isPending}>Assign Role</Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-600">`users:write` is required to assign roles to users.</p>
          )}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Current Role</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{user.role?.name ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="outline" disabled={usersPage <= 1} onClick={() => setUsersPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <span className="text-xs text-slate-600">Page {usersPage} of {usersTotalPages}</span>
            <Button size="sm" variant="outline" disabled={usersPage >= usersTotalPages} onClick={() => setUsersPage((current) => Math.min(usersTotalPages, current + 1))}>Next</Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create Role</DialogTitle>
            <DialogDescription>Set role name and permissions.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreateRole}>
            <div className="space-y-1">
              <Label>Role Name</Label>
              <Input value={createName} onChange={(event) => setCreateName(event.target.value)} required />
            </div>
            <PermissionTreeEditor
              tree={permissionTree}
              selected={createSelectedPermissions}
              search={createPermissionSearch}
              onSearchChange={setCreatePermissionSearch}
              onSelectionChange={setCreateSelectedPermissions}
              metaByPermission={permissionMetaByPermission}
              disabled={permissionCatalogQuery.isLoading}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={createRoleMutation.isPending}>Create Role</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={(open) => { if (!open) cancelEdit(); else setIsEditOpen(true) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>Update role name and permissions.</DialogDescription>
          </DialogHeader>
          {editingRoleId ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Role Name</Label>
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} required />
              </div>
              <PermissionTreeEditor
                tree={permissionTree}
                selected={editSelectedPermissions}
                search={editPermissionSearch}
                onSearchChange={setEditPermissionSearch}
                onSelectionChange={setEditSelectedPermissions}
                metaByPermission={permissionMetaByPermission}
                disabled={permissionCatalogQuery.isLoading}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={cancelEdit}>Cancel</Button>
                <Button onClick={() => handleUpdateRole(editingRoleId)} disabled={updateRoleMutation.isPending}>Save</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={viewRole !== null} onOpenChange={(open) => { if (!open) setViewRole(null) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewRole?.name ?? 'Role'} Permissions</DialogTitle>
            <DialogDescription>All permissions assigned to this role.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[65vh] overflow-auto rounded border border-slate-200 p-3">
            {(viewRole?.permissions.length ?? 0) > 0 ? (
              <div className="space-y-2">
                {(viewRole?.permissions ?? []).map((permission) => (
                  <p key={permission} className="rounded bg-slate-50 px-2 py-1 font-mono text-xs text-slate-700">
                    {permission}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No permissions assigned.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
