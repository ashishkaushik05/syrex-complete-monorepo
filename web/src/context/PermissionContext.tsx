import { createContext, useContext, useMemo } from 'react'

import { useAuth } from '@/hooks/useAuth'

type PermissionContextValue = {
  can: (permission: string) => boolean
  canAtOrg: (orgId: string | null | undefined, permission: string) => boolean
  isAdmin: boolean
}

const PermissionContext = createContext<PermissionContextValue | null>(null)

export function PermissionProvider({ children }: { children: React.ReactNode }) {
  const { permissions, permissionMap, isAdmin } = useAuth()

  const value = useMemo<PermissionContextValue>(() => {
    return {
      can: (permission: string) =>
        isAdmin || permissions.includes(permission),
      canAtOrg: (orgId: string | null | undefined, permission: string) => {
        if (isAdmin) {
          return true
        }

        if (!orgId) {
          return permissions.includes(permission)
        }

        const scopedPermissions = permissionMap.get(orgId)
        if (!scopedPermissions) {
          return false
        }

        return scopedPermissions.has(permission) || scopedPermissions.has('*')
      },
      isAdmin,
    }
  }, [isAdmin, permissionMap, permissions])

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  )
}

export function usePermission() {
  const context = useContext(PermissionContext)

  if (!context) {
    throw new Error('usePermission must be used within PermissionProvider')
  }

  return context
}
