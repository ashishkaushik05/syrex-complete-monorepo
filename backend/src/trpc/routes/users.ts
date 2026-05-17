import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { P } from "../../rbac/catalog";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";
import { Prisma } from "@prisma/client";

const userTypeSchema = z.enum(["internal", "outlet"]);

const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  phone: z.string().nullable(),
  name: z.string(),
  userType: userTypeSchema,
  roleId: z.string(),
  isActive: z.boolean(),
  isFieldEnabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const createUserSchema = z.object({
  email: z.string().email(),
  phone: z.string().min(1).optional(),
  name: z.string().min(1),
  password: z.string().min(1),
  userType: userTypeSchema,
  roleId: z.string().uuid(),
  isActive: z.boolean().default(true)
});

const updateUserSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().min(1).nullable().optional(),
  name: z.string().min(1).optional(),
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional()
});

const changePasswordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().min(8)
});

const listUsersInputSchema = paginationInputSchema.extend({
  roleId: z.string().uuid().optional(),
  isActive: z.boolean().optional(),
  q: z.string().min(1).optional()
});

function toUser(user: {
  id: string;
  email: string;
  phone: string | null;
  name: string;
  userType: "internal" | "outlet";
  roleId: string;
  isActive: boolean;
  isFieldEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

async function hashPassword(password: string) {
  return Bun.password.hash(password);
}

export const usersRouter = createTRPCRouter({
  list: perm(P.users.read)
    .input(listUsersInputSchema)
    .output(
      z.object({
        items: z.array(userSchema),
        nextCursor: z.string().nullable()
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const users = await ctx.prisma.user.findMany({
        where: {
          roleId: input.roleId,
          isActive: input.isActive,
          OR: input.q
            ? [
                { email: { contains: input.q, mode: "insensitive" } },
                { name: { contains: input.q, mode: "insensitive" } }
              ]
            : undefined
        },
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          userType: true,
          roleId: true,
          isActive: true,
          isFieldEnabled: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });
      const hasMore = users.length > input.limit;
      const pageItems = hasMore ? users.slice(0, input.limit) : users;
      return {
        items: pageItems.map(toUser),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  getById: perm(P.users.read)
    .input(z.object({ id: z.string().uuid() }))
    .output(userSchema)
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          userType: true,
          roleId: true,
          isActive: true,
          isFieldEnabled: true,
          createdAt: true,
          updatedAt: true
        }
      });
      if (!user) {
        throw apiError("NOT_FOUND", "User not found");
      }
      return toUser(user);
    }),

  create: perm(P.users.write).input(createUserSchema).output(userSchema).mutation(async ({ ctx, input }) => {
    const role = await ctx.prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) {
      throw apiError("BAD_REQUEST", "Invalid roleId");
    }
    const existing = await ctx.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw apiError("CONFLICT", "Email already exists");
    }

    const user = await ctx.prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        name: input.name,
        passwordHash: await hashPassword(input.password),
        userType: input.userType,
        roleId: input.roleId,
        isActive: input.isActive,
        isFieldEnabled: false
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        userType: true,
        roleId: true,
        isActive: true,
        isFieldEnabled: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return toUser(user);
  }),

  update: perm(P.users.write).input(updateUserSchema).output(userSchema).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.user.findUnique({ where: { id: input.id } });
    if (!existing) {
      throw apiError("NOT_FOUND", "User not found");
    }
    if (input.roleId) {
      const role = await ctx.prisma.role.findUnique({ where: { id: input.roleId } });
      if (!role) {
        throw apiError("BAD_REQUEST", "Invalid roleId");
      }
    }

    const user = await ctx.prisma.user.update({
      where: { id: input.id },
      data: {
        phone: input.phone,
        name: input.name,
        roleId: input.roleId,
        isActive: input.isActive
      },
      select: {
        id: true,
        email: true,
        phone: true,
        name: true,
        userType: true,
        roleId: true,
        isActive: true,
        isFieldEnabled: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return toUser(user);
  }),

  changePassword: perm(P.users.write)
    .input(changePasswordSchema)
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!existing) {
        throw apiError("NOT_FOUND", "User not found");
      }

      await ctx.prisma.user.update({
        where: { id: input.id },
        data: { passwordHash: await hashPassword(input.password) }
      });

      return { ok: true };
    }),

  remove: perm(P.users.deactivate)
    .input(z.object({ id: z.string().uuid() }))
    .output(z.object({ ok: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({ where: { id: input.id }, select: { id: true } });
      if (!existing) {
        throw apiError("NOT_FOUND", "User not found");
      }

      try {
        await ctx.prisma.user.delete({ where: { id: input.id } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
          throw apiError(
            "BAD_REQUEST",
            "User cannot be deleted because it is referenced by other records; remove dependencies first."
          );
        }
        throw error;
      }

      return { ok: true };
    }),

  toggleFieldSense: perm(P.users["field-enable"])
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .output(z.object({ ok: z.literal(true), isFieldEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: { id: true, userType: true }
      });
      if (!existing) throw apiError("NOT_FOUND", "User not found");
      if (existing.userType !== "internal") {
        throw apiError("BAD_REQUEST", "Field Sense can only be enabled for internal users");
      }

      await ctx.prisma.user.update({
        where: { id: input.id },
        data: { isFieldEnabled: input.enabled }
      });

      return { ok: true, isFieldEnabled: input.enabled };
    })
});
