import { LogOut, Plus, Wrench } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth-context'
import { OfflineNotice } from './OfflineNotice'

export function AppShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="app-shell">
      <OfflineNotice />
      <header className="app-header">
        <Link to="/complaints" className="brand-mark" aria-label="Syrex Care home">
          <span className="brand-icon"><Wrench size={19} /></span>
          <span><strong>Syrex</strong><small>Care portal</small></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/complaints" end>My complaints</NavLink>
          <NavLink to="/complaints/new"><Plus size={16} /> Raise complaint</NavLink>
        </nav>
        <div className="profile-block">
          <span><strong>{user?.name}</strong><small>{user?.email}</small></span>
          <button
            className="icon-button"
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="page-wrap"><Outlet /></main>
    </div>
  )
}
