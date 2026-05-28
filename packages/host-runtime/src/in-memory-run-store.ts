import type {
  HostErrorPayload,
  HostEvent,
  InteractionResource,
  PermissionRequestResource,
  QueuedRunInputResource,
  RunResource,
  RunStatus,
  SessionBranchResource,
  SessionResource
} from "@guga-agent/host-protocol";

export class InMemoryRunStore {
  private readonly sessions = new Map<string, SessionResource>();
  private readonly branches = new Map<string, SessionBranchResource[]>();
  private readonly runs = new Map<string, RunResource>();
  private readonly events = new Map<string, HostEvent[]>();
  private readonly interactions = new Map<string, InteractionResource>();
  private readonly permissions = new Map<string, PermissionRequestResource>();

  putSession(session: SessionResource): void {
    this.sessions.set(session.id, session);
    if (session.branches) {
      this.branches.set(session.id, session.branches);
    }
  }

  getSession(sessionId: string): SessionResource | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    return {
      ...session,
      branches: this.listBranches(sessionId)
    };
  }

  listSessions(): SessionResource[] {
    return [...this.sessions.values()].map((session) => this.getSession(session.id) ?? session);
  }

  putBranch(branch: SessionBranchResource): void {
    const branches = this.branches.get(branch.sessionId) ?? [];
    const existingIndex = branches.findIndex((candidate) => candidate.id === branch.id);
    const nextBranches = existingIndex === -1
      ? [...branches, branch]
      : branches.map((candidate, index) => index === existingIndex ? branch : candidate);
    this.branches.set(branch.sessionId, nextBranches);
  }

  listBranches(sessionId: string): SessionBranchResource[] {
    return [...(this.branches.get(sessionId) ?? [])];
  }

  updateSession(sessionId: string, patch: {
    activeBranchId?: string;
    title?: string;
    updatedAt: string;
  }): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.sessions.set(sessionId, {
      ...session,
      ...(patch.activeBranchId ? { activeBranchId: patch.activeBranchId } : {}),
      ...(patch.title ? { title: patch.title } : {}),
      updatedAt: patch.updatedAt
    });
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
    queuedInputs?: QueuedRunInputResource[];
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
      ...(patch.queuedInputs !== undefined ? { queuedInputs: patch.queuedInputs } : {}),
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

  putInteraction(interaction: InteractionResource): void {
    this.interactions.set(interaction.id, interaction);
  }

  getInteraction(interactionId: string): InteractionResource | undefined {
    return this.interactions.get(interactionId);
  }

  updateInteraction(interactionId: string, patch: {
    status?: InteractionResource["status"];
    response?: unknown;
    resolvedAt?: string;
  }): void {
    const interaction = this.interactions.get(interactionId);
    if (!interaction) {
      return;
    }
    this.interactions.set(interactionId, {
      ...interaction,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.response !== undefined ? { response: patch.response } : {}),
      ...(patch.resolvedAt ? { resolvedAt: patch.resolvedAt } : {})
    });
  }

  listInteractionsByRun(runId: string): InteractionResource[] {
    return [...this.interactions.values()].filter((interaction) => interaction.runId === runId);
  }

  putPermission(permission: PermissionRequestResource): void {
    this.permissions.set(permission.id, permission);
  }

  getPermission(permissionId: string): PermissionRequestResource | undefined {
    return this.permissions.get(permissionId);
  }

  listPermissionsByRun(runId: string): PermissionRequestResource[] {
    return [...this.permissions.values()].filter((permission) => permission.runId === runId);
  }

  updatePermission(permissionId: string, patch: {
    status?: PermissionRequestResource["status"];
    reason?: string;
    resolvedAt?: string;
  }): void {
    const permission = this.permissions.get(permissionId);
    if (!permission) {
      return;
    }
    this.permissions.set(permissionId, {
      ...permission,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      ...(patch.resolvedAt ? { resolvedAt: patch.resolvedAt } : {})
    });
  }
}
