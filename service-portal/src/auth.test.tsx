import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, type AuthContextValue } from './auth-context'
import { GuestOnly, RequireAuth } from './auth'

const user = {
  id: 'user-1',
  name: 'Portal User',
  phone: '9999999999',
  email: 'portal@example.com',
  isActive: true,
  createdAt: '2026-06-01T00:00:00.000Z',
}

function renderGuard(value: AuthContextValue, child: React.ReactNode, guest = false) {
  const Guard = guest ? GuestOnly : RequireAuth
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/complaints']}>
      <AuthContext.Provider value={value}>
        <Guard>{child}</Guard>
      </AuthContext.Provider>
    </MemoryRouter>,
  )
}

describe('portal auth guards', () => {
  it('shows a session-check state while authentication is loading', () => {
    const html = renderGuard({
      user: null,
      loading: true,
      acceptSession: vi.fn(),
      signOut: vi.fn(),
    }, <div>Protected content</div>)
    expect(html).toContain('Checking your session')
    expect(html).not.toContain('Protected content')
  })

  it('renders protected content only for an authenticated portal user', () => {
    const unauthenticated = renderGuard({
      user: null,
      loading: false,
      acceptSession: vi.fn(),
      signOut: vi.fn(),
    }, <div>Protected content</div>)
    expect(unauthenticated).not.toContain('Protected content')

    const authenticated = renderGuard({
      user,
      loading: false,
      acceptSession: vi.fn(),
      signOut: vi.fn(),
    }, <div>Protected content</div>)
    expect(authenticated).toContain('Protected content')
  })

  it('keeps authenticated users out of guest-only pages', () => {
    const html = renderGuard({
      user,
      loading: false,
      acceptSession: vi.fn(),
      signOut: vi.fn(),
    }, <div>Login form</div>, true)
    expect(html).not.toContain('Login form')
  })
})
