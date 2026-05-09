import { PrismaClient, Prisma, UserType } from "@prisma/client";

const prisma = new PrismaClient();

const IDS = {
  adminRole: "12000000-0000-4000-8000-000000000001",
  adminUser: "22000000-0000-4000-8000-000000000001",
  outletUser: "22000000-0000-4000-8000-000000000002",
  warehouse: "32000000-0000-4000-8000-000000000001",
  outlet: "82000000-0000-4000-8000-000000000001",
  brand: "42000000-0000-4000-8000-000000000001",
  category: "52000000-0000-4000-8000-000000000001",
  productA: "62000000-0000-4000-8000-000000000001",
  productB: "62000000-0000-4000-8000-000000000002"
} as const;

async function main() {
  const adminPasswordHash = await Bun.password.hash("admin123");
  const outletPasswordHash = await Bun.password.hash("outlet123");

  await prisma.role.upsert({
    where: { id: IDS.adminRole },
    update: { name: "Phase3 Admin", permissions: ["*"], isSystem: true },
    create: { id: IDS.adminRole, name: "Phase3 Admin", permissions: ["*"], isSystem: true }
  });

  await prisma.user.upsert({
    where: { id: IDS.adminUser },
    update: {
      email: "admin.phase3@syrex.dev",
      name: "Phase3 Admin",
      passwordHash: adminPasswordHash,
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    },
    create: {
      id: IDS.adminUser,
      email: "admin.phase3@syrex.dev",
      name: "Phase3 Admin",
      passwordHash: adminPasswordHash,
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.outletUser },
    update: {
      email: "outlet.phase3@syrex.dev",
      name: "Phase3 Outlet",
      passwordHash: outletPasswordHash,
      userType: UserType.outlet,
      roleId: IDS.adminRole,
      isActive: true
    },
    create: {
      id: IDS.outletUser,
      email: "outlet.phase3@syrex.dev",
      name: "Phase3 Outlet",
      passwordHash: outletPasswordHash,
      userType: UserType.outlet,
      roleId: IDS.adminRole,
      isActive: true
    }
  });

  await prisma.warehouse.upsert({
    where: { id: IDS.warehouse },
    update: {
      name: "Phase3 Main Warehouse",
      location: "Bengaluru",
      address: "Phase3 WH Address",
      managerId: IDS.adminUser,
      isActive: true
    },
    create: {
      id: IDS.warehouse,
      name: "Phase3 Main Warehouse",
      location: "Bengaluru",
      address: "Phase3 WH Address",
      managerId: IDS.adminUser,
      isActive: true
    }
  });

  await prisma.outlet.upsert({
    where: { id: IDS.outlet },
    update: {
      outletCode: "OUT-PHASE3-001",
      userId: IDS.outletUser,
      warehouseId: IDS.warehouse,
      name: "Phase3 Outlet",
      ownerName: "Phase3 Owner",
      phone: "+91-9000000030",
      address: "Phase3 Outlet Address",
      creditLimit: new Prisma.Decimal("100000"),
      outstandingBalance: new Prisma.Decimal("0"),
      isActive: true
    },
    create: {
      id: IDS.outlet,
      outletCode: "OUT-PHASE3-001",
      userId: IDS.outletUser,
      warehouseId: IDS.warehouse,
      name: "Phase3 Outlet",
      ownerName: "Phase3 Owner",
      phone: "+91-9000000030",
      address: "Phase3 Outlet Address",
      creditLimit: new Prisma.Decimal("100000"),
      outstandingBalance: new Prisma.Decimal("0"),
      isActive: true
    }
  });

  await prisma.brand.upsert({
    where: { id: IDS.brand },
    update: { name: "Phase3 Brand", description: "Phase3 brand", isActive: true },
    create: { id: IDS.brand, name: "Phase3 Brand", description: "Phase3 brand", isActive: true }
  });

  await prisma.category.upsert({
    where: { id: IDS.category },
    update: {
      brandId: IDS.brand,
      name: "Phase3 Category",
      description: "Phase3 category",
      sortOrder: 1,
      isActive: true
    },
    create: {
      id: IDS.category,
      brandId: IDS.brand,
      name: "Phase3 Category",
      description: "Phase3 category",
      sortOrder: 1,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { id: IDS.productA },
    update: {
      categoryId: IDS.category,
      name: "Phase3 Product A",
      displayName: "P3 Product A",
      sku: "PHASE3-SKU-001",
      description: "Phase3 product A",
      specs: { size: "M", color: "silver" },
      warrantyMonths: 12,
      basePrice: new Prisma.Decimal("1500.00"),
      sortOrder: 1,
      isActive: true
    },
    create: {
      id: IDS.productA,
      categoryId: IDS.category,
      name: "Phase3 Product A",
      displayName: "P3 Product A",
      sku: "PHASE3-SKU-001",
      description: "Phase3 product A",
      specs: { size: "M", color: "silver" },
      warrantyMonths: 12,
      basePrice: new Prisma.Decimal("1500.00"),
      sortOrder: 1,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { id: IDS.productB },
    update: {
      categoryId: IDS.category,
      name: "Phase3 Product B",
      displayName: "P3 Product B",
      sku: "PHASE3-SKU-002",
      description: "Phase3 product B",
      specs: { size: "L", color: "black" },
      warrantyMonths: 18,
      basePrice: new Prisma.Decimal("2300.00"),
      sortOrder: 2,
      isActive: true
    },
    create: {
      id: IDS.productB,
      categoryId: IDS.category,
      name: "Phase3 Product B",
      displayName: "P3 Product B",
      sku: "PHASE3-SKU-002",
      description: "Phase3 product B",
      specs: { size: "L", color: "black" },
      warrantyMonths: 18,
      basePrice: new Prisma.Decimal("2300.00"),
      sortOrder: 2,
      isActive: true
    }
  });

  await prisma.orderSequence.upsert({
    where: { year: 2026 },
    update: { lastSequence: 0 },
    create: { year: 2026, lastSequence: 0 }
  });

  await prisma.invoiceSequence.upsert({
    where: { year: 2026 },
    update: { lastSequence: 0 },
    create: { year: 2026, lastSequence: 0 }
  });

  console.log(JSON.stringify(IDS, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
