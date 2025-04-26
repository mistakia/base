import { expect } from 'chai'

import { InferenceProvider } from '#libs-server/inference-providers/index.mjs'
import OllamaProvider from '#libs-server/inference-providers/ollama.mjs'

describe('InferenceProvider Interface', () => {
  it('should define the required methods', () => {
    const required_methods = [
      'list_models',
      'generate_message',
      'generate_embedding'
    ]

    const optional_methods = ['pull_model', 'get_model_info']

    // Verify that the base class defines all required methods
    for (const method of required_methods) {
      expect(InferenceProvider.prototype).to.have.property(method)
      expect(InferenceProvider.prototype[method]).to.be.a('function')
    }

    // Optional methods may or may not be defined on the base class
    for (const method of optional_methods) {
      if (InferenceProvider.prototype[method]) {
        expect(InferenceProvider.prototype[method]).to.be.a('function')
      }
    }
  })

  it('should throw errors for unimplemented required methods in the base class', async () => {
    const provider = new InferenceProvider()

    try {
      await provider.list_models()
      expect.fail('Should have thrown error for unimplemented method')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('not implemented')
    }

    try {
      await provider.generate_message({
        thread_id: 'test',
        messages: [],
        model: 'test'
      })
      expect.fail('Should have thrown error for unimplemented method')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('not implemented')
    }

    try {
      await provider.generate_embedding({ text: 'test', model: 'test' })
      expect.fail('Should have thrown error for unimplemented method')
    } catch (error) {
      expect(error).to.be.an('error')
      expect(error.message).to.include('not implemented')
    }
  })

  it('should verify that OllamaProvider implements the interface', () => {
    const ollama_provider = new OllamaProvider()

    expect(ollama_provider).to.be.instanceOf(InferenceProvider)

    const required_methods = [
      'list_models',
      'generate_message',
      'generate_embedding'
    ]

    for (const method of required_methods) {
      expect(ollama_provider).to.respondTo(method)
    }
  })

  it('should check method signatures for OllamaProvider', () => {
    const ollama_provider = new OllamaProvider()

    // list_models should take no parameters
    expect(ollama_provider.list_models.length).to.equal(0)

    // generate_message should accept thread_id, messages, model, and optional parameters
    const generate_message_params = ollama_provider.generate_message.toString()
    expect(generate_message_params).to.include('thread_id')
    expect(generate_message_params).to.include('messages')
    expect(generate_message_params).to.include('model')

    // generate_embedding should accept text and model
    const generate_embedding_params =
      ollama_provider.generate_embedding.toString()
    expect(generate_embedding_params).to.include('text')
    expect(generate_embedding_params).to.include('model')
  })
})
