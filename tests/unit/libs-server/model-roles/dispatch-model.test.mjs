/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'

import config from '#config'
import {
  dispatch_model,
  parse_model_id
} from '#libs-server/model-roles/dispatch-model.mjs'

const original_fetch = globalThis.fetch
const original_model_roles = config.model_roles

describe('parse_model_id', () => {
  it('parses ollama/gemma4:26b', () => {
    expect(parse_model_id('ollama/gemma4:26b')).to.deep.equal({
      provider: 'ollama',
      model: 'gemma4:26b'
    })
  })

  it('splits on the first slash only', () => {
    expect(parse_model_id('vllm-mlx/qwen3.6-35b-a3b-4bit')).to.deep.equal({
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit'
    })
  })

  it('throws on bare model strings', () => {
    expect(() => parse_model_id('gemma4:26b')).to.throw(
      /parse_model_id requires "<provider>\/<model>" format/
    )
  })

  it('throws on empty string', () => {
    expect(() => parse_model_id('')).to.throw(
      /parse_model_id requires/
    )
  })

  it('throws on non-string input', () => {
    expect(() => parse_model_id(undefined)).to.throw(/parse_model_id requires/)
  })
})

describe('dispatch_model', () => {
  let last_body
  let last_url
  beforeEach(() => {
    last_body = null
    last_url = null
    config.model_roles = {
      default_timeout_ms: 300000,
      default_temperature: 0,
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
      last_url = url
      last_body = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: 'out',
          choices: [{ message: { content: 'mlx-out' } }]
        }),
        text: async () => '{}'
      }
    }
  })

  afterEach(() => {
    globalThis.fetch = original_fetch
    config.model_roles = original_model_roles
  })

  it('looks up endpoint from config', async () => {
    await dispatch_model({
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      prompt: 'hi'
    })
    expect(last_url).to.equal('http://127.0.0.1:8103/v1/chat/completions')
  })

  it('throws on unknown provider', async () => {
    let err
    try {
      await dispatch_model({ provider: 'mystery', model: 'x', prompt: 'hi' })
    } catch (e) {
      err = e
    }
    expect(err.message).to.match(/Unknown inference provider/)
  })

  it('forwards max_tokens, temperature, format to call_inference', async () => {
    await dispatch_model({
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      prompt: 'hi',
      max_tokens: 4096,
      temperature: 0.5,
      format: { type: 'object' }
    })
    expect(last_body.max_tokens).to.equal(4096)
    expect(last_body.temperature).to.equal(0.5)
    expect(last_body.guided_json).to.deep.equal({ type: 'object' })
  })

  it('forwards explicit temperature: 0 verbatim', async () => {
    config.model_roles.default_temperature = 0.9
    await dispatch_model({
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      prompt: 'hi',
      temperature: 0,
      max_tokens: 100
    })
    expect(last_body.temperature).to.equal(0)
  })

  it('forwards explicit timeout_ms verbatim (not re-defaulted)', async () => {
    let signal
    globalThis.fetch = async (url, init) => {
      signal = init.signal
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: 'out',
          choices: [{ message: { content: 'm' } }]
        }),
        text: async () => '{}'
      }
    }
    await dispatch_model({
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      prompt: 'hi',
      timeout_ms: 12345
    })
    expect(signal).to.exist
  })

  it('falls back to default_timeout_ms when timeout_ms omitted', async () => {
    config.model_roles.default_timeout_ms = 1
    let aborted = false
    globalThis.fetch = async (url, init) => {
      await new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          aborted = true
          const e = new Error('aborted')
          e.name = 'AbortError'
          reject(e)
        })
      })
    }
    let err
    try {
      await dispatch_model({
        provider: 'vllm-mlx',
        model: 'qwen3.6-35b-a3b-4bit',
        prompt: 'hi'
      })
    } catch (e) {
      err = e
    }
    expect(aborted).to.equal(true)
    expect(err.message).to.match(/timed out after 1ms/)
  })

  it('falls back to default_temperature when temperature omitted', async () => {
    config.model_roles.default_temperature = 0.42
    await dispatch_model({
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      prompt: 'hi',
      max_tokens: 100
    })
    expect(last_body.temperature).to.equal(0.42)
  })
})
