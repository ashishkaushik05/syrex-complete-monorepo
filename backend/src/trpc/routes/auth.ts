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
    roleId: z.string()
  })
});

function tokenPrefix() {
  return crypto.randomUUID().replaceAll("-", "");
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
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      throw apiError("UNAUTHORIZED", "Invalid credentials");
    }

    if (user.passwordHash !== input.password) {
      throw apiError("UNAUTHORIZED", "Invalid credentials");
    }

    return {
      accessToken: `access_${tokenPrefix()}`,
      refreshToken: `refresh_${tokenPrefix()}`,
      expiresIn: 900,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        userType: user.userType,
        roleId: user.roleId
      }
    };
  }),

  refresh: publicProcedure.input(refreshSchema).output(sessionTokenSchema).mutation(async ({ ctx, input }) => {
    if (!input.refreshToken.startsWith("refresh_")) {
      throw apiError("UNAUTHORIZED", "Invalid refresh token");
    }
    const actorId = ctx.actor.id;
    if (!actorId) {
      throw apiError("UNAUTHORIZED", "Missing actor context");
    }
    const user = await ctx.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, email: true, name: true, userType: true, roleId: true, isActive: true }
    });
    if (!user || !user.isActive) {
      throw apiError("UNAUTHORIZED", "Invalid refresh context");
    }
    return {
      accessToken: `access_${tokenPrefix()}`,
      refreshToken: `refresh_${tokenPrefix()}`,
      expiresIn: 900,
      user
    };
  }),

  logout: protectedProcedure.mutation(async () => {
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
        isActive: z.boolean()
      })
    )
    .query(async ({ ctx }) => {
      const actorId = ctx.actor.id;
      if (!actorId) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }
      const user = await ctx.prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, email: true, name: true, userType: true, roleId: true, isActive: true }
      });
      if (!user) {
        throw apiError("NOT_FOUND", "User not found");
      }
      return user;
    })
});
