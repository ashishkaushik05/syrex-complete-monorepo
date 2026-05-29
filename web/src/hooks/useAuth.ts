import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import { api } from '@/lib/api'

export type AuthUser = {
  id: string
  name: string
  email: string
  userType: 'internal' | 'outlet'
  isActive: boolean
}

export type AuthMe = {
  user: AuthUser
  role?: string
  permissions?: string[]
  managedWarehouseId?: string | null
  outletId?: string
  context: {
    userType?: 'internal' | 'outlet'
    capabilities?: {
      fieldSenseEnabled?: boolean
    }
    orgIds?: string[]
    scopeOrgIds?: string[]
    isGlobalScope?: boolean
    memberships?: Array<{
      orgId: string
      permissions: string[]
      role?: string
      roleName: string
    }>
    permissions?: string[] | Array<{
      orgId: string
      permissions: string[]
    }>
    outletId?: string
    outletRole?: string
  }
}

type LoginDTO = {
  email: string
  password: string
}

type LoginResponseData = {
  user: AuthUser
  role?: string
  permissions?: string[]
  managedWarehouseId?: string | null
  outletId?: string
  context: AuthMe['context']
}

export function useAuth() {
  const queryClient = useQueryClient()

  const unwrapEnvelope = <T,>(payload: { data: T } | { data: { data: T } }): T => {
    const outer = payload.data as T | { data: T }
    if (outer && typeof outer === 'object' && 'data' in outer) {
      return (outer as { data: T }).data
    }
    return outer as T
  }

  const authQuery = useQuery({
    queryKey: ['auth', 'me'],
    retry: false,
    queryFn: async () => {
      const previousAuth = queryClient.getQueryData<AuthMe | null>(['auth', 'me']) ?? null

      try {
        const response = await api.get<{ data: AuthMe }>('/auth/me')
        return unwrapEnvelope<AuthMe>(response as { data: AuthMe } | { data: { data: AuthMe } }) ?? null
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : (error as { response?: { status?: number } })?.response?.status
        if (status === 401) {
          return null
        }

        // Preserve last-known auth during transient backend outages.
        return previousAuth
      }
    },
  })

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginDTO) => {
      const response = await api.post<{ data: LoginResponseData }>('/auth/login', payload)
      return unwrapEnvelope<LoginResponseData>(
        response as { data: LoginResponseData } | { data: { data: LoginResponseData } },
      )
    },
    onSuccess: async (data) => {
      queryClient.setQueryData<AuthMe | null>(['auth', 'me'], {
        user: data.user,
        role: data.role,
        permissions: data.permissions,
        managedWarehouseId: data.managedWarehouseId,
        outletId: data.outletId,
        context: data.context,
      })
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout')
    },
    onSuccess: async () => {
      queryClient.clear()
    },
  })

  const context = authQuery.data?.context
  const memberships: Array<never> = []

  const permissions = (() => {
    if (Array.isArray(authQuery.data?.permissions)) {
      return Array.from(
        new Set(
          authQuery.data.permissions.filter((entry): entry is string => typeof entry === 'string'),
        ),
      )
    }

    const raw = context?.permissions
    if (!Array.isArray(raw)) return [] as string[]

    if (raw.length === 0) return []

    if (typeof raw[0] === 'string') {
      return Array.from(new Set(raw.filter((entry): entry is string => typeof entry === 'string')))
    }

    const flat = raw
      .flatMap((entry) => (entry && typeof entry === 'object' && Array.isArray(entry.permissions) ? entry.permissions : []))
      .filter((entry): entry is string => typeof entry === 'string')

    return Array.from(new Set(flat))
  })()

  const permissionMap = (() => {
    const raw = context?.permissions
    const map = new Map<string, Set<string>>()

    if (!Array.isArray(raw)) {
      return map
    }

    if (raw.length === 0) {
      return map
    }

    if (typeof raw[0] === 'string') {
      map.set('*', new Set(raw.filter((entry): entry is string => typeof entry === 'string')))
      return map
    }

    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue
      const orgId = 'orgId' in entry && typeof entry.orgId === 'string' ? entry.orgId : null
      const orgPermissions =
        'permissions' in entry && Array.isArray(entry.permissions)
          ? entry.permissions.filter((item): item is string => typeof item === 'string')
          : []

      if (!orgId) continue
      const current = map.get(orgId) ?? new Set<string>()
      for (const permission of orgPermissions) {
        current.add(permission)
      }
      map.set(orgId, current)
    }

    return map
  })()

  const scopeOrgIds: string[] = []
  const orgIds: string[] = []
  const isGlobalScope = true
  const managedWarehouseId = authQuery.data?.managedWarehouseId ?? null
  const isAdmin = permissions.includes('*')
  const fieldSenseEnabled = authQuery.data?.context?.capabilities?.fieldSenseEnabled === true

  return {
    authQuery,
    user: authQuery.data?.user,
    context,
    orgIds,
    scopeOrgIds,
    isGlobalScope,
    memberships,
    permissions,
    permissionMap,
    managedWarehouseId,
    isAdmin,
    fieldSenseEnabled,
    isAuthenticated: !!authQuery.data?.user,
    loginMutation,
    logoutMutation,
  }
}
