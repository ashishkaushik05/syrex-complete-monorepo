import { createTRPCRouter } from "./trpc";
import { attachmentsRouter } from "./routes/attachments";
import { authRouter } from "./routes/auth";
import { brandsRouter } from "./routes/brands";
import { categoriesRouter } from "./routes/categories";
import { dispatchesRouter } from "./routes/dispatches";
import { imagesRouter } from "./routes/images";
import { inventoryRouter } from "./routes/inventory";
import { invoicesRouter } from "./routes/invoices";
import { invitationsRouter } from "./routes/invitations";
import { ordersRouter } from "./routes/orders";
import { outletsRouter } from "./routes/outlets";
import { paymentsRouter } from "./routes/payments";
import { productsRouter } from "./routes/products";
import { rolesRouter } from "./routes/roles";
import { systemRouter } from "./routes/system";
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
  outlets: outletsRouter,
  warehouses: warehousesRouter,
  orders: ordersRouter
});

export type AppRouter = typeof appRouter;
