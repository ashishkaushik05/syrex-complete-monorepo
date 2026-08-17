import { Prisma, PrismaClient, UserType } from "@prisma/client";
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

assertNonProductionCommand("demo-seed");

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
  billingProfiles: {
    company: "f8000000-0000-4000-8000-000000000001",
    northWarehouse: "f8000000-0000-4000-8000-000000000002",
    southWarehouse: "f8000000-0000-4000-8000-000000000003",
    primeOutlet: "f8000000-0000-4000-8000-000000000004",
    cityOutlet: "f8000000-0000-4000-8000-000000000005",
    metroOutlet: "f8000000-0000-4000-8000-000000000006",
  },
} as const;

// ── Users — password = email-prefix + "123" ───────────────────────────────────
type RoleName = "Admin" | "Sales" | "Warehouse Manager" | "Distribution Head" | "Outlet" | "ASI" | "Service Engineer" | "RSM" | "Customer Executive" | "Service Head";

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
  { email: "distribution@syrex.local", name: "Distribution Head",  role: "Distribution Head", userType: UserType.internal },
  { email: "whnorth@syrex.local", name: "Warehouse Manager North", role: "Warehouse Manager", userType: UserType.internal },
  { email: "whsouth@syrex.local", name: "Warehouse Manager South", role: "Warehouse Manager", userType: UserType.internal },
  { email: "rsm@syrex.local", name: "Demo Regional Service Manager", role: "RSM", userType: UserType.internal },
  { email: "asi@syrex.local", name: "Demo Area Service Inspector", role: "ASI", userType: UserType.internal },
  { email: "engineer1@syrex.local", name: "Demo Service Engineer One", role: "Service Engineer", userType: UserType.internal },
  { email: "engineer2@syrex.local", name: "Demo Service Engineer Two", role: "Service Engineer", userType: UserType.internal },
  { email: "cx@syrex.local", name: "Demo Customer Executive", role: "Customer Executive", userType: UserType.internal },
  { email: "sh@syrex.local", name: "Demo Service Head", role: "Service Head", userType: UserType.internal },
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
  const { invalid: badDistribution } = validatePermissionKeys([...DISTRIBUTION_HEAD_PERMISSIONS]);
  if (badDistribution.length > 0) throw new Error(`[demo-seed] Invalid Distribution Head permission keys: ${badDistribution.join(", ")}`);

  const { invalid: badOutlet } = validatePermissionKeys([...OUTLET_PERMISSIONS]);
  if (badOutlet.length > 0) throw new Error(`[demo-seed] Invalid Outlet permission keys: ${badOutlet.join(", ")}`);
  const { invalid: badAsi } = validatePermissionKeys([...SERVICE_ASI_PERMISSIONS]);
  if (badAsi.length > 0) throw new Error(`[demo-seed] Invalid ASI permission keys: ${badAsi.join(", ")}`);
  const { invalid: badSe } = validatePermissionKeys([...SERVICE_SE_PERMISSIONS]);
  if (badSe.length > 0) throw new Error(`[demo-seed] Invalid Service Engineer permission keys: ${badSe.join(", ")}`);
  const { invalid: badRsm } = validatePermissionKeys([...SERVICE_RSM_PERMISSIONS]);
  if (badRsm.length > 0) throw new Error(`[demo-seed] Invalid RSM permission keys: ${badRsm.join(", ")}`);
  const { invalid: badCx } = validatePermissionKeys([...SERVICE_HAPPY_CALLING_PERMISSIONS]);
  if (badCx.length > 0) throw new Error(`[demo-seed] Invalid Customer Executive permission keys: ${badCx.join(", ")}`);
  const { invalid: badSh } = validatePermissionKeys([...SERVICE_HEAD_PERMISSIONS]);
  if (badSh.length > 0) throw new Error(`[demo-seed] Invalid Service Head permission keys: ${badSh.join(", ")}`);

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
  const distributionRole = await prisma.role.upsert({
    where: { name: "Distribution Head" },
    update: { permissions: [...DISTRIBUTION_HEAD_PERMISSIONS], isSystem: false },
    create: { name: "Distribution Head", permissions: [...DISTRIBUTION_HEAD_PERMISSIONS], isSystem: false },
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
  const rsmRole = await prisma.role.upsert({
    where: { name: "RSM" },
    update: { permissions: [...SERVICE_RSM_PERMISSIONS], isSystem: false },
    create: { name: "RSM", permissions: [...SERVICE_RSM_PERMISSIONS], isSystem: false },
  });
  const cxRole = await prisma.role.upsert({
    where: { name: "Customer Executive" },
    update: { permissions: [...SERVICE_HAPPY_CALLING_PERMISSIONS], isSystem: false },
    create: { name: "Customer Executive", permissions: [...SERVICE_HAPPY_CALLING_PERMISSIONS], isSystem: false },
  });
  const serviceHeadRole = await prisma.role.upsert({
    where: { name: "Service Head" },
    update: { permissions: [...SERVICE_HEAD_PERMISSIONS], isSystem: false },
    create: { name: "Service Head", permissions: [...SERVICE_HEAD_PERMISSIONS], isSystem: false },
  });

  return {
    byName: {
      Admin: adminRole.id,
      Sales: salesRole.id,
      "Warehouse Manager": warehouseRole.id,
      "Distribution Head": distributionRole.id,
      Outlet: outletRole.id,
      ASI: asiRole.id,
      "Service Engineer": seRole.id,
      RSM: rsmRole.id,
      "Customer Executive": cxRole.id,
      "Service Head": serviceHeadRole.id,
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

  // Link the demo ASI to the demo RSM so complaint assignment denormalizes rsmUserId.
  const demoRsm = internalUsers.find((u) => u.email === "rsm@syrex.local")!;
  const demoAsi = internalUsers.find((u) => u.email === "asi@syrex.local")!;
  await prisma.user.update({
    where: { id: demoAsi.id },
    data: { managedByRsmId: demoRsm.id },
  });

  const whnorth  = internalUsers.find((u) => u.email === "whnorth@syrex.local")!;
  const whsouth  = internalUsers.find((u) => u.email === "whsouth@syrex.local")!;
  const primeUser = outletUsers.find((u) => u.email === "prime@syrex.local")!;
  const cityUser  = outletUsers.find((u) => u.email === "city@syrex.local")!;
  const metroUser = outletUsers.find((u) => u.email === "metro@syrex.local")!;

  const billingProfileSeeds = [
    { id: IDS.billingProfiles.company, legalName: "Syrex Industries Private Limited", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", addressLine1: "Peenya Industrial Area", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560058", profileType: "company" as const, canIssueGrnInvoice: true },
    { id: IDS.billingProfiles.northWarehouse, legalName: "Syrex North Hub", gstin: "29FGHIJ5678K1Z2", pan: "FGHIJ5678K", addressLine1: "North Hub, Peenya", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560058", profileType: "warehouse" as const, canIssueGrnInvoice: false },
    { id: IDS.billingProfiles.southWarehouse, legalName: "Syrex South Hub", gstin: "33LMNOP9012Q1Z7", pan: "LMNOP9012Q", addressLine1: "South Hub, Guindy", city: "Chennai", state: "Tamil Nadu", stateCode: "33", pincode: "600032", profileType: "warehouse" as const, canIssueGrnInvoice: false },
    { id: IDS.billingProfiles.primeOutlet, legalName: "Prime Traders", gstin: "29RSTUV3456W1Z4", pan: "RSTUV3456W", addressLine1: "Malleshwaram", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560003", profileType: "outlet" as const, canIssueGrnInvoice: false },
    { id: IDS.billingProfiles.cityOutlet, legalName: "City Distributors", gstin: "29XYZAB7890C1Z1", pan: "XYZAB7890C", addressLine1: "HSR Layout", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560102", profileType: "outlet" as const, canIssueGrnInvoice: false },
    { id: IDS.billingProfiles.metroOutlet, legalName: "Metro Supplies", gstin: "29DEFGH2345J1Z8", pan: "DEFGH2345J", addressLine1: "Yelahanka", city: "Bengaluru", state: "Karnataka", stateCode: "29", pincode: "560064", profileType: "outlet" as const, canIssueGrnInvoice: false },
  ];
  for (const profile of billingProfileSeeds) {
    await prisma.billingProfile.upsert({
      where: { id: profile.id },
      update: { ...profile, isActive: true },
      create: { ...profile, isActive: true },
    });
  }

  const warehouseNorth = await prisma.warehouse.upsert({
    where: { id: IDS.warehouses.north },
    update: { name: "North Hub Warehouse", location: "Bengaluru North", address: "Peenya Industrial Area, Bengaluru", managerId: whnorth.id, billingProfileId: IDS.billingProfiles.northWarehouse, isActive: true },
    create: { id: IDS.warehouses.north, name: "North Hub Warehouse", location: "Bengaluru North", address: "Peenya Industrial Area, Bengaluru", managerId: whnorth.id, billingProfileId: IDS.billingProfiles.northWarehouse, isActive: true },
  });

  const warehouseSouth = await prisma.warehouse.upsert({
    where: { id: IDS.warehouses.south },
    update: { name: "South Hub Warehouse", location: "Chennai South", address: "Guindy Industrial Estate, Chennai", managerId: whsouth.id, billingProfileId: IDS.billingProfiles.southWarehouse, isActive: true },
    create: { id: IDS.warehouses.south, name: "South Hub Warehouse", location: "Chennai South", address: "Guindy Industrial Estate, Chennai", managerId: whsouth.id, billingProfileId: IDS.billingProfiles.southWarehouse, isActive: true },
  });

  await prisma.outlet.upsert({
    where: { id: IDS.outlets.prime },
    update: { outletCode: "OUT-DEMO-001", userId: primeUser.id, warehouseId: warehouseNorth.id, billingProfileId: IDS.billingProfiles.primeOutlet, name: "Prime Traders",      ownerName: "Ravi Kumar", phone: "+91-9000001001", address: "Malleshwaram, Bengaluru",         creditLimit: new Prisma.Decimal("120000"), isActive: true },
    create: { id: IDS.outlets.prime, outletCode: "OUT-DEMO-001", userId: primeUser.id, warehouseId: warehouseNorth.id, billingProfileId: IDS.billingProfiles.primeOutlet, name: "Prime Traders",      ownerName: "Ravi Kumar", phone: "+91-9000001001", address: "Malleshwaram, Bengaluru",         creditLimit: new Prisma.Decimal("120000"), isActive: true },
  });
  await prisma.outlet.upsert({
    where: { id: IDS.outlets.city },
    update: { outletCode: "OUT-DEMO-002", userId: cityUser.id,  warehouseId: warehouseSouth.id, billingProfileId: IDS.billingProfiles.cityOutlet, name: "City Distributors", ownerName: "Meera Singh", phone: "+91-9000001002", address: "HSR Layout, Bengaluru",           creditLimit: new Prisma.Decimal("95000"),  isActive: true },
    create: { id: IDS.outlets.city,  outletCode: "OUT-DEMO-002", userId: cityUser.id,  warehouseId: warehouseSouth.id, billingProfileId: IDS.billingProfiles.cityOutlet, name: "City Distributors", ownerName: "Meera Singh", phone: "+91-9000001002", address: "HSR Layout, Bengaluru",           creditLimit: new Prisma.Decimal("95000"),  isActive: true },
  });
  await prisma.outlet.upsert({
    where: { id: IDS.outlets.metro },
    update: { outletCode: "OUT-DEMO-003", userId: metroUser.id, warehouseId: warehouseNorth.id, billingProfileId: IDS.billingProfiles.metroOutlet, name: "Metro Supplies",    ownerName: "Anil Reddy", phone: "+91-9000001003", address: "Yelahanka, Bengaluru",            creditLimit: new Prisma.Decimal("105000"), isActive: true },
    create: { id: IDS.outlets.metro, outletCode: "OUT-DEMO-003", userId: metroUser.id, warehouseId: warehouseNorth.id, billingProfileId: IDS.billingProfiles.metroOutlet, name: "Metro Supplies",    ownerName: "Anil Reddy", phone: "+91-9000001003", address: "Yelahanka, Bengaluru",            creditLimit: new Prisma.Decimal("105000"), isActive: true },
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

  const adminUser = internalUsers.find((user) => user.email === "admin@syrex.local")!;
  await installBatteryWarrantyTemplate(prisma, {
    orgId: process.env.DEFAULT_ORG_ID ?? "org-syrex-dev",
    createdById: adminUser.id,
  });
  await installBatteryTestStandardTemplate(prisma, {
    orgId: process.env.DEFAULT_ORG_ID ?? "org-syrex-dev",
    createdById: adminUser.id,
  });

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

  await seedChartOfAccounts(prisma);

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
          serviceFormTemplates: 2,
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
