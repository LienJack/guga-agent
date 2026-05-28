import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import { createWorkbenchViewModel } from "../workbench/views";
import { mapKeypressToIntent, type KeyIntent, type TerminalKeypress } from "../tui/keys";
import { StatusBar } from "./components/status-bar";
import { WelcomePanel } from "./components/welcome-panel";
import { Transcript } from "./components/transcript";
import { PromptEditor } from "./components/prompt-editor";
import { SlashPalette } from "./components/slash-palette";
import { SelectorOverlay } from "./components/selector-overlay";
import type { WorkbenchController } from "./controller";
import {
  applyPromptIntent,
  createPromptState,
  getPromptText,
  replacePromptText,
  setPromptInputTarget,
  type PromptEffect,
  type PromptState
} from "./prompt-state";
import {
  createFocusState,
  pushFocusTarget,
  resolveFocusOwner,
  type FocusAction,
  type FocusState,
  type FocusTarget
} from "./focus-state";
import {
  applySlashPaletteIntent,
  commandNeedsSelector,
  createSlashPaletteState,
  getHighlightedSlashCommand,
  updateSlashPaletteQuery,
  type SlashPaletteState
} from "./slash-state";
import {
  applySelectorIntent,
  type SelectorState
} from "./selector-state";
import { parseInteractionResponse } from "./controller";

export function InkWorkbenchApp({ controller }: { readonly controller: WorkbenchController }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [state, setState] = useState(controller.state);
  const [prompt, setPrompt] = useState<PromptState>(() => createPromptState());
  const [slash, setSlash] = useState<SlashPaletteState | undefined>();
  const [selector, setSelector] = useState<SelectorState | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const view = useMemo(() => createWorkbenchViewModel(state), [state]);
  const columns = typeof stdout.columns === "number" ? stdout.columns : 100;
  const colorMode = process.env.NO_COLOR === undefined ? "color" : "mono";
  const focus = useMemo(() => createAppFocusState({
    slashOpen: slash !== undefined,
    selectorOpen: selector !== undefined,
    ...(state.pendingPermission ? { pendingPermissionId: state.pendingPermission.requestId } : {}),
    ...(state.pendingInteraction ? { pendingInteractionId: state.pendingInteraction.requestId } : {})
  }), [slash, selector, state.pendingPermission, state.pendingInteraction]);

  useEffect(() => controller.subscribe((next) => {
    setState(next);
    setPrompt((current) => {
      if (next.pendingPermission) {
        return retargetPrompt(current, { kind: "permission-response", requestId: next.pendingPermission.requestId });
      }
      if (next.pendingInteraction) {
        return retargetPrompt(current, { kind: "interaction-response", requestId: next.pendingInteraction.requestId });
      }
      if (next.activeRunId && next.runStatus === "running") {
        return retargetPrompt(current, { kind: "run-input", mode: controller.inputMode });
      }
      return retargetPrompt(current, { kind: "prompt" });
    });
  }), [controller]);

  useEffect(() => () => controller.dispose(), [controller]);

  useInput((input, key) => {
    const intent = inkInputToKeyIntent(input, key);
    void handleIntent(intent);
  });

  async function handleIntent(intent: KeyIntent): Promise<void> {
    const owner = resolveFocusOwner(focus, focusActionForIntent(intent));

    if (owner?.kind === "permission" || owner?.kind === "interaction") {
      await handlePromptIntent(intent, owner);
      return;
    }

    if (owner?.kind === "selector" && selector) {
      const result = applySelectorIntent(selector, intent);
      setSelector(result.state);
      if (result.effect?.type === "close") {
        setSelector(undefined);
      } else if (result.effect?.type === "select" && result.effect.commandText) {
        setSelector(undefined);
        await submitText(result.effect.commandText);
      }
      return;
    }

    if (owner?.kind === "slash" && slash) {
      if (intent.type === "complete") {
        completeSlashFromPrompt();
        return;
      }
      if (isPromptEditingIntent(intent)) {
        await handlePromptIntent(intent, { kind: "prompt" });
        return;
      }
      if (intent.type === "submit") {
        await submitSlashFromPrompt();
        return;
      }
      const result = applySlashPaletteIntent(slash, intent);
      setSlash(result.state);
      if (result.effect?.type === "close") {
        setSlash(undefined);
      } else if (result.effect?.type === "select") {
        const command = result.effect.command;
        if (commandNeedsSelector(command)) {
          setSlash(undefined);
          setPrompt(createPromptState());
          setSelector(await controller.selectorForCommand(command.command));
        } else {
          setSlash(undefined);
          setPrompt(createPromptState());
          await submitText(command.command);
        }
      }
      return;
    }

    await handlePromptIntent(intent, owner);
  }

  async function handlePromptIntent(intent: KeyIntent, owner: FocusTarget | undefined): Promise<void> {
    if (intent.type === "abort" && (owner?.kind === "permission" || owner?.kind === "interaction")) {
      setNotice(owner.kind === "permission" ? "Permission response required." : "Interaction response required.");
      return;
    }
    if (intent.type === "submit" && state.disconnected && getPromptText(prompt).trim() !== "/reload") {
      setNotice(state.disconnected.lockHint);
      return;
    }

    const result = applyPromptIntent(prompt, intent, { slashPaletteOpen: slash !== undefined });
    setPrompt(result.state);
    if (!result.effect) {
      return;
    }
    await handlePromptEffect(result.effect);
  }

  async function handlePromptEffect(effect: PromptEffect): Promise<void> {
    switch (effect.type) {
      case "open-slash":
        setSlash((current) => updateSlashPaletteQuery(current ?? createSlashPaletteState(), effect.query));
        return;
      case "close-slash":
        setSlash(undefined);
        return;
      case "abort":
        await applyControllerResponse(controller.abortActiveRun());
        return;
      case "submit-prompt":
        setSlash(undefined);
        await applyControllerResponse(controller.startPromptRun(effect.text));
        return;
      case "submit-run-input":
        await applyControllerResponse(controller.submitRunInput(effect.mode, effect.text));
        return;
      case "submit-permission-response":
        await applyControllerResponse(controller.respondPermission(effect.requestId, effect.text));
        return;
      case "submit-interaction-response":
        await applyControllerResponse(controller.respondInteraction(effect.requestId, parseInteractionResponse(effect.text)));
        return;
      case "submit-slash":
        setSlash(undefined);
        await applyControllerResponse(controller.executeSlash(effect.text));
        return;
    }
  }

  async function submitSlashFromPrompt(): Promise<void> {
    const text = getPromptText(prompt);
    const commandText = text.trim();
    const query = commandText.replace(/^\//, "");
    const hasArguments = /\s/.test(query.trimEnd());
    const highlighted = slash ? getHighlightedSlashCommand(slash) : undefined;
    if (!hasArguments && highlighted) {
      setSlash(undefined);
      setPrompt(createPromptState());
      if (commandNeedsSelector(highlighted)) {
        setSelector(await controller.selectorForCommand(highlighted.command));
      } else {
        await submitText(highlighted.command);
      }
      return;
    }

    const result = applyPromptIntent(prompt, { type: "submit" }, { slashPaletteOpen: true });
    setPrompt(result.state);
    if (result.effect) {
      await handlePromptEffect(result.effect);
    }
  }

  function completeSlashFromPrompt(): void {
    const highlighted = slash ? getHighlightedSlashCommand(slash) : undefined;
    if (!highlighted) {
      return;
    }
    setSlash(undefined);
    setPrompt((current) => replacePromptText(current, `${highlighted.command} `));
  }

  async function submitText(text: string): Promise<void> {
    await applyControllerResponse(controller.submitText(text));
  }

  async function applyControllerResponse(responsePromise: Promise<Awaited<ReturnType<WorkbenchController["submitText"]>>>): Promise<void> {
    const response = await responsePromise;
    setNotice(response.ok ? response.message : response.error);
    if (response.ok && response.message === "exit") {
      exit();
    }
  }

  return (
    <Box flexDirection="column">
      <Text bold>Guga Ink workbench</Text>
      <Text>
        {view.startup.sessionLabel} | model {view.startup.modelLabel} | profile {view.startup.profileLabel}
      </Text>
      <Text dimColor>{view.startup.configSourceLabel}</Text>
      <StatusBar status={view.statusBar} />
      <WelcomePanel welcome={view.welcome} columns={columns} colorMode={colorMode} />
      <Transcript blocks={view.transcript} />
      {notice ? <Text dimColor>{notice}</Text> : null}
      {view.pendingPermission ? <Text>Permission: type allow or deny</Text> : null}
      {view.pendingInteraction ? <Text>Interaction: enter response</Text> : null}
      {selector ? <SelectorOverlay state={selector} /> : null}
      {slash ? <SlashPalette state={slash} /> : null}
      <PromptEditor prompt={prompt} inputMode={controller.inputMode} locked={view.statusBar.inputLocked} />
    </Box>
  );
}

function createAppFocusState(options: {
  readonly slashOpen: boolean;
  readonly selectorOpen: boolean;
  readonly pendingPermissionId?: string;
  readonly pendingInteractionId?: string;
}): FocusState {
  let focus = createFocusState();
  if (options.slashOpen) {
    focus = pushFocusTarget(focus, { kind: "slash" });
  }
  if (options.selectorOpen) {
    focus = pushFocusTarget(focus, { kind: "selector" });
  }
  if (options.pendingInteractionId) {
    focus = pushFocusTarget(focus, { kind: "interaction", id: options.pendingInteractionId });
  }
  if (options.pendingPermissionId) {
    focus = pushFocusTarget(focus, { kind: "permission", id: options.pendingPermissionId });
  }
  return focus;
}

function focusActionForIntent(intent: KeyIntent): FocusAction {
  if (intent.type === "submit") {
    return "enter";
  }
  if (intent.type === "abort") {
    return "escape";
  }
  return "text";
}

function isPromptEditingIntent(intent: KeyIntent): boolean {
  return intent.type === "text"
    || intent.type === "paste"
    || intent.type === "backspace"
    || intent.type === "delete"
    || intent.type === "left"
    || intent.type === "right"
    || intent.type === "newline";
}

function retargetPrompt(state: PromptState, target: PromptState["target"]): PromptState {
  if (samePromptTarget(state.target, target)) {
    return state;
  }
  if (target.kind === "permission-response" || target.kind === "interaction-response") {
    return {
      ...createPromptState({ target, history: state.editor.history }),
      preservedEditor: state.preservedEditor ?? state.editor
    };
  }
  if ((state.target.kind === "permission-response" || state.target.kind === "interaction-response") && state.preservedEditor) {
    return setPromptInputTarget({
      ...state,
      editor: state.preservedEditor
    }, target);
  }
  return setPromptInputTarget(state, target);
}

function samePromptTarget(left: PromptState["target"], right: PromptState["target"]): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "permission-response":
    case "interaction-response":
      return left.requestId === (right as typeof left).requestId;
    case "run-input":
      return left.mode === (right as typeof left).mode;
    case "prompt":
      return true;
  }
}

function inkInputToKeyIntent(input: string, key: {
  readonly ctrl?: boolean;
  readonly meta?: boolean;
  readonly shift?: boolean;
  readonly return?: boolean;
  readonly escape?: boolean;
  readonly backspace?: boolean;
  readonly delete?: boolean;
  readonly leftArrow?: boolean;
  readonly rightArrow?: boolean;
  readonly upArrow?: boolean;
  readonly downArrow?: boolean;
  readonly tab?: boolean;
}): KeyIntent {
  const name = key.return ? "return"
    : key.escape ? "escape"
      : key.backspace ? "backspace"
        : key.delete ? "delete"
          : key.leftArrow ? "left"
            : key.rightArrow ? "right"
              : key.upArrow ? "up"
                : key.downArrow ? "down"
                  : key.tab ? "tab"
                  : input === "\t" ? "tab"
                  : undefined;
  const mapped: TerminalKeypress = {
    ctrl: key.ctrl === true,
    meta: key.meta === true,
    shift: key.shift === true,
    ...(input.length > 0 ? { sequence: input } : {}),
    ...(name ? { name } : {})
  };
  return mapKeypressToIntent(mapped);
}
