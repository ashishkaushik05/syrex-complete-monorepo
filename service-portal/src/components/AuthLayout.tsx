import { BatteryCharging, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { OfflineNotice } from './OfflineNotice'

export function AuthLayout() {
  return (
    <main className="auth-page">
      <OfflineNotice />
      <section className="auth-story">
        <div className="auth-brand"><BatteryCharging size={25} /> Syrex Care</div>
        <div>
          <p className="eyebrow light">Customer service portal</p>
          <h1>Battery support,<br />without the runaround.</h1>
          <p className="auth-story-copy">Raise a complaint, attach evidence, and follow every meaningful update from one place.</p>
        </div>
        <ul className="auth-benefits">
          <li><CheckCircle2 /> Track repair and warranty progress</li>
          <li><CheckCircle2 /> Your complaints stay private to your account</li>
          <li><ShieldCheck /> Customer-safe updates, no internal diagnostics</li>
        </ul>
      </section>
      <section className="auth-form-side"><Outlet /></section>
    </main>
  )
}
