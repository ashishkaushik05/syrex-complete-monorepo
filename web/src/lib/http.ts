import axios from 'axios'

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  if (!axios.isAxiosError(error)) {
    return fallback
  }

  const message = error.response?.data?.error?.message
  if (typeof message === 'string' && message.trim().length > 0) {
    return message
  }

  return fallback
}
