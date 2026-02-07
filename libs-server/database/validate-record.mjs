/**
 * Record Validation
 *
 * Validates records against database entity field definitions.
 */

import debug from 'debug'

const log = debug('database:validate')

/**
 * Validate a single value against a field definition
 *
 * @param {any} value - Value to validate
 * @param {Object} field - Field definition
 * @returns {Object} { valid, error, coerced_value }
 */
function validate_field_value(value, field) {
  const { name, type, required, enum: allowed_values } = field

  // Check required
  if (required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: `Field "${name}" is required` }
  }

  // Allow null/undefined for optional fields
  if (value === null || value === undefined) {
    return { valid: true, coerced_value: null }
  }

  // Type validation and coercion
  let coerced_value = value

  switch (type) {
    case 'string':
      coerced_value = String(value)
      break

    case 'number':
      if (typeof value === 'string') {
        coerced_value = parseFloat(value)
        if (isNaN(coerced_value)) {
          return { valid: false, error: `Field "${name}" must be a number` }
        }
      } else if (typeof value !== 'number') {
        return { valid: false, error: `Field "${name}" must be a number` }
      }
      break

    case 'boolean':
      if (typeof value === 'string') {
        const lower = value.toLowerCase()
        if (lower === 'true' || lower === '1' || lower === 'yes') {
          coerced_value = true
        } else if (lower === 'false' || lower === '0' || lower === 'no') {
          coerced_value = false
        } else {
          return { valid: false, error: `Field "${name}" must be a boolean` }
        }
      } else if (typeof value !== 'boolean') {
        return { valid: false, error: `Field "${name}" must be a boolean` }
      }
      break

    case 'datetime':
      if (value instanceof Date) {
        coerced_value = value.toISOString()
      } else if (typeof value === 'string') {
        const date = new Date(value)
        if (isNaN(date.getTime())) {
          return { valid: false, error: `Field "${name}" must be a valid datetime` }
        }
        coerced_value = date.toISOString()
      } else if (typeof value === 'number') {
        coerced_value = new Date(value).toISOString()
      } else {
        return { valid: false, error: `Field "${name}" must be a datetime` }
      }
      break

    case 'array':
      if (typeof value === 'string') {
        try {
          coerced_value = JSON.parse(value)
          if (!Array.isArray(coerced_value)) {
            return { valid: false, error: `Field "${name}" must be an array` }
          }
        } catch {
          return { valid: false, error: `Field "${name}" must be a valid JSON array` }
        }
      } else if (!Array.isArray(value)) {
        return { valid: false, error: `Field "${name}" must be an array` }
      }
      break

    case 'object':
      if (typeof value === 'string') {
        try {
          coerced_value = JSON.parse(value)
          if (coerced_value === null || typeof coerced_value !== 'object' || Array.isArray(coerced_value)) {
            return { valid: false, error: `Field "${name}" must be an object` }
          }
        } catch {
          return { valid: false, error: `Field "${name}" must be a valid JSON object` }
        }
      } else if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, error: `Field "${name}" must be an object` }
      }
      break
  }

  // Enum validation
  if (allowed_values && allowed_values.length > 0) {
    const string_value = String(coerced_value)
    if (!allowed_values.includes(string_value)) {
      return {
        valid: false,
        error: `Field "${name}" must be one of: ${allowed_values.join(', ')}`
      }
    }
  }

  return { valid: true, coerced_value }
}

/**
 * Validate a record against database entity fields
 *
 * @param {Object} record - Record to validate
 * @param {Object} database_entity - Database entity with fields definition
 * @param {Object} options - Validation options
 * @param {boolean} options.coerce - Whether to coerce values to correct types
 * @param {boolean} options.strip_unknown - Whether to remove unknown fields
 * @returns {Object} { valid, errors, record }
 */
export function validate_record(record, database_entity, options = {}) {
  const { coerce = true, strip_unknown = false } = options
  const fields = database_entity.fields || []
  const errors = []
  const validated_record = {}

  log('Validating record against %d fields', fields.length)

  // Build field map for quick lookup
  const field_map = new Map()
  for (const field of fields) {
    field_map.set(field.name, field)
  }

  // Validate each field in the schema
  for (const field of fields) {
    const value = record[field.name]
    const result = validate_field_value(value, field)

    if (!result.valid) {
      errors.push(result.error)
    } else if (coerce) {
      validated_record[field.name] = result.coerced_value
    } else {
      validated_record[field.name] = value
    }
  }

  // Handle unknown fields
  for (const key of Object.keys(record)) {
    if (!field_map.has(key)) {
      if (strip_unknown) {
        log('Stripping unknown field: %s', key)
      } else {
        validated_record[key] = record[key]
      }
    }
  }

  const valid = errors.length === 0

  if (!valid) {
    log('Validation failed: %j', errors)
  }

  return { valid, errors, record: validated_record }
}

/**
 * Validate multiple records
 *
 * @param {Array} records - Records to validate
 * @param {Object} database_entity - Database entity with fields definition
 * @param {Object} options - Validation options
 * @returns {Object} { valid, errors, records }
 */
export function validate_records(records, database_entity, options = {}) {
  const all_errors = []
  const validated_records = []

  for (let i = 0; i < records.length; i++) {
    const result = validate_record(records[i], database_entity, options)
    validated_records.push(result.record)

    if (!result.valid) {
      for (const error of result.errors) {
        all_errors.push(`Record ${i}: ${error}`)
      }
    }
  }

  return {
    valid: all_errors.length === 0,
    errors: all_errors,
    records: validated_records
  }
}

export default {
  validate_record,
  validate_records
}
