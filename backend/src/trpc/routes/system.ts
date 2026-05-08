import { z } from "zod";
import { publicProcedure, createTRPCRouter } from "../trpc";

const conventionSchema = z.object({
  timezonePolicy: z.literal("UTC_ISO_8601"),
  decimalTransport: z.literal("string"),
  pagination: z.object({
    style: z.literal("cursor"),
    defaultLimit: z.literal(25),
    maxLimit: z.literal(100),
    inputShape: z.object({
      cursor: z.literal("string|null|undefined"),
      limit: z.literal("number(1..100), default 25")
    })
  }),
  errors: z.array(
    z.enum(["BAD_REQUEST", "CONFLICT", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "INTERNAL"])
  )
});

export const systemRouter = createTRPCRouter({
  conventions: publicProcedure.output(conventionSchema).query(() => ({
    timezonePolicy: "UTC_ISO_8601",
    decimalTransport: "string",
    pagination: {
      style: "cursor",
      defaultLimit: 25,
      maxLimit: 100,
      inputShape: {
        cursor: "string|null|undefined",
        limit: "number(1..100), default 25"
      }
    },
    errors: ["BAD_REQUEST", "CONFLICT", "NOT_FOUND", "UNAUTHORIZED", "FORBIDDEN", "INTERNAL"]
  }))
});
