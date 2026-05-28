import {
  WORKBENCH_SLASH_COMMAND_METADATA,
  type WorkbenchSlashCommandMetadata
} from "../workbench/commands";
import type { KeyIntent } from "../tui/keys";

export interface SlashPaletteState {
  readonly isOpen: boolean;
  readonly commands: readonly WorkbenchSlashCommandMetadata[];
  readonly query: string;
  readonly highlightedIndex: number;
}

export type SlashPaletteEffect =
  | { readonly type: "close" }
  | { readonly type: "select"; readonly command: WorkbenchSlashCommandMetadata };

export interface SlashPaletteResult {
  readonly state: SlashPaletteState;
  readonly effect?: SlashPaletteEffect;
}

export function createSlashPaletteState(options: {
  readonly commands?: readonly WorkbenchSlashCommandMetadata[];
  readonly query?: string;
  readonly isOpen?: boolean;
} = {}): SlashPaletteState {
  return {
    isOpen: options.isOpen ?? true,
    commands: options.commands ?? WORKBENCH_SLASH_COMMAND_METADATA,
    query: normalizeSlashQuery(options.query ?? ""),
    highlightedIndex: 0
  };
}

export function updateSlashPaletteQuery(state: SlashPaletteState, query: string): SlashPaletteState {
  return {
    ...state,
    query: normalizeSlashQuery(query),
    highlightedIndex: 0
  };
}

export function moveSlashPaletteHighlight(state: SlashPaletteState, direction: -1 | 1): SlashPaletteState {
  const items = getSlashPaletteItems(state);
  if (items.length === 0) {
    return { ...state, highlightedIndex: 0 };
  }

  return {
    ...state,
    highlightedIndex: wrapIndex(state.highlightedIndex + direction, items.length)
  };
}

export function getSlashPaletteItems(state: SlashPaletteState): readonly WorkbenchSlashCommandMetadata[] {
  const query = normalizeSlashQuery(state.query);
  if (query.length === 0) {
    return state.commands;
  }

  return state.commands.filter((command) => matchesCommand(command, query));
}

export function getHighlightedSlashCommand(state: SlashPaletteState): WorkbenchSlashCommandMetadata | undefined {
  return getSlashPaletteItems(state)[state.highlightedIndex];
}

export function commandNeedsSelector(command: WorkbenchSlashCommandMetadata): boolean {
  return command.selector !== undefined;
}

export function applySlashPaletteIntent(state: SlashPaletteState, intent: KeyIntent): SlashPaletteResult {
  switch (intent.type) {
    case "text":
      return { state: updateSlashPaletteQuery(state, `${state.query}${intent.value}`) };
    case "paste":
      return { state: updateSlashPaletteQuery(state, `${state.query}${intent.value}`) };
    case "backspace":
      return { state: updateSlashPaletteQuery(state, removeLastCharacter(state.query)) };
    case "delete":
      return { state };
    case "history-previous":
      return { state: moveSlashPaletteHighlight(state, -1) };
    case "history-next":
      return { state: moveSlashPaletteHighlight(state, 1) };
    case "abort":
      return { state: { ...state, isOpen: false }, effect: { type: "close" } };
    case "submit": {
      const command = getHighlightedSlashCommand(state);
      return command === undefined ? { state } : { state, effect: { type: "select", command } };
    }
    case "left":
    case "right":
    case "newline":
    case "noop":
      return { state };
  }
}

function matchesCommand(command: WorkbenchSlashCommandMetadata, query: string): boolean {
  const haystack = [
    command.command,
    command.command.slice(1),
    command.label,
    command.help,
    command.usage,
    ...(command.aliases ?? [])
  ].map((value) => value.toLowerCase());
  return haystack.some((value) => value.includes(query));
}

function normalizeSlashQuery(query: string): string {
  return query.trimStart().replace(/^\//, "").toLowerCase();
}

function removeLastCharacter(value: string): string {
  const characters = Array.from(value);
  characters.pop();
  return characters.join("");
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
