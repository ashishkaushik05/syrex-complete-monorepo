import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { apiError } from "../error";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const sessionTokenSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int(),
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    userType: z.string(),
    roleId: z.string(),
    isFieldEnabled: z.boolean(),
    role: z.object({
      id: z.string(),
      name: z.string(),
      permissions: z.array(z.string())
    }),
    managedWarehouseId: z.string().nullable(),
    outletId: z.string().nullable()
  })
});

function tokenPrefix() {
  return crypto.randomUUID().replaceAll("-", "");
}

function tokenExpiryDate() {
  return new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
}

async function verifyPassword(storedHash: string, inputPassword: string) {
  if (storedHash.startsWith("$2") || storedHash.startsWith("$argon2")) {
    return Bun.password.verify(inputPassword, storedHash);
  }
  return storedHash === inputPassword;
}

export const authRouter = createTRPCRouter({
  login: publicProcedure.input(loginSchema).output(sessionTokenSchema).mutation(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { email: input.email },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        userType: true,
        roleId: true,
        isFieldEnabled: true,
        role: { select: { id: true, name: true, permissions: true } },
        isActive: true,
        managedWarehouse: { select: { id: true } },
        outlet: { select: { id: true } }
      }
    });

    if (!user || !user.isActive) {
      throw apiError("UNAUTHORIZED", "Invalid credentials");
    }

    const isValidPassword = await verifyPassword(user.passwordHash, input.password);
    if (!isValidPassword) {
      throw apiError("UNAUTHORIZED", "Invalid credentials");
    }

    const accessToken = `access_${tokenPrefix()}`;
    const refreshToken = `refresh_${tokenPrefix()}`;
    await ctx.prisma.authSession.create({
      data: {
        userId: user.id,
        accessToken,
        refreshToken,
        expiresAt: tokenExpiryDate()
      }
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        roleId: user.roleId,
        isFieldEnabled: user.isFieldEnabled,
        role: { id: user.role.id, name: user.role.name, permissions: user.role.permissions },
        managedWarehouseId: user.managedWarehouse?.id ?? null,
        outletId: user.outlet?.id ?? null
      }
    };
  }),

  refresh: publicProcedure.input(refreshSchema).output(sessionTokenSchema).mutation(async ({ ctx, input }) => {
    if (!input.refreshToken.startsWith("refresh_")) {
      throw apiError("UNAUTHORIZED", "Invalid refresh token");
    }
    const session = await ctx.prisma.authSession.findUnique({
      where: { refreshToken: input.refreshToken },
      select: { id: true, userId: true, expiresAt: true, revokedAt: true }
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw apiError("UNAUTHORIZED", "Invalid refresh token");
    }

    const user = await ctx.prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        name: true,
        userType: true,
        roleId: true,
        isFieldEnabled: true,
        role: { select: { id: true, name: true, permissions: true } },
        isActive: true,
        managedWarehouse: { select: { id: true } },
        outlet: { select: { id: true } }
      }
    });
    if (!user || !user.isActive) {
      throw apiError("UNAUTHORIZED", "Invalid refresh context");
    }

    const rotatedAccessToken = `access_${tokenPrefix()}`;
    const rotatedRefreshToken = `refresh_${tokenPrefix()}`;
    await ctx.prisma.authSession.update({
      where: { id: session.id },
      data: {
        accessToken: rotatedAccessToken,
        refreshToken: rotatedRefreshToken,
        expiresAt: tokenExpiryDate(),
        revokedAt: null
      }
    });

    return {
      accessToken: rotatedAccessToken,
      refreshToken: rotatedRefreshToken,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        roleId: user.roleId,
        isFieldEnabled: user.isFieldEnabled,
        role: { id: user.role.id, name: user.role.name, permissions: user.role.permissions },
        managedWarehouseId: user.managedWarehouse?.id ?? null,
        outletId: user.outlet?.id ?? null
      }
    };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.authSession.updateMany({
      where: {
        userId: ctx.actor.id!,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });
    return { ok: true };
  }),

  me: protectedProcedure
    .output(
      z.object({
        id: z.string(),
        email: z.string().email(),
        name: z.string(),
        userType: z.string(),
        roleId: z.string(),
        role: z.object({
          id: z.string(),
          name: z.string(),
          permissions: z.array(z.string())
        }),
        isActive: z.boolean(),
        isFieldEnabled: z.boolean(),
        managedWarehouseId: z.string().nullable(),
        outletId: z.string().nullable()
      })
    )
    .query(async ({ ctx }) => {
      const actorId = ctx.actor.id;
      if (!actorId) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      const [user, outlet] = await Promise.all([
        ctx.prisma.user.findUnique({
          where: { id: actorId },
          select: {
            id: true,
            email: true,
            name: true,
            userType: true,
            roleId: true,
            role: { select: { id: true, name: true, permissions: true } },
            isActive: true,
            isFieldEnabled: true,
            managedWarehouse: { select: { id: true } }
          }
        }),
        ctx.prisma.outlet.findUnique({
          where: { userId: actorId },
          select: { id: true }
        })
      ]);
      if (!user) {
        throw apiError("NOT_FOUND", "User not found");
      }
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        roleId: user.roleId,
        role: { id: user.role.id, name: user.role.name, permissions: user.role.permissions },
        isActive: user.isActive,
        isFieldEnabled: user.isFieldEnabled,
        managedWarehouseId: user.managedWarehouse?.id ?? null,
        outletId: outlet?.id ?? null
      };
    })
});
