import fetch from 'node-fetch'
import debug from 'debug'

const log = debug('ollama')

const OLLAMA_API_BASE_URL = 'http://localhost:11434'

export async function chat({ message, stream = false, model }) {
  log('Sending chat message')

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ message, stream, model })
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  if (stream) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()

          if (done) {
            controller.close()
            return
          }

          const chunk = decoder.decode(value)
          controller.enqueue(chunk)
        } catch (error) {
          controller.error(error)
        }
      },
      cancel() {
        reader.cancel()
      }
    })
  }

  return await response.json()
}

export async function generate_completion({ prompt, model, stream = false }) {
  log(`Generating completion for model ${model}`)

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, model, stream })
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  if (stream) {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    return new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()

          if (done) {
            controller.close()
            return
          }

          const chunk = decoder.decode(value)
          controller.enqueue(chunk)
        } catch (error) {
          controller.error(error)
        }
      },
      cancel() {
        reader.cancel()
      }
    })
  }

  return await response.json()
}

export async function list_models() {
  log('Listing models')

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/tags`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  return await response.json()
}

export async function show_model_info({ name }) {
  log(`Showing model info for ${name}`)

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/show`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name })
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  return await response.json()
}

export async function pull_model({ name }) {
  log(`Pulling model ${name}`)

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name, stream: true })
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()

        if (done) {
          controller.close()
          return
        }

        const chunk = decoder.decode(value)
        controller.enqueue(chunk)
      } catch (error) {
        controller.error(error)
      }
    },
    cancel() {
      reader.cancel()
    }
  })
}

export async function generate_embeddings({ model, prompt }) {
  log(`Generating embeddings for model ${model}`)

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, prompt })
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  return await response.json()
}

export async function list_running_models() {
  log('Listing running models')

  const response = await fetch(`${OLLAMA_API_BASE_URL}/api/ps`, {
    method: 'GET'
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${await response.text()}`)
  }

  return await response.json()
}
