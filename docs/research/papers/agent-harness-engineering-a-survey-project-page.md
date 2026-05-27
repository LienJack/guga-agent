<sup>1</sup> Carnegie Mellon University · <sup>2</sup> Yale University · <sup>3</sup> Johns Hopkins University · <sup>4</sup> Northeastern University · <sup>5</sup> Tulane University · <sup>6</sup> University of Alabama at Birmingham · <sup>7</sup> The Ohio State University · <sup>8</sup> Virginia Tech · <sup>9</sup> Amazon
<sup>*</sup> Equal contribution. <sup>†</sup> Corresponding authors.

![Comparison of prompt, context, and harness engineering.](https://picrew.github.io/LLM-Harness/assets/figs/teaser.png)

A side-by-side comparison of prompt, context, and harness engineering.

The rapid deployment of large language model agents in production has revealed a recurring pattern: task execution reliability depends less on the underlying model than on the infrastructure layer that wraps it, the *agent execution harness*.

This survey presents agent harness engineering as an independent system layer, proposes the seven-layer **ETCLOVG** taxonomy (Execution, Tooling, Context, Lifecycle, Observability, Verification, Governance), and maps a broad corpus of open-source projects onto that taxonomy to expose ecosystem patterns, coverage gaps, and emerging design principles.

Claim 1

### Harnesses are independent system layers.

Real-world reliability is shaped by execution controls, feedback loops, governance, evaluation, and operational design, not only by model capability.

Claim 2

### ETCLOVG separates production concerns.

Execution, Tooling, Context, Lifecycle, Observability, Verification, and Governance expose architectural boundaries that earlier frameworks often conflate.

Claim 3

### A broad ecosystem map reveals gaps.

A systematic mapping of the open-source ecosystem surfaces adoption patterns across sandboxes, protocols, memory systems, orchestrators, observability platforms, benchmarks, and governance stacks.

## Three Engineering Phases

Read across 2022–2026, agent engineering has gone through a coherent shift in where the marginal effort lands. The three phases overlap in time and concept; they describe what the field has chosen to engineer, not a clean sequence of replacements.

- 2022–2024
	**Prompt engineering.** The primary lever is the input prompt text: instructions, few-shot examples, and reasoning templates, all optimized for a single model call.
- 2025
	**Context engineering.** The question shifts from “what is the input?” to “what should the model see at each step?” The scope expands to retrieval, compaction, tool-result ranking, and managing context-window saturation across turns.
- 2026–
	**Harness engineering.** As models become capable enough to attempt long-running tasks, the engineering focus expands to the full infrastructure wrapper: execution environment, tool interface, context, lifecycle, observability, verification, and governance.

## Timeline of Agent-Harness Systems

The same shift is visible in the systems themselves. The ReAct era of 2022–2023 wrapped a single model loop with a while-loop, a prompt template, and a small tool dispatch table; AutoGPT and BabyAGI exposed the resulting failures, including execution runaway, context blowout, state loss, and unmonitored side effects, as infrastructure problems rather than prompt problems. Tool integration and multi-agent coordination from 2023–2024 added learned tool use (Gorilla, ToolLLM, Toolformer), role-playing organizations (CAMEL, ChatDev, MetaGPT, Mixture-of-Agents), the first agent benchmarks (SWE-bench, AgentBench, WebArena, GAIA), and the beginnings of protocol standardization (MCP, A2A). By 2025–2026 enough deployment experience had accumulated that “harness engineering” began to be named as a discipline of its own, accompanied by automated harness optimization and a wave of results in which only the harness was varied.

![Timeline of representative agent-harness systems, 2022 to 2026.](https://picrew.github.io/LLM-Harness/assets/figs/timeline.png)

Representative agent-harness systems by ETCLOVG layer, 2022–2026.

## Mapping Open-Source Projects

To make the taxonomy concrete, the survey codes a broad corpus of open-source agent-harness projects against ETCLOVG, using the public artifact itself (README files, documentation, papers, examples, release notes) as the evidence. The corpus is maintained as a living catalog at [Awesome-Agent-Harness](https://github.com/Picrew/awesome-agent-harness), and contributions are welcome through pull requests.

![Corpus construction protocol.](https://picrew.github.io/LLM-Harness/assets/figs/construction_protocol.png)

Corpus construction protocol. Candidates are gathered from GitHub, papers, curated lists, package registries, and engineering blogs, then deduplicated, checked against inclusion criteria, and coded against the seven ETCLOVG layers using public documentation.

Coding is multi-label: a project's primary layer marks the mechanism most central to it, while secondary layers are assigned only when the public documentation exposes an independent capability. The counts below reflect primary assignments in the current snapshot.

| Layer | Scope | Primary projects |
| --- | --- | --- |
| E | Execution environment & sandbox | 20 |
| T | Tool interface & protocol | 12 |
| C | Context & memory management | 9 |
| L | Lifecycle & orchestration | 47 |
| O | Observability & operations | 15 |
| V | Verification & evaluation | 21 |
| G | Governance & security | 14 |

Reading the corpus in aggregate, Execution, Tooling, Lifecycle, and Verification have the densest visible coverage: coding, web, terminal, and computer-use agents all require runnable environments, tool contracts, control loops, and repeatable evaluation before they can be useful. Context and memory appear across many projects but are often embedded inside larger frameworks rather than released as standalone components. Observability and Governance are thinner in open source and more often live inside commercial platforms, SDK features, or engineering writeups, suggesting that operational control has matured later than runtime and benchmark infrastructure.

## Cross-Layer Synthesis

Composing the seven layers creates system-level constraints that no single layer can resolve alone. The survey distils these effects into three recurring patterns.

- **Cost–quality–speed trilemma.** Stronger sandboxes, richer context, and deeper evaluation improve quality but cost tokens, latency, and infrastructure. Production harnesses cannot treat quality as a scalar objective; they must decide which risks justify expensive controls and which checks can run asynchronously or in regression suites.
- **Capability–control tradeoff.** Larger tool menus, persistent memory, and permissive sandboxes broaden task coverage but enlarge the blast radius of misaligned or compromised actions. Capability and control are therefore a single design axis spanning tool schemas, context policy, runtime permissions, identity, auditability, and human approval.
- **Harness coupling problem.** Harness layers are coupled in ways that make local optimization fragile. A prompt, tool, sandbox, verifier, or monitor may look beneficial in isolation while degrading the whole rollout when combined with the rest of the control loop. Harness changes should be tested as system changes.

A related shift runs through the corpus: from *agent frameworks*, which package local abstractions (agents, tools, memory, execution loops), to *agent platforms*, which add durable workspaces, identity, observability, evaluation, governance, and human handoff across many runs and many users.

## Open Problems

Five questions remain open across the taxonomy. Each follows from the cross-layer synthesis rather than from a single ETCLOVG layer in isolation.

1. **Hardening and scaling execution environments.** Common security evaluations for prompt injection, goal misalignment, and compositional amplification; cost models that decide between containers, microVMs, OS permission boundaries, full desktop VMs, browser environments, and learned surrogates; portability that preserves semantics across self-hosted, cloud, and hybrid deployments.
2. **Reliable state in long-running agents.** Recasting context management as state estimation: characterizing the information loss at each compression, retrieval, or forgetting step; adding provenance, contradiction handling, and explicit staleness markers; recovering from durable artifacts rather than from compressed history.
3. **Trace-native failure diagnosis.** Traces should be the primary object from which systems compute outcome scores, trajectory quality, failure attribution, and regression tests, not just after-the-fact debugging material. The gap between widespread observability adoption and far less common offline evaluation is the concrete starting point.
4. **Standard handoffs across agents, tools, and humans.** Handoffs should transfer not only a text summary but intent, constraints, permissions, artifacts, provenance, budget state, risk level, trace history, and unresolved decisions. The open question is how to make such a protocol rich enough for safety and recovery while remaining simple enough for broad adoption.
5. **Adaptive simplification as models improve.** Every wrapper encodes an assumption about what the model cannot do reliably on its own. As models improve, some interventions remain load-bearing while others become cost, latency, or operational overhead. Future harnesses need mechanisms for ablating, optimizing, and simplifying themselves under joint quality, latency, cost, and risk constraints.

## Citation

If you find this survey useful in your research, please consider citing:

```
@misc{li2026agentharness,
  title={Agent Harness Engineering: A Survey},
  author={Li, Junjie and Xiao, Xi and Zhang, Yunbei and Liu, Chen and
          Zhao, Lin and Liao, Xiaoying and Ji, Yingrui and Wang, Janet and
          Gu, Jianyang and Ge, Yingqiang and Xu, Weijie and Fang, Xi and
          Xu, Xiang and Zhao, Tianchen and Kim, Youngeun and
          Wang, Tianyang and Hamm, Jihun and Krishnaswamy, Smita and
          Huan, Jun and Reddy, Chandan},
  url={https://openreview.net/pdf?id=eONq7FdiHa},
  year={2026}
}
```
