import { createTRPCRouter } from "./trpc";
import { attachmentsRouter } from "./routes/attachments";
import { authRouter } from "./routes/auth";
import { brandsRouter } from "./routes/brands";
import { categoriesRouter } from "./routes/categories";
import { dispatchesRouter } from "./routes/dispatches";
import { fieldAttendanceRouter } from "./routes/field-attendance";
import { fieldLocationRouter } from "./routes/field-location";
import { fieldScheduleRouter } from "./routes/field-schedule";
import { fieldShiftsRouter } from "./routes/field-shifts";
import { fieldStopsRouter } from "./routes/field-stops";
import { fieldVisitsRouter } from "./routes/field-visits";
import { imagesRouter } from "./routes/images";
import { inventoryRouter } from "./routes/inventory";
import { invoicesRouter } from "./routes/invoices";
import { invitationsRouter } from "./routes/invitations";
import { ordersRouter } from "./routes/orders";
import { outletPortalRouter } from "./routes/outlet-portal";
import { outletsRouter } from "./routes/outlets";
import { paymentsRouter } from "./routes/payments";
import { productsRouter } from "./routes/products";
import { rolesRouter } from "./routes/roles";
import { serviceAssignmentsRouter } from "./routes/service-assignments";
import { serviceComplaintsRouter } from "./routes/service-complaints";
import { serviceFormsRouter } from "./routes/service-forms";
import { serviceIntegrationsRouter } from "./routes/service-integrations";
import { serviceSerialsRouter } from "./routes/service-serials";
import { serviceTestsRouter } from "./routes/service-tests";
import { serviceWarrantyRouter } from "./routes/service-warranty";
import { systemRouter } from "./routes/system";
import { taxChargesRouter } from "./routes/tax-charges";
import { orgBillingProfileRouter } from "./routes/org-billing-profile";
import { usersRouter } from "./routes/users";
import { warehousesRouter } from "./routes/warehouses";

export const appRouter = createTRPCRouter({
  system: systemRouter,
  attachments: attachmentsRouter,
  auth: authRouter,
  invitations: invitationsRouter,
  users: usersRouter,
  roles: rolesRouter,
  brands: brandsRouter,
  categories: categoriesRouter,
  products: productsRouter,
  images: imagesRouter,
  inventory: inventoryRouter,
  dispatches: dispatchesRouter,
  invoices: invoicesRouter,
  payments: paymentsRouter,
  taxCharges: taxChargesRouter,
  orgBillingProfile: orgBillingProfileRouter,
  outlets: outletsRouter,
  warehouses: warehousesRouter,
  orders: ordersRouter,
  outletPortal: outletPortalRouter,
  fieldShifts: fieldShiftsRouter,
  fieldLocation: fieldLocationRouter,
  fieldVisits: fieldVisitsRouter,
  fieldStops: fieldStopsRouter,
  fieldAttendance: fieldAttendanceRouter,
  fieldSchedule: fieldScheduleRouter,
  serviceComplaints: serviceComplaintsRouter,
  serviceAssignments: serviceAssignmentsRouter,
  serviceForms: serviceFormsRouter,
  serviceTests: serviceTestsRouter,
  serviceSerials: serviceSerialsRouter,
  serviceWarranty: serviceWarrantyRouter,
  serviceIntegrations: serviceIntegrationsRouter,
});

export type AppRouter = typeof appRouter;
