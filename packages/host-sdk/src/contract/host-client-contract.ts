import type { HostProtocolFeature } from "@guga-agent/host-protocol";
import type { HostClient } from "../client";

export type HostClientContractHarness = {
  client: HostClient;
  createRunningRun(): Promise<{ runId: string }>;
  cleanup?(): Promise<void>;
};

export async function expectProtocolDiscoveryContract(harness: HostClientContractHarness): Promise<void> {
  const info = await harness.client.assertCompatibleProtocol();
  if (info.version !== "1") {
    throw new Error(`Expected host protocol version 1, received ${info.version}`);
  }
  const requiredFeatures: HostProtocolFeature[] = ["run-input-queue", "run-abort", "permissions"];
  for (const feature of requiredFeatures) {
    if (!info.features.includes(feature)) {
      throw new Error(`Expected host protocol feature ${feature}`);
    }
  }
}

export async function expectQueueAndAbortContract(harness: HostClientContractHarness): Promise<void> {
  const { runId } = await harness.createRunningRun();
  const queued = await harness.client.sendRunInput(runId, {
    mode: "steer",
    text: "contract steer"
  });
  if (!queued.queuedInputs?.some((input) => input.mode === "steer" && input.status === "deferred")) {
    throw new Error("Expected steer input to remain deferred in the queue");
  }
  const aborted = await harness.client.abortRun(runId);
  if (aborted.status !== "cancelled") {
    throw new Error(`Expected abort to cancel the run, received ${aborted.status}`);
  }
}
