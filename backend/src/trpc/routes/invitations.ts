import { z } from "zod";
import { createTRPCRouter, perm } from "../trpc";
import { apiError } from "../error";
import { decodeCursor, encodeCursor, paginationInputSchema } from "./_shared";

const invitationStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);

const invitationViewSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.string(),
  token: z.string(),
  status: invitationStatusSchema,
  invitedById: z.string(),
  acceptedUserId: z.string().nullable(),
  expiresAt: z.string(),
  acceptedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

const createInvitationSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.string().min(1),
  expiresAt: z.string().datetime()
});

const listInvitationsInputSchema = paginationInputSchema.extend({
  status: invitationStatusSchema.optional(),
  email: z.string().email().optional()
});

function normalizeStatus(status: string): z.infer<typeof invitationStatusSchema> {
  if (status === "pending" || status === "accepted" || status === "revoked" || status === "expired") {
    return status;
  }
  return "pending";
}

function toInvitationView(invitation: {
  id: string;
  email: string;
  name: string;
  role: string;
  token: string;
  status: string;
  invitedById: string;
  acceptedUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: invitation.id,
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    token: invitation.token,
    status: normalizeStatus(invitation.status),
    invitedById: invitation.invitedById,
    acceptedUserId: invitation.acceptedUserId,
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
    updatedAt: invitation.updatedAt.toISOString()
  };
}

export const invitationsRouter = createTRPCRouter({
  create: perm("users:invite")
    .input(createInvitationSchema)
    .output(invitationViewSchema)
    .mutation(async ({ ctx, input }) => {
      const invitedById = ctx.actor.id;
      if (!invitedById) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }

      const invitation = await ctx.prisma.userInvitation.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          token: crypto.randomUUID().replaceAll("-", ""),
          invitedById,
          expiresAt: new Date(input.expiresAt)
        }
      });

      return toInvitationView(invitation);
    }),

  list: perm("users:invite")
    .input(listInvitationsInputSchema)
    .output(
      z.object({
        items: z.array(invitationViewSchema),
        nextCursor: z.string().nullable()
      })
    )
    .query(async ({ ctx, input }) => {
      const offset = decodeCursor(input.cursor) ?? 0;
      const items = await ctx.prisma.userInvitation.findMany({
        where: {
          status: input.status,
          email: input.email
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: input.limit + 1
      });

      const hasMore = items.length > input.limit;
      const pageItems = hasMore ? items.slice(0, input.limit) : items;
      return {
        items: pageItems.map(toInvitationView),
        nextCursor: hasMore ? encodeCursor(offset + input.limit) : null
      };
    }),

  revoke: perm("users:invite")
    .input(z.object({ id: z.string().uuid() }))
    .output(invitationViewSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.userInvitation.findUnique({ where: { id: input.id } });
      if (!existing) {
        throw apiError("NOT_FOUND", "Invitation not found");
      }
      const updated = await ctx.prisma.userInvitation.update({
        where: { id: input.id },
        data: {
          status: "revoked",
          revokedAt: new Date()
        }
      });
      return toInvitationView(updated);
    }),

  accept: perm("users:invite")
    .input(z.object({ token: z.string().min(1) }))
    .output(invitationViewSchema)
    .mutation(async ({ ctx, input }) => {
      const actorId = ctx.actor.id;
      if (!actorId) {
        throw apiError("UNAUTHORIZED", "Missing actor context");
      }

      const invitation = await ctx.prisma.userInvitation.findUnique({ where: { token: input.token } });
      if (!invitation) {
        throw apiError("NOT_FOUND", "Invitation not found");
      }
      if (invitation.status !== "pending") {
        throw apiError("CONFLICT", "Invitation is not pending");
      }
      if (invitation.expiresAt.getTime() < Date.now()) {
        throw apiError("CONFLICT", "Invitation is expired");
      }

      const accepted = await ctx.prisma.userInvitation.update({
        where: { id: invitation.id },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedUserId: actorId
        }
      });
      return toInvitationView(accepted);
    })
});
