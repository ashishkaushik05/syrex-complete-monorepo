import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AdminRoute } from '@/components/AdminRoute'
import { DashboardErrorBoundary } from '@/components/DashboardErrorBoundary'
import { PermissionProvider } from '@/context/PermissionContext'
import { useAuth } from '@/hooks/useAuth'
import { LoginPage } from '@/pages/LoginPage'
import { ForbiddenPage } from '@/pages/ForbiddenPage'
import { InvitationAcceptPage } from '@/pages/InvitationAcceptPage'
import { DashboardLayout } from '@/pages/dashboard/DashboardLayout'
import { NotificationsPage } from '@/pages/dashboard/NotificationsPage'
import { OverviewPage } from '@/pages/dashboard/OverviewPage'
import { UsersPage } from '@/pages/dashboard/UsersPage'
import { RolesPage } from '@/pages/dashboard/RolesPage'
import { PermissionsCatalogPage } from '@/pages/dashboard/PermissionsCatalogPage'
import { OutletsPage } from '@/pages/dashboard/OutletsPage'
import { SalesOrdersPage } from '@/pages/dashboard/SalesOrdersPage'
import { SalesInvoicesPage } from '@/pages/dashboard/SalesInvoicesPage'
import { SalesDispatchesPage } from '@/pages/dashboard/SalesDispatchesPage'
import { OrderDetailPage } from '@/pages/dashboard/OrderDetailPage'
import { InvoiceDetailPage } from '@/pages/dashboard/InvoiceDetailPage'
import { DispatchDetailPage } from '@/pages/dashboard/DispatchDetailPage'
import { SaleReportsPage } from '@/pages/dashboard/SaleReportsPage'
import { SaleReportDetailPage } from '@/pages/dashboard/SaleReportDetailPage'
import { CatalogBrandsPage } from '@/pages/dashboard/CatalogBrandsPage'
import { CatalogCategoriesPage } from '@/pages/dashboard/CatalogCategoriesPage'
import { CatalogSkusPage } from '@/pages/dashboard/CatalogSkusPage'
import { AccountsApprovalQueuePage } from '@/pages/dashboard/AccountsApprovalQueuePage'
import { AccountsARAgingPage } from '@/pages/dashboard/AccountsARAgingPage'
import { AccountsOutstandingPage } from '@/pages/dashboard/AccountsOutstandingPage'
import { AccountsPaymentsPage } from '@/pages/dashboard/AccountsPaymentsPage'
import { WarehousesPage } from '@/pages/dashboard/WarehousesPage'
import { WarehouseDetailPage } from '@/pages/dashboard/WarehouseDetailPage'
import { DispatchPlanPage } from '@/pages/dashboard/DispatchPlanPage'
import { OutletDetailPage } from '@/pages/dashboard/OutletDetailPage'
import { ServiceComplaintDetailPage } from '@/pages/dashboard/ServiceComplaintDetailPage'
import { ServiceComplaintsPage } from '@/pages/dashboard/ServiceComplaintsPage'
import { ServiceSerialsPage } from '@/pages/dashboard/ServiceSerialsPage'
import { ServiceWarrantyPage } from '@/pages/dashboard/ServiceWarrantyPage'
import { ServiceIntegrationsPage } from '@/pages/dashboard/ServiceIntegrationsPage'
import { FieldSenseLiveMapPage } from '@/pages/dashboard/FieldSenseLiveMapPage'
import { FieldSenseSchedulePage } from '@/pages/dashboard/FieldSenseSchedulePage'
import { FieldSenseAttendancePage } from '@/pages/dashboard/FieldSenseAttendancePage'
import { FieldSenseShiftsPage } from '@/pages/dashboard/FieldSenseShiftsPage'
import { FieldSenseVisitsPage } from '@/pages/dashboard/FieldSenseVisitsPage'
import { FieldSenseStopsPage } from '@/pages/dashboard/FieldSenseStopsPage'

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { authQuery, isAuthenticated } = useAuth()

  if (authQuery.isLoading) return <FullScreenLoader />
  if (!isAuthenticated) return <Navigate to="/login" replace />

  return <>{children}</>
}

function LoginRoute() {
  const { authQuery, isAuthenticated, user } = useAuth()

  if (authQuery.isLoading) return <FullScreenLoader />
  if (isAuthenticated) {
    return <Navigate to={user?.userType === 'internal' ? '/dashboard' : '/forbidden'} replace />
  }

  return <LoginPage />
}

function DashboardShell() {
  const location = useLocation()

  return (
    <DashboardErrorBoundary resetKey={location.pathname}>
      <DashboardLayout />
    </DashboardErrorBoundary>
  )
}

export default function App() {
  return (
    <PermissionProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route path="/invite/accept" element={<InvitationAcceptPage />} />
          <Route
            path="/forbidden"
            element={
              <ProtectedRoute>
                <ForbiddenPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <AdminRoute>
                <DashboardShell />
              </AdminRoute>
            }
          >
            <Route index element={<OverviewPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="roles" element={<RolesPage />} />
            <Route path="permissions" element={<PermissionsCatalogPage />} />
            <Route path="outlets" element={<OutletsPage />} />
            <Route path="outlets/:id" element={<OutletDetailPage />} />
            <Route path="sales/orders" element={<SalesOrdersPage />} />
            <Route path="sales/orders/:id" element={<OrderDetailPage />} />
            <Route path="sales/dispatches" element={<SalesDispatchesPage />} />
            <Route path="sales/dispatches/:id" element={<DispatchDetailPage />} />
            <Route path="sales/reports" element={<SaleReportsPage />} />
            <Route path="sales/reports/:id" element={<SaleReportDetailPage />} />
            <Route path="catalog/brands" element={<CatalogBrandsPage />} />
            <Route path="catalog/categories" element={<CatalogCategoriesPage />} />
            <Route path="catalog/skus" element={<CatalogSkusPage />} />
            <Route path="dispatch/orders" element={<SalesOrdersPage />} />
            <Route path="dispatch/orders/:id" element={<OrderDetailPage />} />
            <Route path="dispatch/runs" element={<SalesDispatchesPage />} />
            <Route path="dispatch/runs/:id" element={<DispatchDetailPage />} />
            <Route path="dispatch/warehouses" element={<WarehousesPage />} />
            <Route path="dispatch/warehouses/:id" element={<WarehouseDetailPage />} />
            <Route path="dispatch/warehouses/:id/grn" element={<Navigate to="/dashboard/dispatch/warehouses" replace />} />
            <Route path="dispatch/warehouses/:id/adjustment" element={<Navigate to="/dashboard/dispatch/warehouses" replace />} />
            <Route path="dispatch/queue" element={<DispatchPlanPage />} />
            <Route path="dispatch/queue/:warehouseId" element={<DispatchPlanPage />} />
            <Route path="accounts/invoices" element={<SalesInvoicesPage />} />
            <Route path="accounts/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="accounts/approval" element={<AccountsApprovalQueuePage />} />
            <Route path="accounts/ar-aging" element={<AccountsARAgingPage />} />
            <Route path="accounts/outstanding" element={<AccountsOutstandingPage />} />
            <Route path="accounts/payments" element={<AccountsPaymentsPage />} />
            <Route path="warehouses" element={<WarehousesPage />} />
            <Route path="warehouses/:id" element={<WarehouseDetailPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="service/complaints" element={<ServiceComplaintsPage />} />
            <Route path="service/complaints/:id" element={<ServiceComplaintDetailPage />} />
            <Route path="service/serials" element={<ServiceSerialsPage />} />
            <Route path="service/warranty" element={<ServiceWarrantyPage />} />
            <Route path="service/integrations" element={<ServiceIntegrationsPage />} />
            <Route path="map" element={<FieldSenseLiveMapPage />} />
            <Route path="field-schedule" element={<FieldSenseSchedulePage />} />
            <Route path="attendance" element={<FieldSenseAttendancePage />} />
            <Route path="field-shifts" element={<FieldSenseShiftsPage />} />
            <Route path="field-visits" element={<FieldSenseVisitsPage />} />
            <Route path="field-stops" element={<FieldSenseStopsPage />} />
            <Route path="service/catalog/brands" element={<Navigate to="/dashboard/catalog/brands" replace />} />
            <Route path="service/catalog/categories" element={<Navigate to="/dashboard/catalog/categories" replace />} />
            <Route path="service/catalog/skus" element={<Navigate to="/dashboard/catalog/skus" replace />} />
            <Route path="sales/invoices" element={<Navigate to="/dashboard/accounts/invoices" replace />} />
            <Route path="sales/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="dispatch/invoices" element={<Navigate to="/dashboard/accounts/invoices" replace />} />
            <Route path="dispatch/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="distribution/warehouse-assignment" element={<Navigate to="/dashboard/dispatch/queue" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </PermissionProvider>
  )
}
