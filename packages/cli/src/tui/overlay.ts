export type OverlayKind = "help" | "permission" | "select" | "status";

export interface OverlayState {
  readonly kind: OverlayKind;
  readonly title: string;
  readonly body: readonly string[];
  readonly actions?: readonly string[];
}

export function renderOverlayLines(overlay: OverlayState, width = 80): string[] {
  const columns = Math.max(20, Math.floor(width));
  const contentWidth = columns - 4;
  const lines = [
    `+${"-".repeat(columns - 2)}+`,
    frameLine(overlay.title, contentWidth)
  ];

  for (const line of overlay.body) {
    lines.push(frameLine(line, contentWidth));
  }

  if (overlay.actions && overlay.actions.length > 0) {
    lines.push(frameLine("", contentWidth));
    lines.push(frameLine(overlay.actions.join("  "), contentWidth));
  }

  lines.push(`+${"-".repeat(columns - 2)}+`);
  return lines;
}

function frameLine(value: string, width: number): string {
  const clipped = value.length > width ? `${value.slice(0, width - 3)}...` : value;
  return `| ${clipped.padEnd(width, " ")} |`;
}
