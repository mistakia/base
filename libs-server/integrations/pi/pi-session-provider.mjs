/**
 * Pi Session Provider
 *
 * Implementation of SessionProviderBase for Pi AI conversations.
 * Supports importing conversation history from Pi's exported data format.
 */

import { SessionProviderBase } from '#libs-server/integrations/thread/session-provider-base.mjs'

export class PiSessionProvider extends SessionProviderBase {
  constructor() {
    super({ provider_name: 'pi' })
  }

  /**
   * Find Pi sessions from provided data
   */
  async find_sessions() {
    throw new Error('Pi session discovery not yet implemented')
  }

  /**
   * Stream Pi sessions one at a time
   */
  async *stream_sessions(options = {}) {
    yield* super.stream_sessions(options)
  }

  /**
   * Normalize a Pi conversation to common session format
   */
  normalize_session(raw_session) {
    throw new Error('Pi session normalization not yet implemented')
  }

  /**
   * Validate Pi session structure
   */
  validate_session(raw_session) {
    if (!raw_session) {
      return { valid: false, reason: 'No session data provided' }
    }
    return { valid: true }
  }

  /**
   * Get inference provider name for Pi
   */
  get_inference_provider() {
    return 'inflection'
  }

  /**
   * Extract models from Pi session
   */
  get_models_from_session() {
    return ['pi']
  }
}
