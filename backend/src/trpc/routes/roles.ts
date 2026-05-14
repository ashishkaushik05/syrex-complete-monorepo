import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { P, validatePermissionKeys } from "../../rbac/catalog";

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
  })
});
