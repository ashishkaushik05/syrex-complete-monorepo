import type {
  AuthSession,
  ComplaintCreateInput,
  ComplaintDetail,
  ComplaintListItem,
  PortalAttachment,
  PortalCatalogFacet,
  PortalCatalogProduct,
  ServiceUser,
} from '../types'

const configuredBaseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
const trpcBaseUrl = import.meta.env.DEV ? '/trpc' : `${configuredBaseUrl || 'http://localhost:3000'}/trpc`
const ACCESS_TOKEN_KEY = 'syrex_service_portal_access_token'
const REFRESH_TOKEN_KEY = 'syrex_service_portal_refresh_token'
const SESSION_EXPIRED_KEY = 'syrex_service_portal_session_expired'
export const PORTAL_SESSION_CLEARED_EVENT = 'syrex:portal-session-cleared'
let refreshInFlight: Promise<boolean> | null = null

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'ApiError'
  }
}

export function hasStoredSession() {
  return Boolean(localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY))
}

export function setSession(session: AuthSession) {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken)
}

export function clearSession(expired = false) {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  if (expired && typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1')
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PORTAL_SESSION_CLEARED_EVENT))
  }
}

export function consumeSessionExpired() {
  if (typeof sessionStorage === 'undefined') return false
  const expired = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1'
  sessionStorage.removeItem(SESSION_EXPIRED_KEY)
  return expired
}

export function unwrapTrpcPayload<T>(payload: unknown): T {
  const envelope = payload as {
    error?: { json?: { message?: string; data?: { httpStatus?: number } } }
    result?: { data?: { json?: T } }
  }
  if (envelope.error) {
    throw new ApiError(
      envelope.error.json?.message || 'Request failed',
      envelope.error.json?.data?.httpStatus || 400,
    )
  }
  if (envelope.result?.data?.json === undefined) {
    throw new ApiError('Invalid server response', 502)
  }
  return envelope.result.data.json
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refreshToken) {
    clearSession(true)
    return false
  }
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = request<AuthSession>('servicePortal.refresh', 'mutation', { refreshToken }, false, false)
    .then((session) => {
      setSession(session)
      return true
    })
    .catch(() => {
      clearSession(true)
      return false
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

async function request<T>(
  procedure: string,
  kind: 'query' | 'mutation',
  input?: unknown,
  includeAuth = true,
  retryOnUnauthorized = true,
): Promise<T> {
  const token = includeAuth ? localStorage.getItem(ACCESS_TOKEN_KEY) : null
  const query = kind === 'query' && input !== undefined
    ? `?input=${encodeURIComponent(JSON.stringify({ json: input }))}`
    : ''
  let response: Response
  try {
    response = await fetch(`${trpcBaseUrl}/${procedure}${query}`, {
      method: kind === 'query' ? 'GET' : 'POST',
      headers: {
        ...(kind === 'mutation' ? { 'content-type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(kind === 'mutation' ? { body: JSON.stringify({ json: input }) } : {}),
    })
  } catch {
    throw new ApiError('No connection. Check your internet and try again.', 0)
  }

  if (response.status === 401 && includeAuth && retryOnUnauthorized && await refreshAccessToken()) {
    return request<T>(procedure, kind, input, true, false)
  }

  const payload = await response.json().catch(() => null)
  return unwrapTrpcPayload<T>(payload)
}

export const portalApi = {
  register: (input: { name: string; phone: string; email: string; password: string }) =>
    request<AuthSession>('servicePortal.register', 'mutation', input, false, false),
  login: (input: { email: string; password: string }) =>
    request<AuthSession>('servicePortal.login', 'mutation', input, false, false),
  logout: () => request<{ ok: boolean }>('servicePortal.logout', 'mutation', {}),
  me: () => request<ServiceUser>('servicePortal.me', 'query'),
  listCatalogFacets: () =>
    request<PortalCatalogFacet[]>('servicePortal.listCatalogFacets', 'query'),
  listCatalogProducts: (input: {
    limit: number
    cursor?: string | null
    q?: string
    brandName?: string
    categoryName?: string
  }) =>
    request<{ items: PortalCatalogProduct[]; nextCursor: string | null }>(
      'servicePortal.listCatalogProducts',
      'query',
      input,
    ),
  listComplaints: (input: { limit: number; cursor?: string | null }) =>
    request<{ items: ComplaintListItem[]; nextCursor: string | null }>(
      'servicePortal.listMyComplaints',
      'query',
      input,
    ),
  getComplaint: (id: string) =>
    request<ComplaintDetail>('servicePortal.getMyComplaint', 'query', { id }),
  createComplaint: (input: ComplaintCreateInput) =>
    request<ComplaintDetail>('servicePortal.createComplaint', 'mutation', input),
  updateComplaint: (id: string, description: string) =>
    request<ComplaintDetail>('servicePortal.updateMyComplaint', 'mutation', { id, description }),
  cancelComplaint: (id: string) =>
    request<ComplaintDetail>('servicePortal.cancelMyComplaint', 'mutation', { id }),
  createAttachment: (complaintId: string, file: File) =>
    request<{
      attachment: PortalAttachment
      upload: { method: 'PUT'; uploadUrl: string; expiresAt: string }
    }>('servicePortal.createComplaintAttachment', 'mutation', {
      complaintId,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    }),
  confirmAttachment: (complaintId: string, attachmentId: string) =>
    request<PortalAttachment>('servicePortal.confirmComplaintAttachment', 'mutation', {
      complaintId,
      attachmentId,
    }),
  attachmentDownload: (complaintId: string, attachmentId: string) =>
    request<{ downloadUrl: string; expiresIn: number }>(
      'servicePortal.getComplaintAttachmentDownload',
      'query',
      { complaintId, attachmentId },
    ),
  removeAttachment: (complaintId: string, attachmentId: string) =>
    request<{ id: string; deleted: boolean }>(
      'servicePortal.removeComplaintAttachment',
      'mutation',
      { complaintId, attachmentId },
    ),
}

export function apiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'No connection. Reconnect and try again.'
    if (error.status === 401) return 'Your session expired. Sign in again to continue.'
    if (error.status === 403 || error.status === 404) return 'This complaint is unavailable.'
    if (error.status === 409) return error.message
    if (error.status >= 500) return 'The service is temporarily unavailable. Please retry.'
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
