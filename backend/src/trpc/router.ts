import { createTRPCRouter } from "./trpc";
import { authRouter } from "./routes/auth";
import { brandsRouter } from "./routes/brands";
import { categoriesRouter } from "./routes/categories";
import { imagesRouter } from "./routes/images";
import { invitationsRouter } from "./routes/invitations";
import { outletsRouter } from "./routes/outlets";
import { productsRouter } from "./routes/products";
import { rolesRouter } from "./routes/roles";
import { systemRouter } from "./routes/system";
import { usersRouter } from "./routes/users";
import { warehousesRouter } from "./routes/warehouses";

export const appRouter = createTRPCRouter({
  system: systemRouter,
  auth: authRouter,
  invitations: invitationsRouter,
  users: usersRouter,
  roles: rolesRouter,
  brands: brandsRouter,
  categories: categoriesRouter,
  products: productsRouter,
  images: imagesRouter,
  outlets: outletsRouter,
  warehouses: warehousesRouter
});

export type AppRouter = typeof appRouter;
