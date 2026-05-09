import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";

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

export const rolesRouter = createTRPCRouter({
  list: perm("roles:read").output(z.array(roleSchema)).query(async ({ ctx }) => {
    const roles = await ctx.prisma.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }] });
    return roles.map(toRole);
  }),

  create: perm("roles:write").input(createRoleSchema).output(roleSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.role.findUnique({ where: { name: input.name } });
    if (existing) {
      throw apiError("CONFLICT", "Role name already exists");
    }
    const role = await ctx.prisma.role.create({ data: input });
    return toRole(role);
  }),

  update: perm("roles:write").input(updateRoleSchema).output(roleSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.role.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "Role not found");
    }
    const role = await ctx.prisma.role.update({
      where: { id: input.id },
      data: {
        name: input.name,
        permissions: input.permissions,
        isSystem: input.isSystem
      }
    });
    return toRole(role);
  })
});
