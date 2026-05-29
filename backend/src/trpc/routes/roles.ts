import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { P, SUPER_ADMIN_PERMISSION, validatePermissionKeys } from "../../rbac/catalog";

const roleSchema = z.object({
  id: z.string(),
  name: z.string(),
  permissions: z.array(z.string()),
  isSystem: z.boolean(),
  createdAt: z.string()
});

const createRoleSchema = z.object({
  name: z.string().min(1),
  permissions: z.array(z.string()).default([]),
  isSystem: z.boolean().default(false)
});

const updateRoleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).optional(),
  permissions: z.array(z.string()).optional(),
  isSystem: z.boolean().optional()
});

function toRole(role: { id: string; name: string; permissions: string[]; isSystem: boolean; createdAt: Date }) {
  return {
    ...role,
    createdAt: role.createdAt.toISOString()
  };
}

function normalizeAndValidateRolePermissions(rawPermissions: string[]) {
  const { valid, invalid } = validatePermissionKeys(rawPermissions);
  if (invalid.length > 0) {
    throw apiError("BAD_REQUEST", `Invalid permission keys: ${invalid.join(", ")}`);
  }
  return valid.sort();
}

export const rolesRouter = createTRPCRouter({
  list: perm(P.roles.read).output(z.array(roleSchema)).query(async ({ ctx }) => {
    const roles = await ctx.prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
    return roles.map(toRole);
  }),

  create: perm(P.roles.write).input(createRoleSchema).output(roleSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.role.findUnique({ where: { name: input.name } });
    if (existing) {
      throw apiError("CONFLICT", "Role name already exists");
    }
    const permissions = normalizeAndValidateRolePermissions(input.permissions);
    const role = await ctx.prisma.role.create({
      data: {
        ...input,
        permissions
      }
    });
    return toRole(role);
  }),

  update: perm(P.roles.write).input(updateRoleSchema).output(roleSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.role.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "Role not found");
    }

    if (
      input.permissions?.includes(SUPER_ADMIN_PERMISSION) &&
      !ctx.permissions.includes(SUPER_ADMIN_PERMISSION)
    ) {
      throw apiError("FORBIDDEN", "Only super-admins can assign wildcard permission");
    }

    if (input.isSystem !== undefined && !ctx.permissions.includes(SUPER_ADMIN_PERMISSION)) {
      throw apiError("FORBIDDEN", "Only super-admins can modify system role flag");
    }

    const permissions = input.permissions ? normalizeAndValidateRolePermissions(input.permissions) : undefined;
    const role = await ctx.prisma.role.update({
      where: { id: input.id },
      data: {
        name: input.name,
        permissions,
        isSystem: input.isSystem
      }
    });
    return toRole(role);
  }),

  delete: perm(P.roles.delete)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ success: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const role = await ctx.prisma.role.findUnique({ where: { id: input.id } });
      if (!role) {
        throw apiError("NOT_FOUND", "Role not found");
      }

      if (role.isSystem) {
        throw apiError("FORBIDDEN", "System roles cannot be deleted");
      }

      const userCount = await ctx.prisma.user.count({ where: { roleId: input.id } });
      if (userCount > 0) {
        throw apiError(
          "CONFLICT",
          `Cannot delete role: ${userCount} user(s) (active or inactive) are still assigned`
        );
      }

      await ctx.prisma.role.delete({ where: { id: input.id } });
      return { success: true as const };
    })
});
