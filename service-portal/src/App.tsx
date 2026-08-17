import { Navigate, Route, Routes } from 'react-router-dom'
import { GuestOnly, RequireAuth } from './auth'
import { AppShell } from './components/AppShell'
import { AuthLayout } from './components/AuthLayout'
import { ComplaintDetailPage } from './pages/ComplaintDetailPage'
import { ComplaintsPage } from './pages/ComplaintsPage'
import { LoginPage } from './pages/LoginPage'
import { NewComplaintPage } from './pages/NewComplaintPage'
import { RegisterPage } from './pages/RegisterPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      </Route>
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/complaints" element={<ComplaintsPage />} />
        <Route path="/complaints/new" element={<NewComplaintPage />} />
        <Route path="/complaints/:id" element={<ComplaintDetailPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/complaints" replace />} />
    </Routes>
  )
}
