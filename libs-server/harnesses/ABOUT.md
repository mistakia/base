# harnesses

Harness clients spawn external CLI sessions (e.g., the OpenCode CLI binary, or a future `claude-cli` harness) rather than calling provider HTTP endpoints. The boundary between harness clients and inference clients is the `provider_kind` field on a role: `inference` routes through `libs-server/llm/inference-client.mjs`; `harness` would route through this directory.

Currently the only client is `opencode-cli-client.mjs`. The role-aware dispatcher (`libs-server/model-roles/dispatch-role.mjs`) declares but does not yet implement the harness branch — it throws when a harness-kind role is dispatched. The `claude-cli` harness and the `metadata_judge` role return when that harness ships.
