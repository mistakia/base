# model-roles

Role-aware model dispatch. Three layers:

- `resolve-role.mjs` — reads `config.model_roles.roles[<name>]` and returns an explicit dispatch descriptor (provider, model, endpoint, timeout_ms, temperature, optional max_tokens) for inference roles, or (harness, model, binary_path, mode, timeout_ms) for harness roles.
- `dispatch-role.mjs` — production surface. Resolves a role and forwards inference roles to `dispatch_model`. Throws if a harness-kind role is dispatched (harness branch is declared but unimplemented).
- `dispatch-model.mjs` — low-level surface used by benches that sweep arbitrary model strings. Looks up the inference endpoint by provider, applies top-level defaults for `timeout_ms` and `temperature`, and forwards to `call_inference`. Also exports `parse_model_id` for parsing prefixed model identifiers (`<provider>/<model>`).

See `text/base/model-dispatch-architecture.md` for the full architecture.
