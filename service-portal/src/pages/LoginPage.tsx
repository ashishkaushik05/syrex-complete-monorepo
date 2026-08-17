import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth-context'
import { apiErrorMessage, consumeSessionExpired, portalApi } from '../lib/api'

export function LoginPage() {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState(() => (
    consumeSessionExpired()
      ? 'Your session expired. Sign in again to continue.'
      : ''
  ))
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const data = new FormData(event.currentTarget)
    try {
      const session = await portalApi.login({
        email: String(data.get('email')),
        password: String(data.get('password')),
      })
      acceptSession(session)
      const target = (location.state as { from?: string } | null)?.from || '/complaints'
      navigate(target, { replace: true })
    } catch (nextError) {
      setError(apiErrorMessage(nextError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-card">
      <p className="eyebrow">Welcome back</p>
      <h2>Sign in to your account</h2>
      <p className="muted">See your complaint status and warranty updates.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form onSubmit={submit} className="form-stack">
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary-button" disabled={submitting}>{submitting ? 'Signing in...' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">New to Syrex Care? <Link to="/register">Create an account</Link></p>
    </div>
  )
}
