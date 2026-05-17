import { PrismaClient, UserType } from "@prisma/client";
import { validatePermissionKeys } from "../src/rbac/catalog";
import { DEV_SALES_PERMISSIONS, DEV_WAREHOUSE_PERMISSIONS } from "./seed-permissions";

const prisma = new PrismaClient();

const IDS = {
  adminRole: "d0000000-0000-4000-8000-000000000001",
  salesRole: "d0000000-0000-4000-8000-000000000002",
  warehouseRole: "d0000000-0000-4000-8000-000000000003",
  adminUser: "d1000000-0000-4000-8000-000000000001",
  outletUser: "d1000000-0000-4000-8000-000000000002",
  warehouseUser: "d1000000-0000-4000-8000-000000000003"
} as const;

function assertValidSeedPermissions(roleName: string, permissions: readonly string[]) {
  const { invalid } = validatePermissionKeys([...permissions]);
  if (invalid.length > 0) {
    throw new Error(`[dev-seed] Invalid permission keys for ${roleName}: ${invalid.join(", ")}`);
  }
}

async function main() {
  assertValidSeedPermissions("Sales", DEV_SALES_PERMISSIONS);
  assertValidSeedPermissions("Warehouse Manager", DEV_WAREHOUSE_PERMISSIONS);

  const adminPasswordHash = await Bun.password.hash("admin123");
  const outletPasswordHash = await Bun.password.hash("outlet123");
  const warehousePasswordHash = await Bun.password.hash("warehouse123");

  await prisma.role.upsert({
    where: { id: IDS.adminRole },
    update: { name: "Admin", permissions: ["*"], isSystem: true },
    create: { id: IDS.adminRole, name: "Admin", permissions: ["*"], isSystem: true }
  });

  await prisma.role.upsert({
    where: { id: IDS.salesRole },
    update: { name: "Sales", permissions: [...DEV_SALES_PERMISSIONS], isSystem: false },
    create: { id: IDS.salesRole, name: "Sales", permissions: [...DEV_SALES_PERMISSIONS], isSystem: false }
  });

  await prisma.role.upsert({
    where: { id: IDS.warehouseRole },
    update: { name: "Warehouse Manager", permissions: [...DEV_WAREHOUSE_PERMISSIONS], isSystem: false },
    create: {
      id: IDS.warehouseRole,
      name: "Warehouse Manager",
      permissions: [...DEV_WAREHOUSE_PERMISSIONS],
      isSystem: false
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.adminUser },
    update: {
      email: "admin@syrex.local",
      name: "System Admin",
      passwordHash: adminPasswordHash,
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    },
    create: {
      id: IDS.adminUser,
      email: "admin@syrex.local",
      name: "System Admin",
      passwordHash: adminPasswordHash,
      userType: UserType.internal,
      roleId: IDS.adminRole,
      isActive: true
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.outletUser },
    update: {
      email: "outlet@syrex.local",
      name: "Outlet User",
      passwordHash: outletPasswordHash,
      userType: UserType.outlet,
      roleId: IDS.salesRole,
      isActive: true,
      isFieldEnabled: true
    },
    create: {
      id: IDS.outletUser,
      email: "outlet@syrex.local",
      name: "Outlet User",
      passwordHash: outletPasswordHash,
      userType: UserType.outlet,
      roleId: IDS.salesRole,
      isActive: true,
      isFieldEnabled: true
    }
  });

  await prisma.user.upsert({
    where: { id: IDS.warehouseUser },
    update: {
      email: "warehouse@syrex.local",
      name: "Warehouse User",
      passwordHash: warehousePasswordHash,
      userType: UserType.internal,
      roleId: IDS.warehouseRole,
      isActive: true
    },
    create: {
      id: IDS.warehouseUser,
      email: "warehouse@syrex.local",
      name: "Warehouse User",
      passwordHash: warehousePasswordHash,
      userType: UserType.internal,
      roleId: IDS.warehouseRole,
      isActive: true
    }
  });

  console.log(
    JSON.stringify(
      {
        seeded: true,
        users: [
          { email: "admin@syrex.local", password: "admin123", role: "Admin" },
          { email: "outlet@syrex.local", password: "outlet123", role: "Sales" },
          { email: "warehouse@syrex.local", password: "warehouse123", role: "Warehouse Manager" }
        ]
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
