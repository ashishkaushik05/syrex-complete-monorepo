import { PrismaClient, UserType, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const IDS = {
  adminRole: "10000000-0000-4000-8000-000000000001",
  salesRole: "10000000-0000-4000-8000-000000000002",
  adminUser: "20000000-0000-4000-8000-000000000001",
  outletUser: "20000000-0000-4000-8000-000000000002",
  warehouse: "30000000-0000-4000-8000-000000000001",
  brand: "40000000-0000-4000-8000-000000000001",
  category: "50000000-0000-4000-8000-000000000001",
  product: "60000000-0000-4000-8000-000000000001",
  image: "70000000-0000-4000-8000-000000000001",
  outlet: "80000000-0000-4000-8000-000000000001",
  invitation: "90000000-0000-4000-8000-000000000001"
} as const;

async function main() {
  await prisma.role.upsert({
    where: { id: IDS.adminRole },
    update: { name: "Admin", permissions: ["*"], isSystem: true },
    create: { id: IDS.adminRole, name: "Admin", permissions: ["*"], isSystem: true }
  });

  await prisma.role.upsert({
    where: { id: IDS.salesRole },
    update: { name: "Sales", permissions: ["orders.read", "orders.write"], isSystem: false },
    create: {
      id: IDS.salesRole,
      name: "Sales",
      permissions: ["orders.read", "orders.write"],
      isSystem: false
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.adminUser },
    update: {
      email: "admin.phase1@syrex.dev",
      name: "Phase1 Admin",
      passwordHash: "admin123",
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    },
    create: {
      id: IDS.adminUser,
      email: "admin.phase1@syrex.dev",
      name: "Phase1 Admin",
      passwordHash: "admin123",
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.outletUser },
    update: {
      email: "outlet.phase1@syrex.dev",
      name: "Phase1 Outlet User",
      passwordHash: "outlet123",
      userType: UserType.outlet,
      roleId: IDS.salesRole,
      isActive: true
    },
    create: {
      id: IDS.outletUser,
      email: "outlet.phase1@syrex.dev",
      name: "Phase1 Outlet User",
      passwordHash: "outlet123",
      userType: UserType.outlet,
      roleId: IDS.salesRole,
      isActive: true
    }
  });

  await prisma.warehouse.upsert({
    where: { id: IDS.warehouse },
    update: {
      name: "Central Warehouse",
      location: "Bengaluru",
      address: "WH Phase1 Address",
      managerId: IDS.adminUser,
      isActive: true
    },
    create: {
      id: IDS.warehouse,
      name: "Central Warehouse",
      location: "Bengaluru",
      address: "WH Phase1 Address",
      managerId: IDS.adminUser,
      isActive: true
    }
  });

  await prisma.brand.upsert({
    where: { id: IDS.brand },
    update: { name: "Syrex Brand", description: "Phase1 brand", isActive: true },
    create: { id: IDS.brand, name: "Syrex Brand", description: "Phase1 brand", isActive: true }
  });

  await prisma.category.upsert({
    where: { id: IDS.category },
    update: {
      brandId: IDS.brand,
      name: "Phase1 Category",
      description: "Phase1 category",
      sortOrder: 1,
      isActive: true
    },
    create: {
      id: IDS.category,
      brandId: IDS.brand,
      name: "Phase1 Category",
      description: "Phase1 category",
      sortOrder: 1,
      isActive: true
    }
  });

  await prisma.product.upsert({
    where: { id: IDS.product },
    update: {
      categoryId: IDS.category,
      name: "Phase1 Product",
      displayName: "Phase1 Product Display",
      sku: "PHASE1-SKU-001",
      description: "Phase1 seeded product",
      specs: { material: "steel", grade: "A" },
      warrantyMonths: 12,
      basePrice: new Prisma.Decimal("1999.50"),
      sortOrder: 1,
      isActive: true
    },
    create: {
      id: IDS.product,
      categoryId: IDS.category,
      name: "Phase1 Product",
      displayName: "Phase1 Product Display",
      sku: "PHASE1-SKU-001",
      description: "Phase1 seeded product",
      specs: { material: "steel", grade: "A" },
      warrantyMonths: 12,
      basePrice: new Prisma.Decimal("1999.50"),
      sortOrder: 1,
      isActive: true
    }
  });

  await prisma.image.upsert({
    where: { id: IDS.image },
    update: {
      uri: "https://example.com/phase1-product.png",
      altText: "Phase1 product image",
      sortOrder: 1,
      productId: IDS.product,
      brandId: null,
      categoryId: null
    },
    create: {
      id: IDS.image,
      uri: "https://example.com/phase1-product.png",
      altText: "Phase1 product image",
      sortOrder: 1,
      productId: IDS.product,
      brandId: null,
      categoryId: null
    }
  });

  await prisma.outlet.upsert({
    where: { id: IDS.outlet },
    update: {
      outletCode: "OUT-PHASE1-001",
      userId: IDS.outletUser,
      warehouseId: IDS.warehouse,
      name: "Phase1 Outlet",
      ownerName: "Outlet Owner",
      phone: "+91-9000000001",
      address: "Phase1 Outlet Address",
      creditLimit: new Prisma.Decimal("50000"),
      isActive: true
    },
    create: {
      id: IDS.outlet,
      outletCode: "OUT-PHASE1-001",
      userId: IDS.outletUser,
      warehouseId: IDS.warehouse,
      name: "Phase1 Outlet",
      ownerName: "Outlet Owner",
      phone: "+91-9000000001",
      address: "Phase1 Outlet Address",
      creditLimit: new Prisma.Decimal("50000"),
      isActive: true
    }
  });

  await prisma.userInvitation.upsert({
    where: { id: IDS.invitation },
    update: {
      email: "invitee.phase1@syrex.dev",
      name: "Phase1 Invitee",
      role: "Sales",
      token: "phase1-invite-token",
      status: "pending",
      invitedById: IDS.adminUser,
      acceptedUserId: null,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null
    },
    create: {
      id: IDS.invitation,
      email: "invitee.phase1@syrex.dev",
      name: "Phase1 Invitee",
      role: "Sales",
      token: "phase1-invite-token",
      status: "pending",
      invitedById: IDS.adminUser,
      acceptedUserId: null,
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      acceptedAt: null,
      revokedAt: null
    }
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
