/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'

import config from '#config'
import { call_inference } from '#libs-server/llm/inference-client.mjs'

const original_fetch = globalThis.fetch
const original_model_roles = config.model_roles

const make_response = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
})

describe('call_inference', () => {
  let last_request
  let prior_base_url
  let prior_keep_alive
  let prior_base_url_set
  let prior_keep_alive_set

  beforeEach(() => {
    last_request = null
    prior_base_url_set = 'OLLAMA_BASE_URL' in process.env
    prior_keep_alive_set = 'OLLAMA_KEEP_ALIVE' in process.env
    prior_base_url = process.env.OLLAMA_BASE_URL
    prior_keep_alive = process.env.OLLAMA_KEEP_ALIVE
    delete process.env.OLLAMA_BASE_URL
    delete process.env.OLLAMA_KEEP_ALIVE

    config.model_roles = {
      inference_providers: {
        ollama: {
          endpoint: 'http://127.0.0.1:11434',
          num_ctx: 16384,
          keep_alive: '1m'
        },
        'vllm-mlx': { endpoint: 'http://127.0.0.1:8103' }
      }
    }
    globalThis.fetch = async (url, init) => {
      last_request = { url, init, body: JSON.parse(init.body) }
      return make_response({ response: 'ollama-output', choices: [{ message: { content: 'mlx-output' } }] })
    }
  })

  afterEach(() => {
    globalThis.fetch = original_fetch
    config.model_roles = original_model_roles
    if (prior_base_url_set) process.env.OLLAMA_BASE_URL = prior_base_url
    else delete process.env.OLLAMA_BASE_URL
    if (prior_keep_alive_set) process.env.OLLAMA_KEEP_ALIVE = prior_keep_alive
    else delete process.env.OLLAMA_KEEP_ALIVE
  })

  describe('ollama', () => {
    it('builds /api/generate request without format/system', async () => {
      const result = await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi'
      })
      expect(last_request.url).to.equal('http://127.0.0.1:11434/api/generate')
      expect(last_request.body.model).to.equal('gemma4:26b')
      expect(last_request.body.prompt).to.equal('hi')
      expect(last_request.body.stream).to.equal(false)
      expect(last_request.body).to.not.have.property('format')
      expect(result.output).to.equal('ollama-output')
    })

    it('forwards format JSON schema natively', async () => {
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi',
        format: { type: 'object' }
      })
      expect(last_request.body.format).to.deep.equal({ type: 'object' })
    })

    it('reads num_ctx and keep_alive from inference_providers.ollama', async () => {
      config.model_roles.inference_providers.ollama.num_ctx = 32768
      config.model_roles.inference_providers.ollama.keep_alive = '5m'
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi'
      })
      expect(last_request.body.options.num_ctx).to.equal(32768)
      expect(last_request.body.keep_alive).to.equal('5m')
    })

    it('honors OLLAMA_BASE_URL env var override', async () => {
      process.env.OLLAMA_BASE_URL = 'http://override:11434'
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi'
      })
      expect(last_request.url).to.equal('http://override:11434/api/generate')
    })

    it('honors OLLAMA_KEEP_ALIVE env var override', async () => {
      process.env.OLLAMA_KEEP_ALIVE = '10m'
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi'
      })
      expect(last_request.body.keep_alive).to.equal('10m')
    })

    it('forwards temperature and max_tokens via options', async () => {
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi',
        temperature: 0.3,
        max_tokens: 1024
      })
      expect(last_request.body.options.temperature).to.equal(0.3)
      expect(last_request.body.options.num_predict).to.equal(1024)
    })
  })

  describe('vllm-mlx', () => {
    it('builds /v1/chat/completions with guided_json', async () => {
      const result = await call_inference({
        provider: 'vllm-mlx',
        endpoint: 'http://127.0.0.1:8103',
        model: 'qwen3.6-35b-a3b-4bit',
        prompt: 'hi',
        system: 'sys-text',
        format: { type: 'object' },
        max_tokens: 4096,
        temperature: 0
      })
      expect(last_request.url).to.equal(
        'http://127.0.0.1:8103/v1/chat/completions'
      )
      expect(last_request.body.messages).to.deep.equal([
        { role: 'system', content: 'sys-text' },
        { role: 'user', content: 'hi' }
      ])
      expect(last_request.body.max_tokens).to.equal(4096)
      expect(last_request.body.temperature).to.equal(0)
      expect(last_request.body.guided_json).to.deep.equal({ type: 'object' })
      expect(last_request.body.chat_template_kwargs).to.deep.equal({
        enable_thinking: false
      })
      expect(result.output).to.equal('mlx-output')
    })
  })

  it('throws on unknown provider', async () => {
    let err
    try {
      await call_inference({
        provider: 'mystery',
        endpoint: 'http://x',
        model: 'm',
        prompt: 'p'
      })
    } catch (e) {
      err = e
    }
    expect(err).to.exist
    expect(err.message).to.match(/Unknown inference provider/)
  })

  it('throws on non-2xx HTTP', async () => {
    globalThis.fetch = async () => make_response({ error: 'bad' }, false, 500)
    let err
    try {
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi'
      })
    } catch (e) {
      err = e
    }
    expect(err.message).to.match(/Ollama API error 500/)
  })

  it('throws on timeout', async () => {
    globalThis.fetch = async (url, init) => {
      await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })
    }
    let err
    try {
      await call_inference({
        provider: 'ollama',
        endpoint: 'http://127.0.0.1:11434',
        model: 'gemma4:26b',
        prompt: 'hi',
        timeout_ms: 10
      })
    } catch (e) {
      err = e
    }
    expect(err.message).to.match(/timed out after 10ms/)
  })
})
