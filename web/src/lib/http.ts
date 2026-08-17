import axios from 'axios'

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  const responseError = error as {
    response?: { status?: number; data?: { error?: { message?: string } } }
  }
  const message = responseError?.response?.data?.error?.message
  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  const status = responseError?.response?.status
  if (status === 401) return 'Your session expired. Sign in again to continue.'
  if (status === 403) return 'You do not have permission to perform this action.'
  if (status === 404) return 'This record is unavailable or is no longer assigned to you.'
  if (status === 409) return 'This record changed. Refresh it and try the action again.'
  if (typeof status === 'number' && status >= 500) return 'The service is temporarily unavailable. Please retry.'

  if (!axios.isAxiosError(error)) return fallback
  return fallback
}
