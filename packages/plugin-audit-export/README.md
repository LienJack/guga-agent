# @guga-agent/plugin-audit-export

Operational helpers for projecting agent event streams into safe audit summaries and metric snapshots.

The package deliberately aggregates run, tool, permission, usage, and failure state without copying model prompts, tool arguments, or raw tool outputs into the exported summaries.
