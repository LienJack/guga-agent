import type {
  HostErrorPayload,
  HostEvent,
  RunResource,
  RunStatus,
  SessionResource
} from "@guga-agent/host-protocol";

export class InMemoryRunStore {
  private readonly sessions = new Map<string, SessionResource>();
  private readonly runs = new Map<string, RunResource>();
  private readonly events = new Map<string, HostEvent[]>();

  putSession(session: SessionResource): void {
    this.sessions.set(session.id, session);
  }

  getSession(sessionId: string): SessionResource | undefined {
    return this.sessions.get(sessionId);
  }

  listSessions(): SessionResource[] {
    return [...this.sessions.values()];
  }

  putRun(run: RunResource): void {
    this.runs.set(run.id, run);
    this.events.set(run.id, run.events ?? []);
  }

  getRun(runId: string): RunResource | undefined {
    const run = this.runs.get(runId);
    if (!run) {
      return undefined;
    }
    return {
      ...run,
      events: this.listEvents(runId)
    };
  }

  appendEvents(runId: string, events: HostEvent[]): void {
    if (events.length === 0) {
      return;
    }
    const runEvents = this.events.get(runId) ?? [];
    runEvents.push(...events);
    this.events.set(runId, runEvents);
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }
    const last = runEvents[runEvents.length - 1];
    this.runs.set(runId, {
      ...run,
      lastSeq: last?.seq ?? run.lastSeq,
      updatedAt: last?.occurredAt ?? run.updatedAt
    });
  }

  updateRun(runId: string, patch: {
    status?: RunStatus;
    finalAnswer?: string;
    error?: HostErrorPayload;
    updatedAt: string;
  }): void {
    const run = this.runs.get(runId);
    if (!run) {
      return;
    }
    this.runs.set(runId, {
      ...run,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.finalAnswer !== undefined ? { finalAnswer: patch.finalAnswer } : {}),
      ...(patch.error ? { error: patch.error } : {}),
      updatedAt: patch.updatedAt
    });
  }

  listEvents(runId: string): HostEvent[] {
    return [...(this.events.get(runId) ?? [])];
  }

  listRuns(): RunResource[] {
    return [...this.runs.values()].map((run) => this.getRun(run.id) ?? run);
  }

  listAllEvents(): HostEvent[] {
    return [...this.events.values()].flat();
  }
}
