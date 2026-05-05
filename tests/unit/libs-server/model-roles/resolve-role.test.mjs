/* global describe, it, beforeEach, afterEach */

import { expect } from 'chai'

import config from '#config'
import { resolve_role } from '#libs-server/model-roles/resolve-role.mjs'

const original_model_roles = config.model_roles

const make_config = () => ({
  default_timeout_ms: 300000,
  default_temperature: 0,
  inference_providers: {
    ollama: { endpoint: 'http://127.0.0.1:11434' },
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
    custom_overrides: {
      provider_kind: 'inference',
      provider: 'ollama',
      model: 'gemma4:26b',
      endpoint: 'http://override:11434',
      timeout_ms: 60000
    },
    role_with_temperature_override: {
      provider_kind: 'inference',
      provider: 'ollama',
      model: 'gemma4:26b',
      temperature: 0.7
    },
    harness_role: {
      provider_kind: 'harness',
      harness: 'opencode-cli',
      model: 'gpt-5',
      mode: 'plan'
    },
    harness_with_binary_override: {
      provider_kind: 'harness',
      harness: 'opencode-cli',
      model: 'gpt-5',
      binary_path: '/custom/bin/opencode'
    }
  }
})

describe('resolve_role', () => {
  beforeEach(() => {
    config.model_roles = make_config()
  })

  afterEach(() => {
    config.model_roles = original_model_roles
  })

  it('resolves tag_classifier to vllm-mlx inference', () => {
    const result = resolve_role({ role: 'tag_classifier' })
    expect(result).to.deep.equal({
      role: 'tag_classifier',
      provider_kind: 'inference',
      provider: 'vllm-mlx',
      model: 'qwen3.6-35b-a3b-4bit',
      endpoint: 'http://127.0.0.1:8103',
      timeout_ms: 300000,
      temperature: 0
    })
    expect(result).to.not.have.property('max_tokens')
  })

  it('resolves title_generator to ollama inference', () => {
    const result = resolve_role({ role: 'title_generator' })
    expect(result.provider).to.equal('ollama')
    expect(result.model).to.equal('gemma4:26b')
    expect(result.endpoint).to.equal('http://127.0.0.1:11434')
    expect(result.temperature).to.equal(0)
    expect(result).to.not.have.property('max_tokens')
  })

  it('resolves commit_message_writer to ollama inference', () => {
    const result = resolve_role({ role: 'commit_message_writer' })
    expect(result.provider_kind).to.equal('inference')
    expect(result.provider).to.equal('ollama')
    expect(result.temperature).to.equal(0)
    expect(result).to.not.have.property('max_tokens')
  })

  it('resolves content_classifier to ollama inference', () => {
    const result = resolve_role({ role: 'content_classifier' })
    expect(result.provider).to.equal('ollama')
    expect(result.temperature).to.equal(0)
    expect(result).to.not.have.property('max_tokens')
  })

  it('resolves content_review to vllm-mlx inference with max_tokens', () => {
    const result = resolve_role({ role: 'content_review' })
    expect(result.provider).to.equal('vllm-mlx')
    expect(result.endpoint).to.equal('http://127.0.0.1:8103')
    expect(result.max_tokens).to.equal(4096)
    expect(result.temperature).to.equal(0)
  })

  it('omits max_tokens key when role does not declare it', () => {
    const result = resolve_role({ role: 'tag_classifier' })
    expect(result).to.not.have.property('max_tokens')
  })

  it('returns role-level temperature override over default_temperature', () => {
    config.model_roles.default_temperature = 0.2
    const result = resolve_role({ role: 'role_with_temperature_override' })
    expect(result.temperature).to.equal(0.7)
  })

  it('falls back to default_temperature when role has no temperature', () => {
    config.model_roles.default_temperature = 0.4
    const result = resolve_role({ role: 'tag_classifier' })
    expect(result.temperature).to.equal(0.4)
  })

  it('falls back to 0 when both role temperature and default_temperature are absent', () => {
    delete config.model_roles.default_temperature
    const result = resolve_role({ role: 'tag_classifier' })
    expect(result.temperature).to.equal(0)
  })

  it('throws on unknown role', () => {
    expect(() => resolve_role({ role: 'nonexistent' })).to.throw(
      /Unknown role: nonexistent/
    )
  })

  it('returns inference shape with endpoint, no binary_path', () => {
    const result = resolve_role({ role: 'tag_classifier' })
    expect(result).to.have.property('endpoint')
    expect(result).to.not.have.property('binary_path')
    expect(result).to.not.have.property('harness')
  })

  it('returns harness shape with binary_path, no endpoint', () => {
    const result = resolve_role({ role: 'harness_role' })
    expect(result).to.have.property('binary_path')
    expect(result).to.have.property('harness', 'opencode-cli')
    expect(result).to.have.property('mode', 'plan')
    expect(result).to.not.have.property('endpoint')
    expect(result).to.not.have.property('provider')
  })

  it('prefers role-level endpoint over provider default', () => {
    const result = resolve_role({ role: 'custom_overrides' })
    expect(result.endpoint).to.equal('http://override:11434')
  })

  it('prefers role-level binary_path over harness default', () => {
    const result = resolve_role({ role: 'harness_with_binary_override' })
    expect(result.binary_path).to.equal('/custom/bin/opencode')
  })

  it('prefers role-level timeout_ms over default_timeout_ms', () => {
    const result = resolve_role({ role: 'custom_overrides' })
    expect(result.timeout_ms).to.equal(60000)
  })

  it('falls back to default_timeout_ms when role has no override', () => {
    const result = resolve_role({ role: 'tag_classifier' })
    expect(result.timeout_ms).to.equal(300000)
  })

  it('throws when config.model_roles is missing', () => {
    delete config.model_roles
    expect(() => resolve_role({ role: 'tag_classifier' })).to.throw(
      /config\.model_roles is not configured/
    )
  })
})
