import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/lib/api'
import { notificationKind, notificationTargetPath } from '@/lib/notifications'
import { timeAgo, titleCase } from '@/lib/format'
import type { NotificationItem } from '@/lib/notifications'

type NotificationListResponse = {
  data: NotificationItem[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages?: number
  }
}

type NotificationFilter = 'all' | 'unread' | 'ticket' | 'order' | 'system'

export function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all')

  const notificationsQuery = useQuery({
    queryKey: ['notifications', 'page', page],
    queryFn: async () => {
      const response = await api.get<NotificationListResponse>('/notifications', {
        params: { page, limit: 20 },
      })
      return response.data
    },
  })

  const unreadCountQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const response = await api.get<{ data: { count: number } }>('/notifications/unread-count')
      return response.data.data.count
    },
  })

  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await api.patch(`/notifications/${notificationId}/read`)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
      ])
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
      ])
    },
  })

  const notifications = notificationsQuery.data?.data ?? []

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      if (activeFilter === 'all') return true
      if (activeFilter === 'unread') return !notification.isRead
      return notificationKind(notification.entityType) === activeFilter
    })
  }, [activeFilter, notifications])

  const pagination = notificationsQuery.data?.pagination
  const totalPages = pagination?.totalPages ?? Math.max(1, Math.ceil((pagination?.total ?? 0) / (pagination?.limit ?? 20)))

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      try {
        await markReadMutation.mutateAsync(notification.id)
      } catch {
        // Continue to navigation even if read update fails.
      }
    }

    navigate(notificationTargetPath(notification))
  }

  if (notificationsQuery.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Could not load notifications. Verify notification read permission and try again.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Notifications</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              {unreadCountQuery.data ?? 0} unread updates across tickets, orders, and system events.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || (unreadCountQuery.data ?? 0) === 0}
          >
            <CheckCheck className="mr-2 h-4 w-4" />
            {markAllReadMutation.isPending ? 'Marking...' : 'Mark all read'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All'],
              ['unread', 'Unread'],
              ['ticket', 'Tickets'],
              ['order', 'Orders'],
              ['system', 'System'],
            ] as Array<[NotificationFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  activeFilter === value
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {notificationsQuery.isLoading ? (
            <p className="text-sm text-slate-500">Loading notifications...</p>
          ) : filteredNotifications.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <Bell className="mx-auto h-5 w-5 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">No notifications in this filter.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredNotifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => openNotification(notification)}
                  className={`w-full rounded-xl border p-3 text-left transition hover:border-blue-300 hover:bg-blue-50 ${
                    notification.isRead
                      ? 'border-slate-200 bg-white'
                      : 'border-blue-200 bg-blue-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${notification.isRead ? 'font-medium text-slate-800' : 'font-semibold text-slate-900'}`}>
                      {notification.title}
                    </p>
                    <Badge variant={notification.isRead ? 'secondary' : 'default'}>
                      {notification.isRead ? 'Read' : 'Unread'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{titleCase(notificationKind(notification.entityType))}</span>
                    <span>{timeAgo(notification.createdAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <p className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
