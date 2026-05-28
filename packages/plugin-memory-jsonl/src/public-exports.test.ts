import { describe, expect, it } from "vitest";
import {
  MEMORY_JSONL_OPERATION_NAME,
  MEMORY_JSONL_OPERATION_NAMESPACE,
  MEMORY_JSONL_OPERATION_NAMES,
  MEMORY_JSONL_READ_OPERATION_NAMES
} from "./index";

describe("plugin-memory-jsonl public exports", () => {
  it("exports stable capability constants from the package entrypoint", () => {
    expect(MEMORY_JSONL_OPERATION_NAME).toBe("memory.jsonl");
    expect(MEMORY_JSONL_OPERATION_NAMESPACE).toBe("memory-jsonl");
    expect(MEMORY_JSONL_READ_OPERATION_NAMES).toEqual([
      "memory.jsonl.review",
      "memory.jsonl.review_report",
      "memory.jsonl.review_markdown",
      "memory.jsonl.health",
      "memory.jsonl.audit_snapshot",
      "memory.jsonl.retrieval",
      "memory.jsonl.curated_markdown"
    ]);
    expect(MEMORY_JSONL_OPERATION_NAMES).toEqual([
      MEMORY_JSONL_OPERATION_NAME,
      ...MEMORY_JSONL_READ_OPERATION_NAMES
    ]);
  });
});
