# llm

Provider-agnostic local-LLM clients.

- `inference-client.mjs` — `call_inference({provider, endpoint, model, prompt, ...})`. Branches on provider: `ollama` posts to `/api/generate` with native `format` JSON schema; `vllm-mlx` posts to `/v1/chat/completions` (OpenAI-compat) with `guided_json`. Reads `num_ctx` and `keep_alive` from `config.model_roles.inference_providers.ollama` on the Ollama branch. Honors `OLLAMA_BASE_URL` and `OLLAMA_KEEP_ALIVE` env-var overrides for homelab deployments.
- `embedding-client.mjs` — `embed_texts(...)` against the Ollama embed endpoint. Different concern from text completion; kept separate.

See `text/base/model-dispatch-architecture.md` for how these fit under the role-aware dispatcher.
