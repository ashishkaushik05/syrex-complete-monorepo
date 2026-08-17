import { describe, expect, it } from "bun:test";

import { SUPER_ADMIN_PERMISSION, P } from "../../rbac/catalog";
import { appRouter } from "../router";

type RoleRecord = {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: Date;
};

function createCaller(options: {
  actorPermissions: string[];
  existingRole: RoleRecord;
  assignedUserCount?: number;
}) {
  let updateCalled = false;
  let deleteCalled = false;

  const prisma = {
    user: {
      findUnique: async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        role: { permissions: options.actorPermissions },
        managedWarehouse: null
      }),
      count: async () => options.assignedUserCount ?? 0
    },
    role: {
      findUnique: async () => options.existingRole,
      update: async (args: any) => {
        updateCalled = true;
        return {
          id: options.existingRole.id,
          name: args.data.name ?? options.existingRole.name,
          permissions: args.data.permissions ?? options.existingRole.permissions,
          isSystem: args.data.isSystem ?? options.existingRole.isSystem,
          createdAt: options.existingRole.createdAt
        };
      },
      delete: async () => {
        deleteCalled = true;
        return options.existingRole;
      }
    }
  };

  const caller = appRouter.createCaller({
    requestId: "test",
    actor: {
      id: "11111111-1111-4111-8111-111111111111",
      orgId: null
    },
    prisma,
    permissions: options.actorPermissions,
    managedWarehouseId: null,
    serviceClientId: null,
    serviceClientSecret: null,
    serviceScopes: []
  } as any);

  return {
    caller,
    wasUpdateCalled: () => updateCalled,
    wasDeleteCalled: () => deleteCalled
  };
}

describe("roles router guardrails", () => {
  const roleId = "22222222-2222-4222-8222-222222222222";
  const baseRole: RoleRecord = {
    id: roleId,
    name: "Sales",
    permissions: [P.orders.read],
    isSystem: false,
    createdAt: new Date("2026-05-25T00:00:00.000Z")
  };

  it("blocks wildcard escalation in roles.update for non-super-admin actor", async () => {
    const { caller, wasUpdateCalled } = createCaller({
      actorPermissions: [P.roles.write],
      existingRole: baseRole
    });

    await expect(
      caller.roles.update({
        id: roleId,
        permissions: [SUPER_ADMIN_PERMISSION]
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only super-admins can assign wildcard permission"
    });
    expect(wasUpdateCalled()).toBe(false);
  });

  it("blocks isSystem mutation in roles.update for non-super-admin actor", async () => {
    const { caller, wasUpdateCalled } = createCaller({
      actorPermissions: [P.roles.write],
      existingRole: baseRole
    });

    await expect(
      caller.roles.update({
        id: roleId,
        isSystem: true
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Only super-admins can modify system role flag"
    });
    expect(wasUpdateCalled()).toBe(false);
  });

  it("rejects roles.delete for system roles", async () => {
    const { caller, wasDeleteCalled } = createCaller({
      actorPermissions: [P.roles.delete],
      existingRole: {
        ...baseRole,
        isSystem: true
      }
    });

    await expect(caller.roles.delete({ id: roleId })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "System roles cannot be deleted"
    });
    expect(wasDeleteCalled()).toBe(false);
  });

  it("rejects roles.delete when any users are assigned (active or inactive)", async () => {
    const { caller, wasDeleteCalled } = createCaller({
      actorPermissions: [P.roles.delete],
      existingRole: baseRole,
      assignedUserCount: 2
    });

    await expect(caller.roles.delete({ id: roleId })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Cannot delete role: 2 user(s) (active or inactive) are still assigned"
    });
    expect(wasDeleteCalled()).toBe(false);
  });

  it("allows roles.delete for non-system roles with zero assigned users", async () => {
    const { caller, wasDeleteCalled } = createCaller({
      actorPermissions: [P.roles.delete],
      existingRole: baseRole,
      assignedUserCount: 0
    });

    await expect(caller.roles.delete({ id: roleId })).resolves.toEqual({ success: true });
    expect(wasDeleteCalled()).toBe(true);
  });
});
