import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiErrorMessage,
  clearSession,
  consumeSessionExpired,
  portalApi,
  setSession,
  unwrapTrpcPayload,
} from './api'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('tRPC response handling', () => {
  it('unwraps the json payload', () => {
    expect(unwrapTrpcPayload<{ ok: boolean }>({ result: { data: { json: { ok: true } } } })).toEqual({ ok: true })
  })

  it('maps server errors to a stable API error', () => {
    expect(() => unwrapTrpcPayload({ error: { json: { message: 'Denied', data: { httpStatus: 403 } } } }))
      .toThrow(new ApiError('Denied', 403))
  })

  it('maps connectivity and server errors to actionable copy while preserving conflicts', () => {
    expect(apiErrorMessage(new ApiError('fetch failed', 0))).toContain('Reconnect')
    expect(apiErrorMessage(new ApiError('An account already exists with this email or phone', 409)))
      .toBe('An account already exists with this email or phone')
    expect(apiErrorMessage(new ApiError('internal', 500))).toContain('temporarily unavailable')
  })

  it('encodes customer catalog filters without changing the product response', async () => {
    setSession({
      accessToken: 'catalog-access',
      refreshToken: 'catalog-refresh',
      expiresIn: 900,
      user: {
        id: 'user-1',
        name: 'Portal User',
        phone: '9999999999',
        email: 'portal@example.com',
        isActive: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    })
    const product = {
      sku: 'SYX-200',
      name: 'Power 200',
      displayName: 'Syrex Power 200',
      brandName: 'Syrex',
      categoryName: 'Inverter Batteries',
      description: null,
      warrantyMonths: 48,
      primaryImageUrl: null,
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      void input
      return new Response(JSON.stringify({
        result: { data: { json: { items: [product], nextCursor: null } } },
      }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const output = await portalApi.listCatalogProducts({
      limit: 12,
      q: 'power',
      brandName: 'Syrex',
      categoryName: 'Inverter Batteries',
    })

    expect(output.items).toEqual([product])
    const url = new URL(String(fetchMock.mock.calls[0][0]), 'http://localhost')
    expect(url.pathname).toContain('servicePortal.listCatalogProducts')
    const input = JSON.parse(url.searchParams.get('input')!)
    expect(input.json).toEqual({
      limit: 12,
      q: 'power',
      brandName: 'Syrex',
      categoryName: 'Inverter Batteries',
    })
  })

  it('refreshes once on 401, stores rotated tokens, and retries with the new access token', async () => {
    setSession({
      accessToken: 'expired-access',
      refreshToken: 'old-refresh',
      expiresIn: 900,
      user: {
        id: 'user-1',
        name: 'Portal User',
        phone: '9999999999',
        email: 'portal@example.com',
        isActive: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    })
    const responses = [
      new Response(JSON.stringify({ error: { json: { message: 'Expired', data: { httpStatus: 401 } } } }), { status: 401 }),
      new Response(JSON.stringify({ result: { data: { json: {
        accessToken: 'rotated-access',
        refreshToken: 'rotated-refresh',
        expiresIn: 900,
        user: {
          id: 'user-1',
          name: 'Portal User',
          phone: '9999999999',
          email: 'portal@example.com',
          isActive: true,
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      } } } }), { status: 200 }),
      new Response(JSON.stringify({ result: { data: { json: {
        id: 'user-1',
        name: 'Portal User',
        phone: '9999999999',
        email: 'portal@example.com',
        isActive: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      } } } }), { status: 200 }),
    ]
    const fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
      expect(args[0]).toBeTruthy()
      return responses.shift()!
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = await portalApi.me()

    expect(user.id).toBe('user-1')
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer expired-access',
    })
    expect(fetchMock.mock.calls[2][1]?.headers).toMatchObject({
      Authorization: 'Bearer rotated-access',
    })
    expect(localStorage.getItem('syrex_service_portal_refresh_token')).toBe('rotated-refresh')
    clearSession()
  })

  it('clears the portal session and records an expired-session state when refresh fails', async () => {
    setSession({
      accessToken: 'expired-access',
      refreshToken: 'expired-refresh',
      expiresIn: 900,
      user: {
        id: 'user-1',
        name: 'Portal User',
        phone: '9999999999',
        email: 'portal@example.com',
        isActive: true,
        createdAt: '2026-06-01T00:00:00.000Z',
      },
    })
    const unauthorized = () => new Response(JSON.stringify({
      error: { json: { message: 'Expired', data: { httpStatus: 401 } } },
    }), { status: 401 })
    vi.stubGlobal('fetch', vi.fn(async () => unauthorized()))

    await expect(portalApi.me()).rejects.toThrow('Expired')
    expect(localStorage.getItem('syrex_service_portal_access_token')).toBeNull()
    expect(localStorage.getItem('syrex_service_portal_refresh_token')).toBeNull()
    expect(consumeSessionExpired()).toBe(true)
    expect(consumeSessionExpired()).toBe(false)
  })
})
