// Minimal seed for client-facing demo environments: just enough structural
// data (roles, RBAC permissions, chart of accounts, service form templates)
// plus a single warehouse/outlet/product set so every screen renders without
// looking empty, and exactly 3 login users (Admin / Warehouse Manager /
// Outlet) whose passwords are supplied via env vars at run time so they are
// never committed to the repo. Falls back to a random password (printed once)
// for any credential not supplied.
//
// Usage:
//   ADMIN_PASSWORD=... WAREHOUSE_PASSWORD=... OUTLET_PASSWORD=... \
//     bun run scripts/minimal-seed.ts
import { Prisma, PrismaClient, UserType } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { assertNonProductionCommand } from "../src/config/runtime-safety";
import { validatePermissionKeys } from "../src/rbac/catalog";
import {
  DEV_SALES_PERMISSIONS,
  DEV_WAREHOUSE_PERMISSIONS,
  DISTRIBUTION_HEAD_PERMISSIONS,
  OUTLET_PERMISSIONS,
  SERVICE_ASI_PERMISSIONS,
  SERVICE_SE_PERMISSIONS,
  SERVICE_RSM_PERMISSIONS,
  SERVICE_HAPPY_CALLING_PERMISSIONS,
  SERVICE_HEAD_PERMISSIONS,
} from "./seed-permissions";
import { installBatteryWarrantyTemplate } from "../src/service/battery-warranty-template";
import { installBatteryTestStandardTemplate } from "../src/service/battery-test-standard-template";
import { seedChartOfAccounts } from "./seed-chart-of-accounts";

assertNonProductionCommand("minimal-seed");

const prisma = new PrismaClient();

function randomPassword(): string {
  return randomBytes(12).toString("base64url"); // 16 chars, url-safe
}

const IDS = {
  billingProfiles: {
    company: "c1000000-0000-4000-8000-000000000001",
    warehouse: "c1000000-0000-4000-8000-000000000002",
    outlet: "c1000000-0000-4000-8000-000000000003",
  },
  warehouse: "c2000000-0000-4000-8000-000000000001",
  outlet: "c3000000-0000-4000-8000-000000000001",
  brand: "c4000000-0000-4000-8000-000000000001",
  categories: {
    inverter: "c5000000-0000-4000-8000-000000000001",
    automotive: "c5000000-0000-4000-8000-000000000002",
  },
  products: {
    inv100: "c6000000-0000-4000-8000-000000000001",
    inv150: "c6000000-0000-4000-8000-000000000002",
    auto55: "c6000000-0000-4000-8000-000000000003",
  },
} as const;

type RoleName = "Admin" | "Sales" | "Warehouse Manager" | "Distribution Head" | "Outlet" | "ASI" | "Service Engineer" | "RSM" | "Customer Executive" | "Service Head";

async function ensureRoles() {
  const checks: Array<[string, readonly string[]]> = [
    ["Sales", DEV_SALES_PERMISSIONS],
    ["Warehouse Manager", DEV_WAREHOUSE_PERMISSIONS],
    ["Distribution Head", DISTRIBUTION_HEAD_PERMISSIONS],
    ["Outlet", OUTLET_PERMISSIONS],
    ["ASI", SERVICE_ASI_PERMISSIONS],
    ["Service Engineer", SERVICE_SE_PERMISSIONS],
    ["RSM", SERVICE_RSM_PERMISSIONS],
    ["Customer Executive", SERVICE_HAPPY_CALLING_PERMISSIONS],
    ["Service Head", SERVICE_HEAD_PERMISSIONS],
  ];
  for (const [label, perms] of checks) {
    const { invalid } = validatePermissionKeys([...perms]);
    if (invalid.length > 0) throw new Error(`[minimal-seed] Invalid ${label} permission keys: ${invalid.join(", ")}`);
  }

  const roleDefs: Array<[RoleName, string[], boolean]> = [
    ["Admin", ["*"], true],
    ["Sales", [...DEV_SALES_PERMISSIONS], false],
    ["Warehouse Manager", [...DEV_WAREHOUSE_PERMISSIONS], false],
    ["Distribution Head", [...DISTRIBUTION_HEAD_PERMISSIONS], false],
    ["Outlet", [...OUTLET_PERMISSIONS], false],
    ["ASI", [...SERVICE_ASI_PERMISSIONS], false],
    ["Service Engineer", [...SERVICE_SE_PERMISSIONS], false],
    ["RSM", [...SERVICE_RSM_PERMISSIONS], false],
    ["Customer Executive", [...SERVICE_HAPPY_CALLING_PERMISSIONS], false],
    ["Service Head", [...SERVICE_HEAD_PERMISSIONS], false],
  ];

  const byName = {} as Record<RoleName, string>;
  for (const [name, permissions, isSystem] of roleDefs) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { permissions, isSystem },
      create: { name, permissions, isSystem },
    });
    byName[name] = role.id;
  }
  return { byName };
}

async function upsertUser(opts: { email: string; name: string; roleId: string; userType: UserType; password: string }) {
  const passwordHash = await Bun.password.hash(opts.password, { algorithm: "bcrypt", cost: 12 });
  return prisma.user.upsert({
    where: { email: opts.email },
    update: { name: opts.name, passwordHash, userType: opts.userType, roleId: opts.roleId, isActive: true },
    create: { email: opts.email, name: opts.name, passwordHash, userType: opts.userType, roleId: opts.roleId, isActive: true },
  });
}

async function main() {
  const roles = await ensureRoles();

  const credentials = {
    admin: process.env.ADMIN_PASSWORD ?? randomPassword(),
    warehouse: process.env.WAREHOUSE_PASSWORD ?? randomPassword(),
    outlet: process.env.OUTLET_PASSWORD ?? randomPassword(),
  };

  const adminUser = await upsertUser({
    email: "admin@syrex.local",
    name: "Admin",
    roleId: roles.byName.Admin,
    userType: UserType.internal,
    password: credentials.admin,
  });
  const warehouseUser = await upsertUser({
    email: "warehouse@syrex.local",
    name: "Warehouse Manager",
    roleId: roles.byName["Warehouse Manager"],
    userType: UserType.internal,
    password: credentials.warehouse,
  });
  const outletUser = await upsertUser({
    email: "outlet@syrex.local",
    name: "Outlet User",
    roleId: roles.byName.Outlet,
    userType: UserType.outlet,
    password: credentials.outlet,
  });

  const billingProfileSeeds = [
    { id: IDS.billingProfiles.company, legalName: "Syrex Industries Private Limited", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", addressLine1: "Peenya Industrial Area", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560058", profileType: "company" as const, canIssueGrnInvoice: true },
    { id: IDS.billingProfiles.warehouse, legalName: "Syrex Demo Hub", gstin: "29FGHIJ5678K1Z2", pan: "FGHIJ5678K", addressLine1: "Peenya Industrial Area", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560058", profileType: "warehouse" as const, canIssueGrnInvoice: false },
    { id: IDS.billingProfiles.outlet, legalName: "Demo Traders", gstin: "29RSTUV3456W1Z4", pan: "RSTUV3456W", addressLine1: "Malleshwaram", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560003", profileType: "outlet" as const, canIssueGrnInvoice: false },
  ];
  for (const profile of billingProfileSeeds) {
    await prisma.billingProfile.upsert({
      where: { id: profile.id },
      update: { ...profile, isActive: true },
      create: { ...profile, isActive: true },
    });
  }

  const warehouse = await prisma.warehouse.upsert({
    where: { id: IDS.warehouse },
    update: { name: "Demo Warehouse", location: "Bengaluru", address: "Peenya Industrial Area, Bengaluru", managerId: warehouseUser.id, billingProfileId: IDS.billingProfiles.warehouse, isActive: true },
    create: { id: IDS.warehouse, name: "Demo Warehouse", location: "Bengaluru", address: "Peenya Industrial Area, Bengaluru", managerId: warehouseUser.id, billingProfileId: IDS.billingProfiles.warehouse, isActive: true },
  });

  await prisma.outlet.upsert({
    where: { id: IDS.outlet },
    update: { outletCode: "OUT-DEMO-001", userId: outletUser.id, warehouseId: warehouse.id, billingProfileId: IDS.billingProfiles.outlet, name: "Demo Traders", ownerName: "Demo Owner", phone: "+91-9000000001", address: "Malleshwaram, Bengaluru", creditLimit: new Prisma.Decimal("50000"), isActive: true },
    create: { id: IDS.outlet, outletCode: "OUT-DEMO-001", userId: outletUser.id, warehouseId: warehouse.id, billingProfileId: IDS.billingProfiles.outlet, name: "Demo Traders", ownerName: "Demo Owner", phone: "+91-9000000001", address: "Malleshwaram, Bengaluru", creditLimit: new Prisma.Decimal("50000"), isActive: true },
  });

  await prisma.brand.upsert({
    where: { id: IDS.brand },
    update: { name: "Syrex", description: "Syrex battery systems", isActive: true },
    create: { id: IDS.brand, name: "Syrex", description: "Syrex battery systems", isActive: true },
  });

  const categorySeeds = [
    { id: IDS.categories.inverter, name: "Inverter Batteries", description: "Tubular and inverter battery range", sortOrder: 1 },
    { id: IDS.categories.automotive, name: "Automotive Batteries", description: "Automotive starting battery range", sortOrder: 2 },
  ];
  for (const cat of categorySeeds) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { brandId: IDS.brand, name: cat.name, description: cat.description, sortOrder: cat.sortOrder, isActive: true },
      create: { id: cat.id, brandId: IDS.brand, name: cat.name, description: cat.description, sortOrder: cat.sortOrder, isActive: true },
    });
  }

  const productSeeds = [
    { id: IDS.products.inv100, categoryId: IDS.categories.inverter, name: "Syrex Inverter Battery 100Ah", displayName: "Syrex 100Ah Tall Tubular", sku: "SYR-INV-100", description: "100Ah inverter battery for home backup.", warrantyMonths: 36, basePrice: "10999", sortOrder: 1, specs: { capacityAh: 100, segment: "inverter", brand: "Syrex" } },
    { id: IDS.products.inv150, categoryId: IDS.categories.inverter, name: "Syrex Inverter Battery 150Ah", displayName: "Syrex 150Ah Tall Tubular", sku: "SYR-INV-150", description: "150Ah inverter battery for extended backup.", warrantyMonths: 42, basePrice: "13999", sortOrder: 2, specs: { capacityAh: 150, segment: "inverter", brand: "Syrex" } },
    { id: IDS.products.auto55, categoryId: IDS.categories.automotive, name: "Syrex Automotive Battery 55Ah", displayName: "Syrex Auto 55Ah", sku: "SYR-AUTO-55", description: "55Ah maintenance-free automotive battery.", warrantyMonths: 24, basePrice: "6299", sortOrder: 1, specs: { capacityAh: 55, segment: "automotive", brand: "Syrex" } },
  ];
  for (const p of productSeeds) {
    const isAutomotive = p.sku.includes("AUTO");
    const taxConfig = {
      hsnCode: isAutomotive ? "85071000" : "85072000",
      uqc: "NOS",
      gstRate: new Prisma.Decimal(isAutomotive ? "28" : "18"),
      transferValue: new Prisma.Decimal(p.basePrice).mul("0.72").toDecimalPlaces(2),
    };
    await prisma.product.upsert({
      where: { id: p.id },
      update: { categoryId: p.categoryId, name: p.name, displayName: p.displayName, sku: p.sku, description: p.description, specs: p.specs, warrantyMonths: p.warrantyMonths, basePrice: new Prisma.Decimal(p.basePrice), ...taxConfig, sortOrder: p.sortOrder, isActive: true },
      create: { id: p.id, categoryId: p.categoryId, name: p.name, displayName: p.displayName, sku: p.sku, description: p.description, specs: p.specs, warrantyMonths: p.warrantyMonths, basePrice: new Prisma.Decimal(p.basePrice), ...taxConfig, sortOrder: p.sortOrder, isActive: true },
    });
  }

  await installBatteryWarrantyTemplate(prisma, {
    orgId: process.env.DEFAULT_ORG_ID ?? "org-syrex-dev",
    createdById: adminUser.id,
  });
  await installBatteryTestStandardTemplate(prisma, {
    orgId: process.env.DEFAULT_ORG_ID ?? "org-syrex-dev",
    createdById: adminUser.id,
  });

  const year = new Date().getFullYear();
  await prisma.orderSequence.upsert({ where: { year }, update: { lastSequence: 0 }, create: { year, lastSequence: 0 } });
  await prisma.invoiceSequence.upsert({ where: { year }, update: { lastSequence: 0 }, create: { year, lastSequence: 0 } });

  await seedChartOfAccounts(prisma);

  console.log(
    JSON.stringify(
      {
        seeded: true,
        summary: { users: 3, warehouses: 1, outlets: 1, brands: 1, categories: categorySeeds.length, products: productSeeds.length },
        credentials: [
          { email: "admin@syrex.local", password: credentials.admin, role: "Admin" },
          { email: "warehouse@syrex.local", password: credentials.warehouse, role: "Warehouse Manager" },
          { email: "outlet@syrex.local", password: credentials.outlet, role: "Outlet" },
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
