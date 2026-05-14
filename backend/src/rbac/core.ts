export const SUPER_ADMIN_PERMISSION = "*" as const;

const MODULE_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const ACTION_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const PERMISSION_KEY_PATTERN = /^([a-z][a-z0-9-]*):([a-z][a-z0-9-]*)$/;

export type PermissionRiskTier = "low" | "medium" | "high";

export type PermissionMetadata = {
  label: string;
  description: string;
  risk?: PermissionRiskTier;
};

export type PermissionCatalogEntry = {
  key: `${string}:${string}`;
  module: string;
  action: string;
  label: string;
  description: string;
  risk: PermissionRiskTier;
  group: string;
};

export type PermissionModuleManifest<
  M extends string = string,
  T extends Record<string, `${M}:${string}`> = Record<string, `${M}:${string}`>
> = {
  module: M;
  group: string;
  permissions: T;
  entries: PermissionCatalogEntry[];
};

export function definePermissionModule<
  const M extends string,
  const T extends Record<string, `${M}:${string}`>
>(args: {
  module: M;
  group: string;
  permissions: T;
  entries: { [K in keyof T]: PermissionMetadata };
}): PermissionModuleManifest<M, T> {
  const { module, group, permissions, entries } = args;

  if (!MODULE_KEY_PATTERN.test(module)) {
    throw new Error(`[RBAC] Invalid module key \"${module}\". Expected lower-case slug.`);
  }

  const catalogEntries: PermissionCatalogEntry[] = [];

  for (const action of Object.keys(permissions) as Array<keyof T & string>) {
    const permissionKey = permissions[action];
    const match = PERMISSION_KEY_PATTERN.exec(permissionKey);
    if (!match) {
      throw new Error(`[RBAC] Invalid permission key \"${permissionKey}\" for module \"${module}\".`);
    }

    const [, keyModule, keyAction] = match;
    if (keyModule !== module) {
      throw new Error(
        `[RBAC] Permission key \"${permissionKey}\" does not match module \"${module}\".`
      );
    }

    if (keyAction !== action) {
      throw new Error(
        `[RBAC] Permission key \"${permissionKey}\" action must match field \"${action}\".`
      );
    }

    if (!ACTION_KEY_PATTERN.test(action)) {
      throw new Error(`[RBAC] Invalid action key \"${action}\" in module \"${module}\".`);
    }

    const metadata = entries[action];
    if (!metadata || !metadata.label.trim() || !metadata.description.trim()) {
      throw new Error(
        `[RBAC] Missing metadata for permission \"${permissionKey}\" in module \"${module}\".`
      );
    }

    catalogEntries.push({
      key: permissionKey,
      module,
      action,
      label: metadata.label.trim(),
      description: metadata.description.trim(),
      risk: metadata.risk ?? "low",
      group,
    });
  }

  return {
    module,
    group,
    permissions,
    entries: catalogEntries,
  };
}

export function aggregatePermissionCatalog(
  manifests: PermissionModuleManifest[]
): { entries: PermissionCatalogEntry[]; keys: string[]; keySet: ReadonlySet<string> } {
  const entries: PermissionCatalogEntry[] = [];
  const keySet = new Set<string>();

  for (const manifest of manifests) {
    if (!MODULE_KEY_PATTERN.test(manifest.module)) {
      throw new Error(`[RBAC] Invalid module key \"${manifest.module}\" in manifest.`);
    }

    for (const entry of manifest.entries) {
      const match = PERMISSION_KEY_PATTERN.exec(entry.key);
      if (!match) {
        throw new Error(`[RBAC] Malformed catalog key \"${entry.key}\".`);
      }
      if (match[1] !== manifest.module || entry.module !== manifest.module || match[2] !== entry.action) {
        throw new Error(
          `[RBAC] Catalog entry mismatch for key \"${entry.key}\" in module \"${manifest.module}\".`
        );
      }
      if (keySet.has(entry.key)) {
        throw new Error(`[RBAC] Duplicate permission key detected: \"${entry.key}\".`);
      }
      keySet.add(entry.key);
      entries.push(entry);
    }
  }

  entries.sort((a, b) => {
    const groupCompare = a.group.localeCompare(b.group);
    if (groupCompare !== 0) return groupCompare;
    const moduleCompare = a.module.localeCompare(b.module);
    if (moduleCompare !== 0) return moduleCompare;
    return a.key.localeCompare(b.key);
  });

  const keys = entries.map((entry) => entry.key);

  return {
    entries,
    keys,
    keySet,
  };
}
