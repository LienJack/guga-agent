import { describe, expect, it } from "vitest";
import { HOST_PROTOCOL_FEATURES, type OperationalStatusResource } from "./index";

describe("host protocol resources", () => {
  it("exposes platform surfaces as serializable operational status facts", () => {
    const status: OperationalStatusResource = {
      updatedAt: "2026-06-10T00:00:00.000Z",
      capabilities: [{
        type: "tool",
        name: "shell",
        source: "host",
        status: "registered",
        trust: {
          level: "first-party",
          scopes: [{ kind: "filesystem", access: "write", value: "." }]
        }
      }],
      platform: {
        surfaces: [{
          kind: "tool",
          name: "Tools",
          status: "available",
          source: "runtime",
          capabilityNames: ["shell"],
          actions: ["inspect"],
          trust: {
            level: "first-party",
            scopes: [{ kind: "filesystem", access: "write", value: "." }]
          }
        }, {
          kind: "compact",
          name: "Compaction",
          status: "unavailable",
          source: "host",
          reason: "Host compaction control is not implemented yet",
          actions: ["inspect"]
        }],
        memory: {
          state: "blocked",
          source: "policy",
          reason: "Policy did not allow injection",
          capabilityNames: ["memory.jsonl.retrieve"],
          policy: {
            autoInject: false,
            autoWrite: false,
            reason: "Manual injection only"
          }
        },
        agents: {
          state: "available",
          source: "plugin",
          capabilityNames: ["delegate_task"],
          coordinatorReady: true
        },
        compact: {
          state: "unavailable",
          source: "host",
          reason: "Not implemented",
          allowedActions: []
        }
      },
      health: [],
      audit: [],
      metrics: {
        updatedAt: "2026-06-10T00:00:00.000Z",
        counters: {}
      },
      diagnostics: []
    };

    expect(HOST_PROTOCOL_FEATURES).toContain("platform-surfaces");
    expect(JSON.parse(JSON.stringify(status))).toEqual(status);
  });
});
