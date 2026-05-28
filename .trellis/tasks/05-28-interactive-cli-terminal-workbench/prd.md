# brainstorm: productized coding-agent CLI workbench

## Goal

Make `@guga-agent/cli` feel like a productized coding-agent package in the spirit of Pi, Claude Code, OpenCode, and Blade Code: running bare `guga` should open an interactive terminal workbench with the bundled coding-agent capabilities already wired in, using configured LLM/model defaults, so the user can immediately ask the agent to inspect and modify code.

## What I already know

* The user does not want the primary CLI experience to be `guga run "..."` only.
* The desired primary entry is `guga` -> interactive terminal mode.
* The desired mental model is "install/use the coding-agent CLI package, type `guga`, start working", not "manually compose host protocol pieces".
* The terminal mode should use an already configured LLM.
* Users should be able to select/switch models.
* Model/provider configuration should come from a config file, not only per-command flags.
* The package should bundle first-party capabilities: coding profile, filesystem/shell/git-style tools, MCP integration path, skills/profiles, permissions, sessions, streaming output, and model config.
* Existing implementation already has `packages/cli`, `packages/host-protocol`, `packages/host-runtime`, `packages/host-sdk`, `packages/host-local-server`, and `packages/host-stdio`.
* Current committed CLI supports `guga run <prompt>` with `--mock`, `--debug-events`, `--ops`, `--profile`, `--provider`, and `--model`.
* Current committed host protocol has session/run/event stream/control/interaction/session tree/stdio adapter foundations.
* Current working tree has uncommitted exploratory edits in `packages/cli/src/commands/run.ts` and `packages/cli/src/config.ts`; these should be treated as scratch until this PRD is confirmed.

## Assumptions (temporary)

* MVP should start with a TUI-shaped workbench surface, even if the first version is intentionally small: transcript, multiline input, status/model line, slash commands, streaming run state, and permission/interaction prompts.
* A plain line REPL is likely too far from the user's desired product feel unless explicitly chosen as a speed trade-off.
* User selected `1+2`: combine TUI-shaped workbench first with product semantics first. This means the first implementation should not be a pure UI shell and should not be a pure config/session refactor; it must deliver both a recognizable terminal workbench and the final command/config/session semantics.
* Project config should be checked before user config.
* A config file can describe model aliases and provider settings.
* The shared host protocol should remain the canonical transport so the desktop app can reuse the same session/run/event/interaction semantics.

## Open Questions

* None for MVP scope. Remaining questions are implementation details to resolve during planning/code review.

## Requirements (evolving)

* `guga` enters interactive terminal mode by default.
* `guga run <prompt>` remains available for one-shot/headless usage.
* `guga -p "<prompt>"` or equivalent print/headless alias should be considered for Pi/Claude-style ergonomics.
* Interactive mode accepts normal text as agent tasks.
* Interactive mode supports slash commands for help, model listing, model switching, profile switching, status, clear/new/resume/fork, permissions, MCP/status, and exit.
* CLI reads model/provider configuration from a config file.
* CLI supports selecting a configured model by alias.
* CLI displays the current model/profile/session state at startup.
* CLI streams assistant output and host events while a run is active.
* CLI supports user input while a run is active: queue follow-up/steering, abort, and answer interaction/permission prompts.
* CLI does not require users to pass model/provider flags on every command.
* CLI should load a default coding-agent profile/capability bundle so users can ask it to edit code immediately.
* The first implementation must wire real code-agent tools end-to-end: filesystem, shell, git, skills/MCP when configured, and the code profile permission policy.
* CLI should expose a product-level help surface that explains commands, models, config path, and session controls.
* CLI continues to use the shared host protocol/SDK rather than owning a separate runtime path.
* The event/interaction protocol should be desktop-compatible: transcript events, tool events, queued input, permission/interaction request/response, run abort, session resume/fork/tree.

## Acceptance Criteria (evolving)

* [ ] `guga` starts interactive mode without requiring a subcommand.
* [ ] The startup screen clearly shows current project, profile, model, session, and useful slash commands.
* [ ] Interactive mode can run at least one task using `--mock`.
* [ ] Interactive mode can run at least one task using a configured real model.
* [ ] Interactive mode can perform a real code-agent task using the default code profile and first-party filesystem/git/shell tools.
* [ ] `.guga/config.json` is read when present.
* [ ] `~/.guga/config.json` is used when project config is absent.
* [ ] `GUGA_CONFIG` can override the config file path.
* [ ] `guga --list-models` or `/models` lists configured models.
* [ ] `/models` lists configured models.
* [ ] `/model <id>` selects a configured model.
* [ ] `/profile <id>` selects `default`, `code`, `deep-research`, or `review`.
* [ ] Queued input or a follow-up can be sent while a run is active.
* [ ] Escape/Ctrl-C style abort can stop the active run without corrupting the session.
* [ ] Permission/interaction prompts can be answered from the terminal and via the shared protocol.
* [ ] `/exit` exits cleanly.
* [ ] `guga run <prompt>` still works.
* [ ] `guga -p <prompt>` or an equivalent print/headless alias works for Pi-style one-shot usage.
* [ ] Tests cover config loading, model selection, command parsing/routing, and mock interactive run.

## Definition of Done (team quality bar)

* Tests added/updated for CLI behavior and config loading.
* `pnpm -r typecheck` passes.
* `pnpm -r test` passes.
* `pnpm -r build` passes.
* README/docs updated with interactive usage and config example.
* Existing committed host protocol behavior remains compatible.

## Out of Scope (explicit)

* Desktop UI.
* Remote multi-user collaboration.
* Provider marketplace or automatic provider discovery.
* Replacing host protocol with Pi RPC or any vendor-specific protocol.
* Claude Code-scale control panels for teams/tasks/agents/MCP in the first pass.
* Full ACP/LSP integration in the first pass.

## Research Notes

### What similar tools do

* **Claude Code** treats the terminal as an agent workbench, not a chat-only UI. The core shape is `App -> REPL/FullscreenLayout -> Messages + PromptInput`, where `Messages` renders what happened and `PromptInput` orchestrates slash commands, model/mode selection, permissions, queued commands, and auxiliary panels. Evidence: Fact, `docs/research/source-analysis/claude-code-analysis/analysis/components/01-component-architecture-overview.md` and `02-core-interaction-components.md`.
* **OpenCode** makes bare `opencode` the interactive TUI entry, while `opencode run "Prompt"` is the one-shot/headless path. Its CLI bootstraps a local server, uses an SDK over HTTP/SSE, then starts the TUI; this keeps desktop/web/IDE reuse viable. Evidence: Fact, `docs/research/source-analysis/learn-opencode/docs/internals/cli.md` and `docs/research/source-analysis/learn-opencode/docs/packages/opencode/02-cli-mastery.md`.
* **Pi** separates the product package (`@earendil-works/pi-coding-agent`) from reusable runtime/UI packages (`pi-agent-core`, `pi-ai`, `pi-tui`). Bare `pi` starts interactive mode; release smoke tests include `pi --list-models`, `pi -p "..."`, and bare `pi` in both Node and Bun installs. `pi-tui` provides components for multiline editor, markdown, slash/file autocomplete, overlays, settings/model selectors, cancellable loaders, IME-aware cursor placement, and synchronized differential rendering. Evidence: Fact, `docs/research/repomix/pi-focused-context.xml`.
* **Blade Code** uses a full Ink/React TUI with `MessageArea`, `InputArea`, `ChatStatusBar`, config merge, plugins/skills/subagents/hooks initialization, slash-command router, status/progress feedback, and modal overlays. Evidence: Fact, `docs/research/repomix/blade-code-context.1.xml`.
* Across references, the common product split is: default command = interactive workbench; one-shot command/flag = automation; config file = model/provider defaults; protocol/server/SDK = reusable backbone for future desktop/editor clients. Evidence: Inference from the four references above.

### Constraints from our repo/project

* `packages/cli/src/index.ts` currently dispatches through `runCli`.
* `packages/cli/src/commands/run.ts` currently owns `run` parsing and host creation.
* `packages/cli/src/config.ts` currently reads environment variables and has exploratory uncommitted config-file edits.
* `packages/host-sdk` already exposes session/run/event/control APIs.
* `packages/host-stdio` exists as an adapter layer; CLI should not make stdio compatibility the canonical protocol.
* `@guga-agent/cli` already depends on `@guga-agent/profile-code-agent`, `profile-deep-research-agent`, `profile-review-agent`, `provider-ai-sdk`, host runtime/protocol/sdk, and several plugin packages, so the package is already shaped to be a bundled product CLI rather than a thin command wrapper.

### Feasible approaches here

**Approach A: TUI-shaped workbench first** (Recommended)

* How it works: bare `guga` opens a minimal full-screen or near-full-screen terminal workbench backed by Host SDK: transcript/message area, multiline prompt input, status/model/profile/session bar, slash commands, streaming tool/assistant events, abort/queued follow-up, and interaction prompt handling.
* Pros: Matches the user's expectation and the reference tools; validates the real product surface; keeps the shared protocol useful for desktop; avoids shipping a "wrong-feeling" CLI.
* Cons: More implementation than a line REPL; requires a TUI rendering choice and more terminal smoke tests.

**Approach B: Product semantics first, simple renderer**

* How it works: `guga` opens a simple prompt loop, but uses the final command/config/session/protocol semantics; later replace the renderer with a full TUI.
* Pros: Fastest to ship; validates product semantics; easy to test; avoids premature terminal UI framework choice.
* Cons: Likely repeats the mismatch the user already called out; no panes, keyboard shortcuts, model picker, or rich rendering.

**Approach C: Package/config/capability bundle first**

* How it works: first finish config file, model aliases, default profile/capability loading, package smoke commands, and then build the interactive workbench.
* Pros: Ensures the CLI package is a real coding-agent distribution, not just UI.
* Cons: Delays the visible `guga` workbench feel; user still cannot experience the target loop immediately.

### Recommended MVP shape

* `guga` -> interactive coding-agent workbench.
* `guga run "<prompt>"` and likely `guga -p "<prompt>"` -> one-shot/headless.
* `guga --list-models` -> list configured model aliases and provider/model IDs.
* Config precedence: explicit `GUGA_CONFIG` > project `.guga/config.json` > user `~/.guga/config.json` > env/defaults.
* Terminal surface: transcript, multiline editor, status line, current model/profile/session, slash command menu/autocomplete if feasible, streaming assistant/tool events, interaction/permission prompts.
* Protocol surface: keep Host SDK + HTTP/SSE/event/interaction semantics canonical; stdio/Pi-compatible JSONL remains an adapter, not the main internal contract.
* Test/smoke shape: build CLI, `guga --help`, `guga --list-models`, `guga -p "Say exactly: ok" --mock`, bare `guga --mock` interactive startup in a pseudo terminal/tmux-like test.

### MVP Decision: User selected 1+2

The MVP should combine:

* **TUI-shaped workbench first**: bare `guga` must feel like an interactive coding-agent terminal, with transcript, multiline input, status/model/profile/session line, slash commands, streaming output, abort, queued input/follow-up, and interaction prompts.
* **Product semantics first**: model config, model selection, default coding profile/capability bundle, session controls, and one-shot commands must use the intended final semantics from the start.

This rules out:

* A plain line REPL as the main MVP.
* A polished TUI shell that still requires manual flags/config on every command.
* A protocol-only implementation that lacks a product CLI surface.

### Terminal rendering stack options

Current repo inspection found no existing Ink/React/OpenTUI/blessed/readline TUI dependency in `package.json`, `packages/*/package.json`, or `pnpm-lock.yaml`.

**Option A: Small in-repo terminal workbench renderer** (Recommended for first pass)

* How it works: implement a focused renderer for transcript + editor + status + overlays using Node stdio/raw mode and small ANSI utilities/helpers owned by `packages/cli`.
* Pros: No major dependency decision; easy to keep protocol-driven; easier to test deterministically; can be replaced or extracted later.
* Cons: We must implement enough editor/rendering behavior ourselves; not as feature-rich as Ink/OpenTUI on day one.

**Option B: Add Ink/React TUI**

* How it works: follow Claude/Blade style with React components for App, MessageArea, InputArea, StatusBar, modals, and selectors.
* Pros: Mature declarative component model; close to Blade/Claude-style architecture; good for larger terminal app growth.
* Cons: Adds React/Ink dependency surface to the CLI; testing/render lifecycle complexity increases.

**Option C: Add OpenTUI-style renderer**

* How it works: follow OpenCode-style native TUI architecture with a richer terminal UI library.
* Pros: Strong fit for high-performance terminal applications; close to OpenCode direction.
* Cons: Heavier library commitment; more investigation required before adding dependency and lockfile churn.

### Renderer Decision: OpenTUI-style / Pi-style

User selected the OpenTUI-style renderer direction. Guga should not use Ink/React for the first terminal workbench. The target rendering model is closer to Pi/OpenTUI:

* Terminal-first rendering primitives rather than React components.
* A small component interface such as `render(width): string[]` plus input handling.
* Raw-mode keyboard handling, focus, overlays, resize, cursor placement, and synchronized/differential rendering owned by the CLI/TUI layer.
* First-class multiline editor with slash-command and file-path autocomplete.
* Protocol-driven transcript rendering from Host events.
* A path to extract renderer primitives into `@guga-agent/tui` if they become generally useful.

Remaining implementation decision:

* **In-repo minimal renderer first**: implement only what Guga workbench needs in `packages/cli`, then extract later.
* **External OpenTUI dependency first**: adopt an existing OpenTUI-style package now, accepting dependency/API/lockfile review.
* **Dedicated `@guga-agent/tui` package first**: create a reusable package immediately, accepting extra package/API design work.

### Renderer Implementation Decision: In-repo minimal renderer first

User selected the in-repo minimal renderer path. First implementation should:

* Add focused terminal primitives under `packages/cli` rather than adding an external OpenTUI/Ink dependency.
* Keep the API small and Guga-specific until real usage proves what should be extracted.
* Target only the MVP workbench needs: transcript rendering, status line, multiline prompt/editor, raw key handling, slash command routing, simple overlay/select list, resize-safe wrapping, and synchronized/differential-ish redraw.
* Avoid designing a general-purpose `@guga-agent/tui` package in the first pass.
* Leave extraction to `@guga-agent/tui` as a Phase 2 refactor once the workbench UX is validated.

Acceptance criteria added by this decision:

* [ ] No new external TUI dependency is required for the first implementation.
* [ ] Terminal renderer code is isolated enough under `packages/cli` that it can later move to `packages/tui` or `@guga-agent/tui`.
* [ ] Renderer has test seams for virtual terminal or deterministic string-frame rendering.
* [ ] Renderer supports non-interactive fallback or readable failure when stdout/stdin is not a TTY.

### Coding Capability Decision: Real code tools in MVP

User selected real coding tools for the first version. The MVP should not stop at mock/provider validation. It must run the default code profile with existing first-party plugins:

* `@guga-agent/profile-code-agent`
* `@guga-agent/plugin-tools-filesystem`
* `@guga-agent/plugin-tools-shell`
* `@guga-agent/plugin-tools-git`
* `@guga-agent/plugin-skills` when configured
* `@guga-agent/plugin-mcp` when configured

Repo fact: `packages/profile-code-agent/src/bundle.ts` already exposes `createCodeAgentPlugins()` and `createCodeAgentRuntimeOptions()` to assemble filesystem, shell, git, skills, MCP, ops-health, audit-export, eval-runner, and code-agent permission policy. The CLI workbench should use that bundle as the default interactive capability set instead of manually registering tools one by one.

This adds a stronger product acceptance bar:

* Bare `guga` must be able to launch with the code profile selected by default.
* The workbench must render real tool lifecycle events from filesystem/git/shell calls.
* Permission prompts for write/edit/shell-class operations must be answerable inside the terminal and through the shared host interaction protocol.
* Mock mode remains required for deterministic tests, but mock mode is not the product definition.

### Ink/React TUI vs OpenTUI-style renderer

* **Ink/React TUI** is a React component model for terminal UI. The app is structured like frontend React: `App`, `MessageArea`, `InputArea`, `StatusBar`, modals, hooks, context/state stores. This is close to Blade/Claude-style architecture and is pleasant when the interface grows into many panels and dialogs.
* **OpenTUI-style renderer** is closer to a native terminal rendering engine. The app owns a render tree or canvas-like terminal surface, focuses on efficient diffing, cursor/control sequences, keyboard handling, and high-frequency updates. This is closer to OpenCode/Pi-style rendering priorities.
* **Practical difference for Guga**: Ink optimizes developer ergonomics and component composition; OpenTUI-style optimizes terminal control, rendering performance, and editor-like polish. For a small first workbench, either can work; the trade-off is whether we want React ecosystem ergonomics now or a lower-level terminal engine foundation now.

### Pi implementation model

Pi is organized as four product layers:

* `@earendil-works/pi-coding-agent`: the user-facing interactive coding-agent CLI package.
* `@earendil-works/pi-agent-core`: agent runtime, session state, tool calling, queues, abort, compaction, tree navigation, hooks/events.
* `@earendil-works/pi-ai`: unified multi-provider model layer and generated model catalog.
* `@earendil-works/pi-tui`: terminal UI engine with differential rendering, synchronized output, editor, markdown, overlays, selectors, settings, image support, autocomplete, key parsing, virtual terminal tests.

Important Pi patterns for Guga:

* Bare `pi` starts interactive mode; `pi -p "..."` is the prompt/one-shot path; `pi --list-models` lists configured/available models.
* Release smoke tests treat interactive startup as a blocker: `pi --help`, `pi --version`, `pi --list-models`, `pi -p "Say exactly: ok"`, and bare `pi` are tested for both Node and Bun packages.
* `pi-tui` is not React. Components implement a small `render(width): string[]` / `handleInput(data)` interface and the TUI owns focus, overlays, resize, cursor, and rendering.
* Rendering uses a three-strategy diff model: first render, full clear on width/above-viewport changes, and changed-line updates for normal changes. Updates are wrapped in synchronized output (`CSI 2026`) to avoid flicker.
* The editor is a first-class primitive: multiline input, word wrap, slash command autocomplete, file path autocomplete, bracketed paste handling, keybindings, and IME-aware cursor placement.
* Runtime accepts live control during a turn: `steer`, `followUp`, `nextTurn`, `abort`, and model/thinking/tool/resource setters. These emit queue/model/resource/session events and persist state carefully around save points.
* The product lesson is that Guga should not choose between "TUI" and "runtime semantics"; Pi makes the TUI useful because the runtime supports queues, abort, model switching, sessions, hooks, and deterministic events underneath it.

## Technical Notes

* Relevant current files:
  * `packages/cli/src/index.ts`
  * `packages/cli/src/commands/run.ts`
  * `packages/cli/src/config.ts`
  * `packages/cli/src/run.test.ts`
  * `packages/cli/README.md`
  * `packages/host-sdk/src/client.ts`
  * `packages/host-protocol/src/resources.ts`
  * `packages/host-stdio/src/index.ts`
* Prior committed work on branch `codex/cli-claude-pi-alignment` added host streaming/control/interaction/session tree/stdio foundations.
* The next implementation should either discard or consciously adapt the uncommitted exploratory edits in `packages/cli/src/commands/run.ts` and `packages/cli/src/config.ts`.
