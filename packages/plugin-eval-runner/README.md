# @guga-agent/plugin-eval-runner

Hermetic local eval fixtures for Guga runtimes.

Fixtures provide mock provider responses and expected outcomes. The runner creates an isolated runtime per fixture, never requires provider credentials, and returns structured diagnostics instead of throwing on expected eval failures.
