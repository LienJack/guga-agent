import { describe, expect, it } from "vitest";
import {
  normalizePathScopePath,
  pathScope,
  resourceScope,
  resourceScopeSetsConflict,
  scopesConflict,
  unknownScope
} from "./resource-scope";

describe("resource scopes", () => {
  it("does not conflict for read-only scopes on the same path", () => {
    expect(scopesConflict(pathScope("/workspace/a.txt", "read"), pathScope("/workspace/a.txt", "read"))).toBe(false);
  });

  it("conflicts for parent and child path writes", () => {
    expect(scopesConflict(pathScope("/workspace/src", "write"), pathScope("/workspace/src/file.ts", "write"))).toBe(
      true
    );
  });

  it("conflicts for workspace and nested path mutations", () => {
    expect(scopesConflict(
      { kind: "workspace", access: "write", value: "/workspace" },
      pathScope("/workspace/src/file.ts", "write")
    )).toBe(true);
  });

  it("does not conflict for disjoint path writes", () => {
    expect(scopesConflict(pathScope("/workspace/a.txt", "write"), pathScope("/workspace/b.txt", "write"))).toBe(
      false
    );
  });

  it("conflicts when named resources match and at least one side writes", () => {
    expect(scopesConflict(resourceScope("git:index", "read"), resourceScope("git:index", "write"))).toBe(true);
    expect(scopesConflict(resourceScope("git:index", "write"), resourceScope("git:head", "write"))).toBe(false);
  });

  it("treats unknown scopes as conflicting", () => {
    expect(scopesConflict(unknownScope("dynamic path"), pathScope("/workspace/a.txt", "read"))).toBe(true);
  });

  it("detects conflicts across scope sets", () => {
    expect(
      resourceScopeSetsConflict(
        [pathScope("/workspace/a.txt", "read"), pathScope("/workspace/src", "write")],
        [pathScope("/workspace/src/nested.ts", "write")]
      )
    ).toBe(true);
  });

  it("normalizes dot segments and platform separators", () => {
    expect(normalizePathScopePath("/workspace/src/../README.md")).toBe("/workspace/README.md");
    expect(normalizePathScopePath("workspace\\src\\.\\index.ts")).toBe("workspace/src/index.ts");
  });
});
