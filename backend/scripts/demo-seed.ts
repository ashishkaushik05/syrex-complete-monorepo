import { Prisma, PrismaClient, UserType } from "@prisma/client";
import { validatePermissionKeys } from "../src/rbac/catalog";
import {
  DEV_SALES_PERMISSIONS,
  DEV_WAREHOUSE_PERMISSIONS,
  OUTLET_PERMISSIONS,
  SERVICE_ASI_PERMISSIONS,
  SERVICE_SE_PERMISSIONS,
} from "./seed-permissions";

const prisma = new PrismaClient();

// ── IDs ───────────────────────────────────────────────────────────────────────
const IDS = {
  brands: {
    syrex:  "f5000000-0000-4000-8000-000000000001",
    salmon: "f5000000-0000-4000-8000-000000000002",
  },
  categories: {
    syrexInverter:    "f6000000-0000-4000-8000-000000000001",
    syrexAutomotive:  "f6000000-0000-4000-8000-000000000002",
    salmonInverter:   "f6000000-0000-4000-8000-000000000003",
    salmonAutomotive: "f6000000-0000-4000-8000-000000000004",
  },
  products: {
    syrexInv100:  "f7000000-0000-4000-8000-000000000001",
    syrexInv150:  "f7000000-0000-4000-8000-000000000002",
    syrexAuto55:  "f7000000-0000-4000-8000-000000000003",
    syrexAuto75:  "f7000000-0000-4000-8000-000000000004",
    salmonInv100: "f7000000-0000-4000-8000-000000000005",
    salmonInv150: "f7000000-0000-4000-8000-000000000006",
    salmonAuto55: "f7000000-0000-4000-8000-000000000007",
    salmonAuto75: "f7000000-0000-4000-8000-000000000008",
  },
  warehouses: {
    north: "f3000000-0000-4000-8000-000000000001",
    south: "f3000000-0000-4000-8000-000000000002",
  },
  outlets: {
    prime: "f4000000-0000-4000-8000-000000000001",
    city:  "f4000000-0000-4000-8000-000000000002",
    metro: "f4000000-0000-4000-8000-000000000003",
  },
} as const;

// ── Users — password = email-prefix + "123" ───────────────────────────────────
type RoleName = "Admin" | "Sales" | "Warehouse Manager" | "Outlet" | "ASI" | "Service Engineer";

type UserSeed = {
  email: string;
  name: string;
  role: RoleName;
  userType: UserType;
  isFieldEnabled?: boolean;
};

const pw = (email: string) => email.split("@")[0] + "123";

const INTERNAL_USERS: UserSeed[] = [
  { email: "admin@syrex.local",   name: "Demo Admin",              role: "Admin",             userType: UserType.internal },
  { email: "ops@syrex.local",     name: "Operations Lead",         role: "Admin",             userType: UserType.internal },
  { email: "sales1@syrex.local",  name: "Sales Rep One",           role: "Sales",             userType: UserType.internal, isFieldEnabled: true },
  { email: "sales2@syrex.local",  name: "Sales Rep Two",           role: "Sales",             userType: UserType.internal, isFieldEnabled: true },
  { email: "finance@syrex.local", name: "Finance Executive",       role: "Admin",             userType: UserType.internal },
  { email: "whnorth@syrex.local", name: "Warehouse Manager North", role: "Warehouse Manager", userType: UserType.internal },
  { email: "whsouth@syrex.local", name: "Warehouse Manager South", role: "Warehouse Manager", userType: UserType.internal },
];

const OUTLET_USERS: UserSeed[] = [
  { email: "prime@syrex.local", name: "Prime Outlet User", role: "Outlet", userType: UserType.outlet },
  { email: "city@syrex.local",  name: "City Outlet User",  role: "Outlet", userType: UserType.outlet },
  { email: "metro@syrex.local", name: "Metro Outlet User", role: "Outlet", userType: UserType.outlet },
];

// ── Catalog ───────────────────────────────────────────────────────────────────
const BRANDS = [
  { id: IDS.brands.syrex,  name: "Syrex",  description: "Syrex battery systems",  isActive: true },
  { id: IDS.brands.salmon, name: "Salmon", description: "Salmon battery systems", isActive: true },
] as const;

const CATEGORIES = [
  { id: IDS.categories.syrexInverter,    brandId: IDS.brands.syrex,  name: "Inverter Batteries",    description: "Tubular and inverter battery range",      sortOrder: 1, isActive: true },
  { id: IDS.categories.syrexAutomotive,  brandId: IDS.brands.syrex,  name: "Automotive Batteries",  description: "Automotive starting battery range",        sortOrder: 2, isActive: true },
  { id: IDS.categories.salmonInverter,   brandId: IDS.brands.salmon, name: "Inverter Batteries",    description: "Tubular and inverter battery range",      sortOrder: 1, isActive: true },
  { id: IDS.categories.salmonAutomotive, brandId: IDS.brands.salmon, name: "Automotive Batteries",  description: "Automotive starting battery range",        sortOrder: 2, isActive: true },
] as const;

const PRODUCTS = [
  { id: IDS.products.syrexInv100,  categoryId: IDS.categories.syrexInverter,    name: "Syrex Inverter Battery 100Ah",   displayName: "Syrex 100Ah Tall Tubular",  sku: "SYR-INV-100",  description: "100Ah inverter battery for home backup.",       warrantyMonths: 36, basePrice: "10999", sortOrder: 1, specs: { capacityAh: 100, segment: "inverter",    brand: "Syrex"  } },
  { id: IDS.products.syrexInv150,  categoryId: IDS.categories.syrexInverter,    name: "Syrex Inverter Battery 150Ah",   displayName: "Syrex 150Ah Tall Tubular",  sku: "SYR-INV-150",  description: "150Ah inverter battery for extended backup.",    warrantyMonths: 42, basePrice: "13999", sortOrder: 2, specs: { capacityAh: 150, segment: "inverter",    brand: "Syrex"  } },
  { id: IDS.products.syrexAuto55,  categoryId: IDS.categories.syrexAutomotive,  name: "Syrex Automotive Battery 55Ah",  displayName: "Syrex Auto 55Ah",           sku: "SYR-AUTO-55",  description: "55Ah maintenance-free automotive battery.",     warrantyMonths: 24, basePrice: "6299",  sortOrder: 1, specs: { capacityAh: 55,  segment: "automotive", brand: "Syrex"  } },
  { id: IDS.products.syrexAuto75,  categoryId: IDS.categories.syrexAutomotive,  name: "Syrex Automotive Battery 75Ah",  displayName: "Syrex Auto 75Ah",           sku: "SYR-AUTO-75",  description: "75Ah maintenance-free automotive battery.",     warrantyMonths: 30, basePrice: "7899",  sortOrder: 2, specs: { capacityAh: 75,  segment: "automotive", brand: "Syrex"  } },
  { id: IDS.products.salmonInv100, categoryId: IDS.categories.salmonInverter,   name: "Salmon Inverter Battery 100Ah",  displayName: "Salmon 100Ah Tall Tubular", sku: "SLM-INV-100",  description: "100Ah inverter battery for home backup.",       warrantyMonths: 36, basePrice: "10499", sortOrder: 1, specs: { capacityAh: 100, segment: "inverter",    brand: "Salmon" } },
  { id: IDS.products.salmonInv150, categoryId: IDS.categories.salmonInverter,   name: "Salmon Inverter Battery 150Ah",  displayName: "Salmon 150Ah Tall Tubular", sku: "SLM-INV-150",  description: "150Ah inverter battery for extended backup.",    warrantyMonths: 42, basePrice: "13499", sortOrder: 2, specs: { capacityAh: 150, segment: "inverter",    brand: "Salmon" } },
  { id: IDS.products.salmonAuto55, categoryId: IDS.categories.salmonAutomotive, name: "Salmon Automotive Battery 55Ah", displayName: "Salmon Auto 55Ah",          sku: "SLM-AUTO-55",  description: "55Ah maintenance-free automotive battery.",     warrantyMonths: 24, basePrice: "5999",  sortOrder: 1, specs: { capacityAh: 55,  segment: "automotive", brand: "Salmon" } },
  { id: IDS.products.salmonAuto75, categoryId: IDS.categories.salmonAutomotive, name: "Salmon Automotive Battery 75Ah", displayName: "Salmon Auto 75Ah",          sku: "SLM-AUTO-75",  description: "75Ah maintenance-free automotive battery.",     warrantyMonths: 30, basePrice: "7599",  sortOrder: 2, specs: { capacityAh: 75,  segment: "automotive", brand: "Salmon" } },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function ensureRoles() {
  const { invalid: badSales } = validatePermissionKeys([...DEV_SALES_PERMISSIONS]);
  if (badSales.length > 0) throw new Error(`[demo-seed] Invalid Sales permission keys: ${badSales.join(", ")}`);

  const { invalid: badWh } = validatePermissionKeys([...DEV_WAREHOUSE_PERMISSIONS]);
  if (badWh.length > 0) throw new Error(`[demo-seed] Invalid Warehouse Manager permission keys: ${badWh.join(", ")}`);

  const { invalid: badOutlet } = validatePermissionKeys([...OUTLET_PERMISSIONS]);
  if (badOutlet.length > 0) throw new Error(`[demo-seed] Invalid Outlet permission keys: ${badOutlet.join(", ")}`);
  const { invalid: badAsi } = validatePermissionKeys([...SERVICE_ASI_PERMISSIONS]);
  if (badAsi.length > 0) throw new Error(`[demo-seed] Invalid ASI permission keys: ${badAsi.join(", ")}`);
  const { invalid: badSe } = validatePermissionKeys([...SERVICE_SE_PERMISSIONS]);
  if (badSe.length > 0) throw new Error(`[demo-seed] Invalid Service Engineer permission keys: ${badSe.join(", ")}`);

  const adminRole = await prisma.role.upsert({
    where: { name: "Admin" },
    update: { permissions: ["*"], isSystem: true },
    create: { name: "Admin", permissions: ["*"], isSystem: true },
  });
  const salesRole = await prisma.role.upsert({
    where: { name: "Sales" },
    update: { permissions: [...DEV_SALES_PERMISSIONS], isSystem: false },
    create: { name: "Sales", permissions: [...DEV_SALES_PERMISSIONS], isSystem: false },
  });
  const warehouseRole = await prisma.role.upsert({
    where: { name: "Warehouse Manager" },
    update: { permissions: [...DEV_WAREHOUSE_PERMISSIONS], isSystem: false },
    create: { name: "Warehouse Manager", permissions: [...DEV_WAREHOUSE_PERMISSIONS], isSystem: false },
  });
  const outletRole = await prisma.role.upsert({
    where: { name: "Outlet" },
    update: { permissions: [...OUTLET_PERMISSIONS], isSystem: false },
    create: { name: "Outlet", permissions: [...OUTLET_PERMISSIONS], isSystem: false },
  });
  const asiRole = await prisma.role.upsert({
    where: { name: "ASI" },
    update: { permissions: [...SERVICE_ASI_PERMISSIONS], isSystem: false },
    create: { name: "ASI", permissions: [...SERVICE_ASI_PERMISSIONS], isSystem: false },
  });
  const seRole = await prisma.role.upsert({
    where: { name: "Service Engineer" },
    update: { permissions: [...SERVICE_SE_PERMISSIONS], isSystem: false },
    create: { name: "Service Engineer", permissions: [...SERVICE_SE_PERMISSIONS], isSystem: false },
  });

  return {
    byName: {
      Admin: adminRole.id,
      Sales: salesRole.id,
      "Warehouse Manager": warehouseRole.id,
      Outlet: outletRole.id,
      ASI: asiRole.id,
      "Service Engineer": seRole.id,
    } as Record<RoleName, string>,
  };
}

async function upsertUser(seed: UserSeed, roleId: string) {
  const passwordHash = await Bun.password.hash(pw(seed.email), { algorithm: "bcrypt", cost: 12 });
  return prisma.user.upsert({
    where: { email: seed.email },
    update:  { name: seed.name, passwordHash, userType: seed.userType, roleId, isActive: true, isFieldEnabled: seed.isFieldEnabled ?? false },
    create:  { email: seed.email, name: seed.name, passwordHash, userType: seed.userType, roleId, isActive: true, isFieldEnabled: seed.isFieldEnabled ?? false },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const roles = await ensureRoles();

  const internalUsers = await Promise.all(
    INTERNAL_USERS.map((s) => upsertUser(s, roles.byName[s.role])),
  );
  const outletUsers = await Promise.all(
    OUTLET_USERS.map((s) => upsertUser(s, roles.byName[s.role])),
  );

  const whnorth  = internalUsers.find((u) => u.email === "whnorth@syrex.local")!;
  const whsouth  = internalUsers.find((u) => u.email === "whsouth@syrex.local")!;
  const primeUser = outletUsers.find((u) => u.email === "prime@syrex.local")!;
  const cityUser  = outletUsers.find((u) => u.email === "city@syrex.local")!;
  const metroUser = outletUsers.find((u) => u.email === "metro@syrex.local")!;

  const warehouseNorth = await prisma.warehouse.upsert({
    where: { id: IDS.warehouses.north },
    update: { name: "North Hub Warehouse", location: "Bengaluru North", address: "Peenya Industrial Area, Bengaluru", managerId: whnorth.id, isActive: true },
    create: { id: IDS.warehouses.north, name: "North Hub Warehouse", location: "Bengaluru North", address: "Peenya Industrial Area, Bengaluru", managerId: whnorth.id, isActive: true },
  });

  const warehouseSouth = await prisma.warehouse.upsert({
    where: { id: IDS.warehouses.south },
    update: { name: "South Hub Warehouse", location: "Bengaluru South", address: "Electronic City Phase 1, Bengaluru", managerId: whsouth.id, isActive: true },
    create: { id: IDS.warehouses.south, name: "South Hub Warehouse", location: "Bengaluru South", address: "Electronic City Phase 1, Bengaluru", managerId: whsouth.id, isActive: true },
  });

  await prisma.outlet.upsert({
    where: { id: IDS.outlets.prime },
    update: { outletCode: "OUT-DEMO-001", userId: primeUser.id, warehouseId: warehouseNorth.id, name: "Prime Traders",      ownerName: "Ravi Kumar", phone: "+91-9000001001", address: "Malleshwaram, Bengaluru",         creditLimit: new Prisma.Decimal("120000"), isActive: true },
    create: { id: IDS.outlets.prime, outletCode: "OUT-DEMO-001", userId: primeUser.id, warehouseId: warehouseNorth.id, name: "Prime Traders",      ownerName: "Ravi Kumar", phone: "+91-9000001001", address: "Malleshwaram, Bengaluru",         creditLimit: new Prisma.Decimal("120000"), isActive: true },
  });
  await prisma.outlet.upsert({
    where: { id: IDS.outlets.city },
    update: { outletCode: "OUT-DEMO-002", userId: cityUser.id,  warehouseId: warehouseSouth.id, name: "City Distributors", ownerName: "Meera Singh", phone: "+91-9000001002", address: "HSR Layout, Bengaluru",           creditLimit: new Prisma.Decimal("95000"),  isActive: true },
    create: { id: IDS.outlets.city,  outletCode: "OUT-DEMO-002", userId: cityUser.id,  warehouseId: warehouseSouth.id, name: "City Distributors", ownerName: "Meera Singh", phone: "+91-9000001002", address: "HSR Layout, Bengaluru",           creditLimit: new Prisma.Decimal("95000"),  isActive: true },
  });
  await prisma.outlet.upsert({
    where: { id: IDS.outlets.metro },
    update: { outletCode: "OUT-DEMO-003", userId: metroUser.id, warehouseId: warehouseNorth.id, name: "Metro Supplies",    ownerName: "Anil Reddy", phone: "+91-9000001003", address: "Yelahanka, Bengaluru",            creditLimit: new Prisma.Decimal("105000"), isActive: true },
    create: { id: IDS.outlets.metro, outletCode: "OUT-DEMO-003", userId: metroUser.id, warehouseId: warehouseNorth.id, name: "Metro Supplies",    ownerName: "Anil Reddy", phone: "+91-9000001003", address: "Yelahanka, Bengaluru",            creditLimit: new Prisma.Decimal("105000"), isActive: true },
  });

  for (const brand of BRANDS) {
    await prisma.brand.upsert({
      where: { id: brand.id },
      update: { name: brand.name, description: brand.description, isActive: brand.isActive },
      create: { id: brand.id, name: brand.name, description: brand.description, isActive: brand.isActive },
    });
  }

  for (const cat of CATEGORIES) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: { brandId: cat.brandId, name: cat.name, description: cat.description, sortOrder: cat.sortOrder, isActive: cat.isActive },
      create: { id: cat.id, brandId: cat.brandId, name: cat.name, description: cat.description, sortOrder: cat.sortOrder, isActive: cat.isActive },
    });
  }

  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: { categoryId: p.categoryId, name: p.name, displayName: p.displayName, sku: p.sku, description: p.description, specs: p.specs, warrantyMonths: p.warrantyMonths, basePrice: new Prisma.Decimal(p.basePrice), sortOrder: p.sortOrder, isActive: true },
      create: { id: p.id, categoryId: p.categoryId, name: p.name, displayName: p.displayName, sku: p.sku, description: p.description, specs: p.specs, warrantyMonths: p.warrantyMonths, basePrice: new Prisma.Decimal(p.basePrice), sortOrder: p.sortOrder, isActive: true },
    });
  }

  await prisma.orderSequence.upsert({
    where: { year: 2026 },
    update: { lastSequence: 0 },
    create: { year: 2026, lastSequence: 0 },
  });

  await prisma.invoiceSequence.upsert({
    where: { year: 2026 },
    update: { lastSequence: 0 },
    create: { year: 2026, lastSequence: 0 },
  });

  const allUsers = [...INTERNAL_USERS, ...OUTLET_USERS];
  console.log(
    JSON.stringify(
      {
        seeded: true,
        summary: {
          internalUsers: INTERNAL_USERS.length,
          outletUsers: OUTLET_USERS.length,
          warehouses: 2,
          outlets: 3,
          brands: BRANDS.length,
          categories: CATEGORIES.length,
          products: PRODUCTS.length,
        },
        credentials: allUsers.map((u) => ({ email: u.email, password: pw(u.email), role: u.role })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
