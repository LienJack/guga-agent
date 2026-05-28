export const TUI_RUNTIME_DECISION = "minimal-fallback-renderer" as const;

export type TuiRuntimeDecision = typeof TUI_RUNTIME_DECISION;

export interface TerminalFrame {
  readonly title?: string;
  readonly lines: readonly string[];
  readonly status?: string;
}

export interface TerminalRenderOptions {
  readonly columns?: number;
}

export interface TerminalRenderResult {
  readonly output: string;
  readonly lineCount: number;
}

export interface TerminalAdapter {
  readonly runtime: TuiRuntimeDecision;
  readonly isInteractive: boolean;
  render(frame: TerminalFrame): TerminalRenderResult;
  nonTtyMessage(commandName?: string): string;
}

export function createFallbackTerminalAdapter(options: {
  readonly isTTY?: boolean;
  readonly columns?: number;
} = {}): TerminalAdapter {
  const columns = options.columns;

  return {
    runtime: TUI_RUNTIME_DECISION,
    isInteractive: options.isTTY === true,
    render(frame) {
      return renderTerminalFrame(frame, columns === undefined ? {} : { columns });
    },
    nonTtyMessage(commandName = "guga") {
      return `${commandName} interactive workbench requires a TTY. Use ${commandName} run "<prompt>" or ${commandName} -p "<prompt>" for headless runs.`;
    }
  };
}

export function renderTerminalFrame(
  frame: TerminalFrame,
  options: TerminalRenderOptions = {}
): TerminalRenderResult {
  const width = normalizeColumns(options.columns);
  const lines: string[] = [];

  if (frame.title && frame.title.trim() !== "") {
    lines.push(trimToWidth(frame.title.trim(), width));
  }

  for (const line of frame.lines) {
    lines.push(trimToWidth(line.replaceAll("\r", ""), width));
  }

  if (frame.status && frame.status.trim() !== "") {
    lines.push(trimToWidth(frame.status.trim(), width));
  }

  return {
    output: lines.length === 0 ? "" : `${lines.join("\n")}\n`,
    lineCount: lines.length
  };
}

function normalizeColumns(columns: number | undefined): number {
  if (!Number.isFinite(columns) || columns === undefined) {
    return 80;
  }

  return Math.max(20, Math.floor(columns));
}

function trimToWidth(value: string, width: number): string {
  if (value.length <= width) {
    return value;
  }

  if (width <= 1) {
    return value.slice(0, width);
  }

  return `${value.slice(0, width - 3)}...`;
}
