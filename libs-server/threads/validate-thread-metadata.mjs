import fs from 'fs/promises'
import path from 'path'
import url from 'url'

import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const here = path.dirname(url.fileURLToPath(import.meta.url))
const SCHEMA_PATH = path.resolve(
  here,
  '..',
  '..',
  'system',
  'text',
  'thread-metadata-schema.json'
)

let validator_promise = null

const load_validator = async () => {
  if (!validator_promise) {
    validator_promise = (async () => {
      const raw = await fs.readFile(SCHEMA_PATH, 'utf-8')
      const schema = JSON.parse(raw)
      const ajv = new Ajv({ allErrors: true, strict: false })
      addFormats(ajv)
      return ajv.compile(schema)
    })()
  }
  return validator_promise
}

const format_errors = (errors) =>
  (errors || [])
    .map((e) => `${e.instancePath || '/'} ${e.message} (${e.keyword})`)
    .join('; ')

/**
 * Validate a thread metadata object against system/text/thread-metadata-schema.json.
 * Throws an Error with a descriptive message listing every violation when invalid.
 */
export const assert_valid_thread_metadata = async (metadata) => {
  const validate = await load_validator()
  if (!validate(metadata)) {
    const summary = format_errors(validate.errors)
    const err = new Error(`thread metadata schema violation: ${summary}`)
    err.code = 'THREAD_METADATA_SCHEMA_VIOLATION'
    err.violations = validate.errors
    throw err
  }
}
