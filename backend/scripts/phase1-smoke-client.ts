import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { P } from "../src/rbac/catalog";

type HeadersMap = Record<string, string>;

const ROOT_DIR = path.resolve(import.meta.dir, "../..");
const SNAPSHOT_DIR = path.join(ROOT_DIR, "plan/phase-gates/snapshots");
const BASE_URL = process.env.PHASE1_BASE_URL ?? "http://127.0.0.1:3001";

const ACTOR_ADMIN = "20000000-0000-4000-8000-000000000001";
const ACTOR_OUTLET = "20000000-0000-4000-8000-000000000002";

async function saveSnapshot(name: string, payload: unknown) {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const file = path.join(SNAPSHOT_DIR, name);
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function trpcQuery(procedure: string, input: unknown, headers?: HeadersMap) {
  const query = encodeURIComponent(JSON.stringify(input));
  const res = await fetch(`${BASE_URL}/trpc/${procedure}?input=${query}`, {
    method: "GET",
    headers
  });
  return res.json();
}

async function trpcMutation(procedure: string, input: unknown, headers?: HeadersMap) {
  const res = await fetch(`${BASE_URL}/trpc/${procedure}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? {})
    },
    body: JSON.stringify({ json: input })
  });
  return res.json();
}

function getData(response: any) {
  if (response?.error) {
    throw new Error(JSON.stringify(response.error));
  }
  return response?.result?.data?.json;
}

async function main() {
  const authLogin = await trpcMutation("auth.login", {
    email: "admin.phase1@syrex.dev",
    password: "admin123"
  });
  await saveSnapshot("phase1_auth_login.json", authLogin);

  const authMe = await trpcQuery("auth.me", null, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_auth_me.json", authMe);

  const authRefresh = await trpcMutation(
    "auth.refresh",
    { refreshToken: getData(authLogin).refreshToken }
  );
  await saveSnapshot("phase1_auth_refresh.json", authRefresh);

  const authLogout = await trpcMutation("auth.logout", undefined, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_auth_logout.json", authLogout);

  const rolesList = await trpcQuery("roles.list", null, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_roles_list.json", rolesList);

  const roleCreate = await trpcMutation(
    "roles.create",
    { name: "Phase1 Temp Role", permissions: [P.catalog.read], isSystem: false },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_roles_create.json", roleCreate);
  const roleId = getData(roleCreate).id as string;

  const roleUpdate = await trpcMutation(
    "roles.update",
    { id: roleId, name: "Phase1 Temp Role Updated", permissions: [P.catalog.read, P.catalog.write] },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_roles_update.json", roleUpdate);

  const usersList = await trpcQuery("users.list", { limit: 10 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_users_list.json", usersList);

  const userCreate = await trpcMutation(
    "users.create",
    {
      email: "phase1.new.user@syrex.dev",
      name: "Phase1 New User",
      password: "phase1pass",
      userType: "internal",
      roleId,
      isActive: true
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_users_create.json", userCreate);
  const userId = getData(userCreate).id as string;

  const userGet = await trpcQuery("users.getById", { id: userId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_users_getById.json", userGet);

  const userUpdate = await trpcMutation(
    "users.update",
    { id: userId, name: "Phase1 Updated User", isActive: true },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_users_update.json", userUpdate);

  const invitationsList = await trpcQuery("invitations.list", { limit: 10 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_invitations_list.json", invitationsList);

  const invitationCreate = await trpcMutation(
    "invitations.create",
    {
      email: "phase1.created.invite@syrex.dev",
      name: "Created Invite",
      role: "Sales",
      expiresAt: "2030-01-02T00:00:00.000Z"
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_invitations_create.json", invitationCreate);
  const invitationId = getData(invitationCreate).id as string;
  const invitationToken = getData(invitationCreate).token as string;

  const invitationRevoke = await trpcMutation(
    "invitations.revoke",
    { id: invitationId },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_invitations_revoke.json", invitationRevoke);

  const invitationAccept = await trpcMutation(
    "invitations.accept",
    { token: "phase1-invite-token" },
    { "x-actor-id": ACTOR_OUTLET }
  );
  await saveSnapshot("phase1_invitations_accept.json", invitationAccept);

  const brandsList = await trpcQuery("brands.list", { limit: 10 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_brands_list.json", brandsList);

  const brandCreate = await trpcMutation(
    "brands.create",
    { name: "Phase1 New Brand", description: "Created in smoke", isActive: true },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_brands_create.json", brandCreate);
  const brandId = getData(brandCreate).id as string;

  const brandGet = await trpcQuery("brands.getById", { id: brandId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_brands_getById.json", brandGet);

  const brandUpdate = await trpcMutation(
    "brands.update",
    { id: brandId, description: "Updated in smoke" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_brands_update.json", brandUpdate);

  const categoriesList = await trpcQuery(
    "categories.list",
    { limit: 10, brandId },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_categories_list.json", categoriesList);

  const categoryCreate = await trpcMutation(
    "categories.create",
    { brandId, name: "Phase1 New Category", description: "Created in smoke", sortOrder: 2, isActive: true },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_categories_create.json", categoryCreate);
  const categoryId = getData(categoryCreate).id as string;

  const categoryGet = await trpcQuery(
    "categories.getById",
    { id: categoryId },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_categories_getById.json", categoryGet);

  const categoryUpdate = await trpcMutation(
    "categories.update",
    { id: categoryId, description: "Updated in smoke", sortOrder: 3 },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_categories_update.json", categoryUpdate);

  const productsList = await trpcQuery(
    "products.list",
    { limit: 10, categoryId },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_products_list.json", productsList);

  const productCreate = await trpcMutation(
    "products.create",
    {
      categoryId,
      name: "Phase1 New Product",
      displayName: "Smoke Product",
      sku: `PHASE1-SMOKE-${Date.now()}`,
      description: "Created in smoke",
      specs: { color: "black", voltage: "220V" },
      warrantyMonths: 18,
      basePrice: "2499.00",
      sortOrder: 10,
      isActive: true
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_products_create.json", productCreate);
  const productId = getData(productCreate).id as string;

  const productGet = await trpcQuery("products.getById", { id: productId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_products_getById.json", productGet);

  const productUpdate = await trpcMutation(
    "products.update",
    { id: productId, description: "Updated in smoke", basePrice: "2599.00" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_products_update.json", productUpdate);

  const imagesList = await trpcQuery("images.list", { limit: 10, productId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_images_list.json", imagesList);

  const imageCreate = await trpcMutation(
    "images.create",
    {
      uri: "https://example.com/phase1-smoke-product.png",
      altText: "Smoke image",
      sortOrder: 2,
      productId
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_images_create.json", imageCreate);
  const imageId = getData(imageCreate).id as string;

  const imageGet = await trpcQuery("images.getById", { id: imageId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_images_getById.json", imageGet);

  const imageUpdate = await trpcMutation(
    "images.update",
    { id: imageId, altText: "Updated smoke image", sortOrder: 3 },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_images_update.json", imageUpdate);

  const warehousesList = await trpcQuery("warehouses.list", { limit: 10 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_warehouses_list.json", warehousesList);

  const warehouseCreate = await trpcMutation(
    "warehouses.create",
    {
      name: "Phase1 New Warehouse",
      location: "Mysuru",
      address: "Smoke warehouse",
      managerId: userId,
      isActive: true
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_warehouses_create.json", warehouseCreate);
  const warehouseId = getData(warehouseCreate).id as string;

  const warehouseGet = await trpcQuery(
    "warehouses.getById",
    { id: warehouseId },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_warehouses_getById.json", warehouseGet);

  const warehouseUpdate = await trpcMutation(
    "warehouses.update",
    { id: warehouseId, location: "Mangaluru" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_warehouses_update.json", warehouseUpdate);

  const outletsList = await trpcQuery("outlets.list", { limit: 10 }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_outlets_list.json", outletsList);

  const outletCreate = await trpcMutation(
    "outlets.create",
    {
      outletCode: `OUT-SMOKE-${Date.now()}`,
      userId,
      warehouseId,
      name: "Smoke Outlet",
      ownerName: "Smoke Owner",
      phone: "+91-9000000002",
      address: "Smoke address",
      creditLimit: "30000",
      isActive: true
    },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_outlets_create.json", outletCreate);
  const outletId = getData(outletCreate).id as string;

  const outletGet = await trpcQuery("outlets.getById", { id: outletId }, { "x-actor-id": ACTOR_ADMIN });
  await saveSnapshot("phase1_outlets_getById.json", outletGet);

  const outletUpdate = await trpcMutation(
    "outlets.update",
    { id: outletId, name: "Smoke Outlet Updated", creditLimit: "35000" },
    { "x-actor-id": ACTOR_ADMIN }
  );
  await saveSnapshot("phase1_outlets_update.json", outletUpdate);

  await saveSnapshot("phase1_smoke_summary.json", {
    status: "ok",
    baseUrl: BASE_URL,
    invitationTokenUsedForCreateSnapshot: invitationToken,
    generatedAt: new Date().toISOString()
  });

  console.log("phase1 smoke client completed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
