export type NotificationItem = {
  id: string
  title: string
  body: string
  entityType: string
  entityId: string
  channel: 'in_app' | 'push' | 'sms'
  isRead: boolean
  readAt: string | null
  createdAt: string
  updatedAt: string
}

export function notificationTargetPath(notification: NotificationItem) {
  const entityType = notification.entityType.toLowerCase()

  if (entityType.includes('order')) {
    return `/dashboard/sales/orders/${notification.entityId}`
  }

  if (entityType.includes('invoice')) {
    return `/dashboard/accounts/invoices/${notification.entityId}`
  }

  if (entityType.includes('dispatch')) {
    return `/dashboard/sales/dispatches/${notification.entityId}`
  }

  if (entityType.includes('outlet')) {
    return `/dashboard/outlets/${notification.entityId}`
  }

  if (entityType.includes('org')) {
    return '/dashboard/org'
  }

  if (entityType.includes('user')) {
    return '/dashboard/users'
  }

  return '/dashboard/notifications'
}

export function notificationKind(entityType: string) {
  const value = entityType.toLowerCase()
  if (value.includes('order') || value.includes('invoice') || value.includes('dispatch')) return 'order'
  return 'system'
}
