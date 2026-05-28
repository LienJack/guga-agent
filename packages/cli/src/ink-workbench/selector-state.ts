import type { KeyIntent } from "../tui/keys";

export type SelectorSource = "model" | "profile" | "resume" | "custom";

export interface SelectorOption {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly detail?: string;
  readonly disabled?: boolean;
  readonly keywords?: readonly string[];
  readonly commandText?: string;
}

export interface SelectorState {
  readonly source: SelectorSource;
  readonly title: string;
  readonly query: string;
  readonly options: readonly SelectorOption[];
  readonly highlightedIndex: number;
}

export type SelectorEffect =
  | { readonly type: "close" }
  | { readonly type: "select"; readonly option: SelectorOption; readonly commandText?: string };

export interface SelectorResult {
  readonly state: SelectorState;
  readonly effect?: SelectorEffect;
}

export function createSelectorState(options: {
  readonly source: SelectorSource;
  readonly title: string;
  readonly options: readonly SelectorOption[];
  readonly query?: string;
}): SelectorState {
  const state = {
    source: options.source,
    title: options.title,
    options: options.options,
    query: options.query ?? "",
    highlightedIndex: 0
  };
  return ensureEnabledHighlight(state);
}

export function createCommandSelectorOptions(
  command: "/model" | "/profile" | "/resume",
  options: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly detail?: string;
    readonly disabled?: boolean;
    readonly keywords?: readonly string[];
  }>
): readonly SelectorOption[] {
  return options.map((option) => ({
    ...option,
    commandText: `${command} ${option.value}`.trim()
  }));
}

export function updateSelectorQuery(state: SelectorState, query: string): SelectorState {
  return ensureEnabledHighlight({
    ...state,
    query,
    highlightedIndex: 0
  });
}

export function moveSelectorHighlight(state: SelectorState, direction: -1 | 1): SelectorState {
  const visible = getVisibleSelectorOptions(state);
  if (visible.length === 0) {
    return { ...state, highlightedIndex: 0 };
  }

  const next = findNextEnabledIndex(visible, state.highlightedIndex, direction);
  return { ...state, highlightedIndex: next };
}

export function getVisibleSelectorOptions(state: SelectorState): readonly SelectorOption[] {
  const query = state.query.trim().toLowerCase();
  if (query.length === 0) {
    return state.options;
  }

  return state.options.filter((option) => matchesOption(option, query));
}

export function getHighlightedSelectorOption(state: SelectorState): SelectorOption | undefined {
  return getVisibleSelectorOptions(state)[state.highlightedIndex];
}

export function confirmSelectorOption(state: SelectorState): SelectorResult {
  const option = getHighlightedSelectorOption(state);
  if (option === undefined || option.disabled === true) {
    return { state };
  }

  return {
    state,
    effect: {
      type: "select",
      option,
      ...(option.commandText !== undefined ? { commandText: option.commandText } : {})
    }
  };
}

export function applySelectorIntent(state: SelectorState, intent: KeyIntent): SelectorResult {
  switch (intent.type) {
    case "text":
      return { state: updateSelectorQuery(state, `${state.query}${intent.value}`) };
    case "paste":
      return { state: updateSelectorQuery(state, `${state.query}${intent.value}`) };
    case "backspace":
      return { state: updateSelectorQuery(state, removeLastCharacter(state.query)) };
    case "delete":
      return { state };
    case "history-previous":
      return { state: moveSelectorHighlight(state, -1) };
    case "history-next":
      return { state: moveSelectorHighlight(state, 1) };
    case "abort":
      return { state, effect: { type: "close" } };
    case "submit":
      return confirmSelectorOption(state);
    case "left":
    case "right":
    case "newline":
    case "noop":
      return { state };
  }
}

function ensureEnabledHighlight(state: SelectorState): SelectorState {
  const visible = getVisibleSelectorOptions(state);
  if (visible.length === 0) {
    return { ...state, highlightedIndex: 0 };
  }
  if (visible[state.highlightedIndex]?.disabled !== true) {
    return state;
  }
  return { ...state, highlightedIndex: findNextEnabledIndex(visible, state.highlightedIndex, 1) };
}

function findNextEnabledIndex(options: readonly SelectorOption[], currentIndex: number, direction: -1 | 1): number {
  for (let step = 1; step <= options.length; step += 1) {
    const index = wrapIndex(currentIndex + step * direction, options.length);
    if (options[index]?.disabled !== true) {
      return index;
    }
  }
  return currentIndex;
}

function matchesOption(option: SelectorOption, query: string): boolean {
  return [
    option.id,
    option.label,
    option.value,
    option.detail ?? "",
    ...(option.keywords ?? [])
  ].some((value) => value.toLowerCase().includes(query));
}

function removeLastCharacter(value: string): string {
  const characters = Array.from(value);
  characters.pop();
  return characters.join("");
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
