export type FocusTargetKind =
  | "help"
  | "status"
  | "prompt"
  | "slash"
  | "selector"
  | "interaction"
  | "permission";

export interface FocusTarget {
  readonly kind: FocusTargetKind;
  readonly id?: string;
  readonly capturesInput?: boolean;
}

export interface FocusState {
  readonly stack: readonly FocusTarget[];
}

export type FocusAction = "enter" | "escape" | "text";

export function createFocusState(targets: readonly FocusTarget[] = [{ kind: "prompt" }]): FocusState {
  return { stack: targets };
}

export function pushFocusTarget(state: FocusState, target: FocusTarget): FocusState {
  const key = focusTargetKey(target);
  return {
    stack: [...state.stack.filter((candidate) => focusTargetKey(candidate) !== key), target]
  };
}

export function removeFocusTarget(state: FocusState, target: FocusTarget): FocusState {
  const key = focusTargetKey(target);
  return {
    stack: state.stack.filter((candidate) => focusTargetKey(candidate) !== key)
  };
}

export function resolveFocusOwner(state: FocusState, action: FocusAction): FocusTarget | undefined {
  const candidates = state.stack.filter((target) => capturesAction(target, action));
  let owner: FocusTarget | undefined;
  for (const candidate of candidates) {
    if (!owner || focusTargetPriority(candidate) >= focusTargetPriority(owner)) {
      owner = candidate;
    }
  }
  return owner;
}

export type DismissFocusResult =
  | { readonly state: FocusState; readonly dismissed?: never }
  | { readonly state: FocusState; readonly dismissed: FocusTarget };

export function dismissTopFocusTarget(state: FocusState): DismissFocusResult {
  const dismissed = resolveFocusOwner(state, "escape");
  if (!dismissed || dismissed.kind === "prompt") {
    return { state };
  }

  return { state: removeFocusTarget(state, dismissed), dismissed };
}

export function focusTargetPriority(target: FocusTarget): number {
  switch (target.kind) {
    case "permission":
      return 60;
    case "interaction":
      return 50;
    case "selector":
      return 40;
    case "slash":
      return 30;
    case "prompt":
      return 20;
    case "help":
    case "status":
      return target.capturesInput === true ? 25 : 10;
  }
}

function capturesAction(target: FocusTarget, action: FocusAction): boolean {
  if (target.kind !== "help" && target.kind !== "status") {
    return true;
  }

  if (action === "escape") {
    return target.capturesInput === true;
  }

  return target.capturesInput === true;
}

function focusTargetKey(target: FocusTarget): string {
  return `${target.kind}:${target.id ?? ""}`;
}
