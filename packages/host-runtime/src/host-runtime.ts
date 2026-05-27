import {
  createAgentRuntime,
  type AgentRuntime,
  type AgentRuntimeOptions,
  type CapabilityDescriptor
} from "@guga-agent/core";
import {
  createHostEventSequencer,
  type CapabilityResource,
  type HostEvent,
  type RunResource,
  type SessionResource
} from "@guga-agent/host-protocol";
import { projectAgentEvent } from "./event-projector";
import { InMemoryRunStore } from "./in-memory-run-store";

export type HostRuntimeOptions = {
  runtime?: AgentRuntime;
  runtimeOptions?: AgentRuntimeOptions;
  now?: () => Date;
  idFactory?: () => string;
};

export type StartRunOptions = {
  sessionId: string;
  input: string;
  providerId?: string;
  modelId?: string;
  maxTurns?: number;
};

export class HostRuntime {
  private readonly runtime: AgentRuntime;
  private readonly ownsRuntime: boolean;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly store = new InMemoryRunStore();

  constructor(options: HostRuntimeOptions = {}) {
    this.runtime = options.runtime ?? createAgentRuntime(options.runtimeOptions ?? {});
    this.ownsRuntime = !options.runtime;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  createSession(options: { title?: string } = {}): SessionResource {
    const timestamp = this.now().toISOString();
    const session: SessionResource = {
      id: `session-${this.idFactory()}`,
      ...(options.title ? { title: options.title } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
      activeBranchId: "main"
    };
    this.store.putSession(session);
    return session;
  }

  getSession(sessionId: string): SessionResource | undefined {
    return this.store.getSession(sessionId);
  }

  listSessions(): SessionResource[] {
    return this.store.listSessions();
  }

  async startRun(options: StartRunOptions): Promise<RunResource> {
    const session = this.requireSession(options.sessionId);
    const timestamp = this.now().toISOString();
    const runId = `run-${this.idFactory()}`;
    const run: RunResource = {
      id: runId,
      sessionId: session.id,
      status: "running",
      input: options.input,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSeq: 0,
      events: []
    };
    this.store.putRun(run);

    const sequencer = createHostEventSequencer({ now: this.now });
    const unsubscribe = this.runtime.onEvent((event) => {
      const hostEvents = projectAgentEvent(event, { sessionId: session.id, runId, sequencer });
      this.store.appendEvents(runId, hostEvents);
      this.applyEventEffects(runId, hostEvents);
    });

    const result = await this.runtime.run({
      input: options.input,
      runId,
      session: { sessionId: session.id, branchId: session.activeBranchId ?? "main" },
      ...(options.providerId ? { providerId: options.providerId } : {}),
      ...(options.modelId ? { modelId: options.modelId } : {}),
      ...(options.maxTurns !== undefined ? { maxTurns: options.maxTurns } : {})
    });
    unsubscribe();

    const terminalEvent = result.ok
      ? sequencer.next({
          type: "run.completed",
          sessionId: session.id,
          runId,
          finalAnswer: result.finalAnswer
        })
      : sequencer.next({
          type: "run.failed",
          sessionId: session.id,
          runId,
          error: result.error
        });
    this.store.appendEvents(runId, [terminalEvent]);
    this.applyEventEffects(runId, [terminalEvent]);

    return this.store.getRun(runId) ?? run;
  }

  getRun(runId: string): RunResource | undefined {
    return this.store.getRun(runId);
  }

  listRunEvents(runId: string): HostEvent[] {
    return this.store.listEvents(runId);
  }

  listCapabilities(): CapabilityResource[] {
    return (this.runtime.listCapabilityDescriptors?.() ?? []).map(capabilityResourceFromDescriptor);
  }

  async dispose(): Promise<void> {
    if (this.ownsRuntime) {
      await this.runtime.dispose();
    }
  }

  private requireSession(sessionId: string): SessionResource {
    const session = this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return session;
  }

  private applyEventEffects(runId: string, events: HostEvent[]): void {
    for (const event of events) {
      if (event.type === "run.completed") {
        this.store.updateRun(runId, {
          status: "completed",
          ...(event.finalAnswer !== undefined ? { finalAnswer: event.finalAnswer } : {}),
          updatedAt: event.occurredAt
        });
      } else if (event.type === "run.failed") {
        this.store.updateRun(runId, {
          status: "failed",
          error: event.error,
          updatedAt: event.occurredAt
        });
      } else if (event.type === "permission.requested") {
        this.store.updateRun(runId, {
          status: "waiting-for-permission",
          updatedAt: event.occurredAt
        });
      } else if (event.type === "permission.resolved") {
        this.store.updateRun(runId, {
          status: "running",
          updatedAt: event.occurredAt
        });
      }
    }
  }
}

export function createHostRuntime(options: HostRuntimeOptions = {}): HostRuntime {
  return new HostRuntime(options);
}

function capabilityResourceFromDescriptor(descriptor: CapabilityDescriptor): CapabilityResource {
  return {
    type: descriptor.type,
    name: descriptor.name,
    source: descriptor.source,
    status: descriptor.status,
    ...(descriptor.namespace ? { namespace: descriptor.namespace } : {}),
    ...(descriptor.ownerPluginId ? { ownerPluginId: descriptor.ownerPluginId } : {}),
    ...(descriptor.reason ? { reason: descriptor.reason } : {})
  };
}
