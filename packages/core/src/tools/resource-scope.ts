import type { ToolResourceAccess, ToolResourceScope } from "../contracts/tool-runtime";

export type ResourceAccess = ToolResourceAccess;

export type KnownResourceScope = ToolResourceScope;

export type UnknownResourceScope = {
  kind: "unknown";
  access?: ResourceAccess;
  reason?: string;
};

export type ResourceScope = KnownResourceScope | UnknownResourceScope;

export function pathScope(value: string, access: ResourceAccess): ToolResourceScope {
  return { kind: "path", access, value };
}

export function resourceScope(value: string, access: ResourceAccess): ToolResourceScope {
  return { kind: "custom", access, value };
}

export function unknownScope(reason?: string): UnknownResourceScope {
  return reason ? { kind: "unknown", reason } : { kind: "unknown" };
}

export function hasUnknownScope(scopes: readonly ResourceScope[]): boolean {
  return scopes.some((scope) => scope.kind === "unknown");
}

export function scopesConflict(left: ResourceScope, right: ResourceScope): boolean {
  if (left.kind === "unknown" || right.kind === "unknown") {
    return true;
  }

  if (left.access === "read" && right.access === "read") {
    return false;
  }

  if (left.kind === "path" && right.kind === "path") {
    return pathsOverlap(left.value, right.value);
  }

  if (left.kind === "workspace" && right.kind === "path") {
    return pathsOverlap(left.value, right.value);
  }

  if (left.kind === "path" && right.kind === "workspace") {
    return pathsOverlap(right.value, left.value);
  }

  if (left.kind !== right.kind) {
    return false;
  }

  return left.value === right.value;
}

export function resourceScopeSetsConflict(left: readonly ResourceScope[], right: readonly ResourceScope[]): boolean {
  for (const leftScope of left) {
    for (const rightScope of right) {
      if (scopesConflict(leftScope, rightScope)) {
        return true;
      }
    }
  }
  return false;
}

export function normalizePathScopePath(path: string): string {
  const slashPath = path.replace(/\\/g, "/");
  const hasLeadingSlash = slashPath.startsWith("/");
  const parts: string[] = [];

  for (const part of slashPath.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      const previous = parts.at(-1);
      if (previous && previous !== "..") {
        parts.pop();
        continue;
      }
      if (!hasLeadingSlash) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }

  const normalized = parts.join("/");
  return hasLeadingSlash ? `/${normalized}` : normalized || ".";
}

function pathsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizePathScopePath(left);
  const normalizedRight = normalizePathScopePath(right);

  return (
    normalizedLeft === normalizedRight ||
    isPathDescendant(normalizedLeft, normalizedRight) ||
    isPathDescendant(normalizedRight, normalizedLeft)
  );
}

function isPathDescendant(parent: string, child: string): boolean {
  const normalizedParent = parent.endsWith("/") ? parent : `${parent}/`;
  return child.startsWith(normalizedParent);
}
