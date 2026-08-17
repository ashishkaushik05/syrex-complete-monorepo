import { Prisma } from "@prisma/client";

// Money fields are Prisma.Decimal. Construct with dec(), compare with decEq() —
// never === (two Decimals are never referentially equal).

export function dec(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function decEq(a: Prisma.Decimal, b: number | string | Prisma.Decimal): boolean {
  return a.equals(b instanceof Prisma.Decimal ? b : new Prisma.Decimal(b));
}
