import { Navigate, Route, BrowserRouter as Router, Routes, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { AdminRoute } from '@/components/AdminRoute'
import { DashboardErrorBoundary } from '@/components/DashboardErrorBoundary'
import { usePermission } from '@/context/PermissionContext'
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
import { ServiceFormsPage } from '@/pages/dashboard/ServiceFormsPage'
import { FieldSenseLiveMapPage } from '@/pages/dashboard/FieldSenseLiveMapPage'
import { FieldSenseSchedulePage } from '@/pages/dashboard/FieldSenseSchedulePage'
import { FieldSenseAttendancePage } from '@/pages/dashboard/FieldSenseAttendancePage'
import { FieldSenseShiftsPage } from '@/pages/dashboard/FieldSenseShiftsPage'
import { FieldSenseShiftDetailPage } from '@/pages/dashboard/FieldSenseShiftDetailPage'
import { FieldSenseVisitsPage } from '@/pages/dashboard/FieldSenseVisitsPage'
import { FieldSenseStopsPage } from '@/pages/dashboard/FieldSenseStopsPage'
import { BillingSettingsPage } from '@/pages/dashboard/BillingSettingsPage'

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

function PermissionRoute({
  required,
  children,
}: {
  required: string | string[]
  children: React.ReactNode
}) {
  const { can } = usePermission()
  const allowed = Array.isArray(required)
    ? required.some((permission) => can(permission))
    : can(required)

  if (!allowed) return <Navigate to="/forbidden" replace />
  return <>{children}</>
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
            <Route path="users" element={<PermissionRoute required="users:read"><UsersPage /></PermissionRoute>} />
            <Route path="roles" element={<PermissionRoute required="roles:read"><RolesPage /></PermissionRoute>} />
            <Route path="permissions" element={<PermissionRoute required="roles:read"><PermissionsCatalogPage /></PermissionRoute>} />
            <Route path="outlets" element={<PermissionRoute required="outlets:read"><OutletsPage /></PermissionRoute>} />
            <Route path="outlets/:id" element={<PermissionRoute required="outlets:read"><OutletDetailPage /></PermissionRoute>} />
            <Route path="sales/orders" element={<PermissionRoute required="orders:read"><SalesOrdersPage /></PermissionRoute>} />
            <Route path="sales/orders/:id" element={<PermissionRoute required="orders:read"><OrderDetailPage /></PermissionRoute>} />
            <Route path="sales/dispatches" element={<PermissionRoute required="dispatches:read"><SalesDispatchesPage /></PermissionRoute>} />
            <Route path="sales/dispatches/:id" element={<PermissionRoute required="dispatches:read"><DispatchDetailPage /></PermissionRoute>} />
            <Route path="sales/reports" element={<PermissionRoute required="orders:read"><SaleReportsPage /></PermissionRoute>} />
            <Route path="sales/reports/:id" element={<PermissionRoute required="orders:read"><SaleReportDetailPage /></PermissionRoute>} />
            <Route path="catalog/brands" element={<PermissionRoute required="catalog:read"><CatalogBrandsPage /></PermissionRoute>} />
            <Route path="catalog/categories" element={<PermissionRoute required="catalog:read"><CatalogCategoriesPage /></PermissionRoute>} />
            <Route path="catalog/skus" element={<PermissionRoute required="catalog:read"><CatalogSkusPage /></PermissionRoute>} />
            <Route path="dispatch/orders" element={<PermissionRoute required="orders:read"><SalesOrdersPage /></PermissionRoute>} />
            <Route path="dispatch/orders/:id" element={<PermissionRoute required="orders:read"><OrderDetailPage /></PermissionRoute>} />
            <Route path="dispatch/runs" element={<PermissionRoute required="dispatches:read"><SalesDispatchesPage /></PermissionRoute>} />
            <Route path="dispatch/runs/:id" element={<PermissionRoute required="dispatches:read"><DispatchDetailPage /></PermissionRoute>} />
            <Route path="dispatch/warehouses" element={<PermissionRoute required="warehouses:read"><WarehousesPage /></PermissionRoute>} />
            <Route path="dispatch/warehouses/:id" element={<PermissionRoute required="warehouses:read"><WarehouseDetailPage /></PermissionRoute>} />
            <Route path="dispatch/warehouses/:id/grn" element={<Navigate to="/dashboard/dispatch/warehouses" replace />} />
            <Route path="dispatch/warehouses/:id/adjustment" element={<Navigate to="/dashboard/dispatch/warehouses" replace />} />
            <Route path="dispatch/queue" element={<PermissionRoute required="dispatches:read"><DispatchPlanPage /></PermissionRoute>} />
            <Route path="dispatch/queue/:warehouseId" element={<PermissionRoute required="dispatches:read"><DispatchPlanPage /></PermissionRoute>} />
            <Route path="accounts/invoices" element={<PermissionRoute required="invoices:read"><SalesInvoicesPage /></PermissionRoute>} />
            <Route path="accounts/invoices/:id" element={<PermissionRoute required="invoices:read"><InvoiceDetailPage /></PermissionRoute>} />
            <Route path="accounts/approval" element={<PermissionRoute required="orders:approve"><AccountsApprovalQueuePage /></PermissionRoute>} />
            <Route path="accounts/ar-aging" element={<PermissionRoute required="invoices:read"><AccountsARAgingPage /></PermissionRoute>} />
            <Route path="accounts/outstanding" element={<PermissionRoute required="payments:read"><AccountsOutstandingPage /></PermissionRoute>} />
            <Route path="accounts/payments" element={<PermissionRoute required="payments:write"><AccountsPaymentsPage /></PermissionRoute>} />
            <Route path="warehouses" element={<PermissionRoute required="warehouses:read"><WarehousesPage /></PermissionRoute>} />
            <Route path="warehouses/:id" element={<PermissionRoute required="warehouses:read"><WarehouseDetailPage /></PermissionRoute>} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="service/complaints" element={<PermissionRoute required="service:read"><ServiceComplaintsPage /></PermissionRoute>} />
            <Route path="service/complaints/:id" element={<PermissionRoute required="service:read"><ServiceComplaintDetailPage /></PermissionRoute>} />
            <Route path="service/serials" element={<PermissionRoute required="service:read"><ServiceSerialsPage /></PermissionRoute>} />
            <Route path="service/warranty" element={<PermissionRoute required="service:approve"><ServiceWarrantyPage /></PermissionRoute>} />
            <Route path="service/integrations" element={<PermissionRoute required="service:manage"><ServiceIntegrationsPage /></PermissionRoute>} />
            <Route path="service/forms" element={<PermissionRoute required={['service:templates', 'service:manage']}><ServiceFormsPage /></PermissionRoute>} />
            <Route path="map" element={<PermissionRoute required="field:read"><FieldSenseLiveMapPage /></PermissionRoute>} />
            <Route path="field-schedule" element={<PermissionRoute required="field:write"><FieldSenseSchedulePage /></PermissionRoute>} />
            <Route path="attendance" element={<PermissionRoute required="field:read"><FieldSenseAttendancePage /></PermissionRoute>} />
            <Route path="field-shifts" element={<PermissionRoute required="field:read"><FieldSenseShiftsPage /></PermissionRoute>} />
            <Route path="field-shifts/:id" element={<PermissionRoute required="field:read"><FieldSenseShiftDetailPage /></PermissionRoute>} />
            <Route path="field-visits" element={<PermissionRoute required="field:read"><FieldSenseVisitsPage /></PermissionRoute>} />
            <Route path="field-stops" element={<PermissionRoute required="field:read"><FieldSenseStopsPage /></PermissionRoute>} />
            <Route path="service/catalog/brands" element={<Navigate to="/dashboard/catalog/brands" replace />} />
            <Route path="service/catalog/categories" element={<Navigate to="/dashboard/catalog/categories" replace />} />
            <Route path="service/catalog/skus" element={<Navigate to="/dashboard/catalog/skus" replace />} />
            <Route path="sales/invoices" element={<Navigate to="/dashboard/accounts/invoices" replace />} />
            <Route path="sales/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="dispatch/invoices" element={<Navigate to="/dashboard/accounts/invoices" replace />} />
            <Route path="dispatch/invoices/:id" element={<InvoiceDetailPage />} />
            <Route path="distribution/warehouse-assignment" element={<Navigate to="/dashboard/dispatch/queue" replace />} />
            <Route path="settings/billing" element={<PermissionRoute required="billing:manage"><BillingSettingsPage /></PermissionRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </PermissionProvider>
  )
}
