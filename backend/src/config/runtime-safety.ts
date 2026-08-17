export type RuntimeEnvironmentSource = Record<string, string | undefined>;

/**
 * Blocks commands that create deterministic demo data or reset a database from
 * being run with the production runtime designation. This is intentionally a
 * small standalone guard so maintenance scripts can use it without importing
 * the full application environment (which itself requires DATABASE_URL).
 */
export function assertNonProductionCommand(
  command: string,
  source: RuntimeEnvironmentSource = Bun.env,
) {
  if (source.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error(
      `[${command}] refuses to run when NODE_ENV=production. Use a reviewed production migration or operational runbook instead.`,
    );
  }
}

/**
 * Test fixture commands reset their database and must never run against a
 * developer or production environment. Keep this separate from the broader
 * non-production guard because development is intentionally not sufficient.
 */
export function assertTestOnlyCommand(
  command: string,
  source: RuntimeEnvironmentSource = Bun.env,
): void {
  if (source.NODE_ENV?.trim().toLowerCase() !== "test") {
    throw new Error(`[safety] Refusing ${command}: NODE_ENV must be test.`);
  }
}
