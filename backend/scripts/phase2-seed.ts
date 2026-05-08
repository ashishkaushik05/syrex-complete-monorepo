import { PrismaClient, Prisma, UserType } from "@prisma/client";

const prisma = new PrismaClient();

const IDS = {
  adminRole: "11000000-0000-4000-8000-000000000001",
  adminUser: "21000000-0000-4000-8000-000000000001",
  warehouse: "31000000-0000-4000-8000-000000000001",
  outletUser: "21000000-0000-4000-8000-000000000002",
  outlet: "81000000-0000-4000-8000-000000000001",
  brand: "41000000-0000-4000-8000-000000000001",
  category: "51000000-0000-4000-8000-000000000001",
  productA: "61000000-0000-4000-8000-000000000001",
  productB: "61000000-0000-4000-8000-000000000002"
} as const;

async function main() {
  const adminPasswordHash = await Bun.password.hash("admin123");
  const outletPasswordHash = await Bun.password.hash("outlet123");

  await prisma.role.upsert({
    where: { id: IDS.adminRole },
    update: { name: "Phase2 Admin", permissions: ["*"], isSystem: true },
    create: { id: IDS.adminRole, name: "Phase2 Admin", permissions: ["*"], isSystem: true }
  });

  await prisma.user.upsert({
    where: { id: IDS.adminUser },
    update: {
      email: "admin.phase2@syrex.dev",
      name: "Phase2 Admin",
      passwordHash: adminPasswordHash,
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    },
    create: {
      id: IDS.adminUser,
      email: "admin.phase2@syrex.dev",
      name: "Phase2 Admin",
      passwordHash: adminPasswordHash,
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.outletUser },
    update: {
      email: "outlet.phase2@syrex.dev",
      name: "Phase2 Outlet",
      passwordHash: outletPasswordHash,
      userType: UserType.outlet,
      roleId: IDS.adminRole,
      isActive: true
    },
    create: {
      id: IDS.outletUser,
      email: "outlet.phase2@syrex.dev",
      name: "Phase2 Outlet",
      passwordHash: outletPasswordHash,
      userType: UserType.outlet,
      roleId: IDS.adminRole,
      isActive: true
    }
  });

  await prisma.warehouse.upsert({
    where: { id: IDS.warehouse },
    update: {
      name: "Phase2 Central Warehouse",
      location: "Bengaluru",
      address: "Phase2 WH Address",
      managerId: IDS.adminUser,
      isActive: true
    },
    create: {
      id: IDS.warehouse,
      name: "Phase2 Central Warehouse",
      location: "Bengaluru",
      address: "Phase2 WH Address",
      managerId: IDS.adminUser,
      isActive: true
    }
  });

  await prisma.outlet.upsert({
    where: { id: IDS.outlet },
    update: {
      outletCode: "OUT-PHASE2-001",
      userId: IDS.outletUser,
      warehouseId: IDS.warehouse,
      name: "Phase2 Outlet",
      ownerName: "Phase2 Owner",
      phone: "+91-9000000020",
      address: "Phase2 Outlet Address",
      creditLimit: new Prisma.Decimal("90000"),
      isActive: true
    },
    create: {
      id: IDS.outlet,
      outletCode: "OUT-PHASE2-001",
      userId: IDS.outletUser,
      warehouseId: IDS.warehouse,
      name: "Phase2 Outlet",
      ownerName: "Phase2 Owner",
      phone: "+91-9000000020",
      address: "Phase2 Outlet Address",
      creditLimit: new Prisma.Decimal("90000"),
      isActive: true
    }
  });

  await prisma.brand.upsert({
    where: { id: IDS.brand },
    update: { name: "Phase2 Brand", description: "Phase2 brand", isActive: true },
    create: { id: IDS.brand, name: "Phase2 Brand", description: "Phase2 brand", isActive: true }
  });

  await prisma.category.upsert({
    where: { id: IDS.category },
    update: {
      brandId: IDS.brand,
      name: "Phase2 Category",
      description: "Phase2 category",
      sortOrder: 1,
      isActive: true
    },
    create: {
      id: IDS.category,
      brandId: IDS.brand,
      name: "Phase2 Category",
      description: "Phase2 category",
      sortOrder: 1,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { id: IDS.productA },
    update: {
      categoryId: IDS.category,
      name: "Phase2 Product A",
      displayName: "P2 Product A",
      sku: "PHASE2-SKU-001",
      description: "Phase2 seeded product A",
      specs: { size: "M", color: "gray" },
      warrantyMonths: 12,
      basePrice: new Prisma.Decimal("1200.00"),
      sortOrder: 1,
      isActive: true
    },
    create: {
      id: IDS.productA,
      categoryId: IDS.category,
      name: "Phase2 Product A",
      displayName: "P2 Product A",
      sku: "PHASE2-SKU-001",
      description: "Phase2 seeded product A",
      specs: { size: "M", color: "gray" },
      warrantyMonths: 12,
      basePrice: new Prisma.Decimal("1200.00"),
      sortOrder: 1,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { id: IDS.productB },
    update: {
      categoryId: IDS.category,
      name: "Phase2 Product B",
      displayName: "P2 Product B",
      sku: "PHASE2-SKU-002",
      description: "Phase2 seeded product B",
      specs: { size: "L", color: "black" },
      warrantyMonths: 18,
      basePrice: new Prisma.Decimal("2200.00"),
      sortOrder: 2,
      isActive: true
    },
    create: {
      id: IDS.productB,
      categoryId: IDS.category,
      name: "Phase2 Product B",
      displayName: "P2 Product B",
      sku: "PHASE2-SKU-002",
      description: "Phase2 seeded product B",
      specs: { size: "L", color: "black" },
      warrantyMonths: 18,
      basePrice: new Prisma.Decimal("2200.00"),
      sortOrder: 2,
      isActive: true
    }
  });

  await prisma.orderSequence.upsert({
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
