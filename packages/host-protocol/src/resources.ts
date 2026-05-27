import type { HostEvent } from "./events";

export type SessionResource = {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  activeBranchId?: string;
};

export type RunStatus = "queued" | "running" | "waiting-for-permission" | "completed" | "failed" | "cancelled";

export type RunResource = {
  id: string;
  sessionId: string;
  status: RunStatus;
  input: string;
  createdAt: string;
  updatedAt: string;
  lastSeq: number;
  finalAnswer?: string;
  error?: HostErrorPayload;
  events?: HostEvent[];
};

export type HostErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export type PermissionStatus = "pending" | "allowed" | "denied" | "cancelled" | "expired";

export type PermissionRequestResource = {
  id: string;
  runId: string;
  sessionId: string;
  callId: string;
  toolName: string;
  status: PermissionStatus;
  input?: unknown;
  reason?: string;
  createdAt: string;
  resolvedAt?: string;
};

export type PermissionResolution = {
  decision: "allow" | "deny";
  remember?: "once" | "session" | "always";
  reason?: string;
  updatedInput?: unknown;
};

export type ArtifactResource = {
  id: string;
  runId: string;
  sessionId: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
  href?: string;
};

export type CapabilityResource = {
  type: string;
  name: string;
  source: string;
  status: string;
  namespace?: string;
  ownerPluginId?: string;
  reason?: string;
};
