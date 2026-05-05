/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'

import config from '#config'
import { dispatch_role } from '#libs-server/model-roles/dispatch-role.mjs'

const original_fetch = globalThis.fetch
const original_model_roles = config.model_roles

const make_config = () => ({
  default_timeout_ms: 300000,
  default_temperature: 0,
  inference_providers: {
    ollama: {
      endpoint: 'http://127.0.0.1:11434',
      num_ctx: 16384,
      keep_alive: '1m'
    },
    'vllm-mlx': { endpoint: 'http://127.0.0.1:8103' }
  },
  harness_providers: {
    'opencode-cli': { binary_path: 'opencode' }
  },
  roles: {
    tag_classifier: {
      provider_kind: 'inference',
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit'
    },
    title_generator: {
      provider_kind: 'inference',
      provider: 'ollama',
      model: 'gemma4:26b'
    },
    commit_message_writer: {
      provider_kind: 'inference',
      provider: 'ollama',
      model: 'gemma4:26b'
    },
    content_classifier: {
      provider_kind: 'inference',
      provider: 'ollama',
      model: 'gemma4:26b'
    },
    content_review: {
      provider_kind: 'inference',
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      max_tokens: 4096
    },
    test_harness_role: {
      provider_kind: 'harness',
      harness: 'opencode-cli',
      model: 'gpt-5'
    }
  }
})

describe('dispatch_role', () => {
  let last_body
  let last_url
  beforeEach(() => {
    config.model_roles = make_config()
    last_body = null
    last_url = null
    globalThis.fetch = async (url, init) => {
      last_url = url
      last_body = JSON.parse(init.body)
      return {
        ok: true,
        status: 200,
        json: async () => ({
          response: 'ollama-out',
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

  it('routes tag_classifier to vllm-mlx without max_tokens', async () => {
    await dispatch_role({
      role: 'tag_classifier',
      prompt: 'hi',
      format: { type: 'object' }
    })
    expect(last_url).to.equal('http://127.0.0.1:8103/v1/chat/completions')
    expect(last_body.model).to.equal('qwen3.6-35b-a3b-4bit')
    expect(last_body.guided_json).to.deep.equal({ type: 'object' })
    expect(last_body).to.not.have.property('max_tokens')
  })

  it('routes title_generator to ollama', async () => {
    await dispatch_role({ role: 'title_generator', prompt: 'hi' })
    expect(last_url).to.equal('http://127.0.0.1:11434/api/generate')
    expect(last_body.model).to.equal('gemma4:26b')
    expect(last_body.options).to.not.have.property('num_predict')
  })

  it('routes commit_message_writer to ollama', async () => {
    await dispatch_role({ role: 'commit_message_writer', prompt: 'hi' })
    expect(last_body.model).to.equal('gemma4:26b')
    expect(last_body.options).to.not.have.property('num_predict')
  })

  it('routes content_classifier to ollama', async () => {
    await dispatch_role({ role: 'content_classifier', prompt: 'hi' })
    expect(last_body.model).to.equal('gemma4:26b')
    expect(last_body.options).to.not.have.property('num_predict')
  })

  it('forwards max_tokens=4096 for content_review', async () => {
    await dispatch_role({
      role: 'content_review',
      prompt: 'hi',
      system: 'sys',
      format: { type: 'object' }
    })
    expect(last_body.max_tokens).to.equal(4096)
    expect(last_body.messages[0]).to.deep.equal({
      role: 'system',
      content: 'sys'
    })
  })

  it('falls back to default_temperature when role does not declare temperature', async () => {
    config.model_roles.default_temperature = 0.25
    await dispatch_role({ role: 'tag_classifier', prompt: 'hi' })
    expect(last_body.temperature).to.equal(0.25)
  })

  it('throws on unknown role (delegated to resolve_role)', async () => {
    let err
    try {
      await dispatch_role({ role: 'nonexistent', prompt: 'hi' })
    } catch (e) {
      err = e
    }
    expect(err.message).to.match(/Unknown role/)
  })

  it('throws when dispatching a harness-kind role', async () => {
    let err
    try {
      await dispatch_role({ role: 'test_harness_role', prompt: 'hi' })
    } catch (e) {
      err = e
    }
    expect(err.message).to.match(/harness dispatch not implemented/)
  })
})
