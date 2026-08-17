import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth-context'
import { apiErrorMessage, portalApi } from '../lib/api'

export function RegisterPage() {
  const { acceptSession } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password'))
    if (password !== String(data.get('confirmPassword'))) {
      setError('Passwords do not match.')
      return
    }
    setSubmitting(true)
    try {
      const session = await portalApi.register({
        name: String(data.get('name')),
        phone: String(data.get('phone')),
        email: String(data.get('email')),
        password,
      })
      acceptSession(session)
      navigate('/complaints', { replace: true })
    } catch (nextError) {
      setError(apiErrorMessage(nextError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-card auth-card-wide">
      <p className="eyebrow">Get started</p>
      <h2>Create your account</h2>
      <p className="muted">Use the same contact details you provide with your complaint.</p>
      {error && <div className="form-error" role="alert">{error}</div>}
      <form onSubmit={submit} className="form-stack">
        <div className="form-grid two">
          <label>Full name<input name="name" autoComplete="name" required /></label>
          <label>Phone number<input name="phone" type="tel" autoComplete="tel" required /></label>
        </div>
        <label>Email<input name="email" type="email" autoComplete="email" required /></label>
        <div className="form-grid two">
          <label>Password<input name="password" type="password" minLength={8} autoComplete="new-password" required /></label>
          <label>Confirm password<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required /></label>
        </div>
        <button className="primary-button" disabled={submitting}>{submitting ? 'Creating account...' : 'Create account'}</button>
      </form>
      <p className="auth-switch">Already registered? <Link to="/login">Sign in</Link></p>
    </div>
  )
}
