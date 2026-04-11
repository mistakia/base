import fs from 'fs/promises'
import debug from 'debug'

/**
 * Generic file-based queue processor
 *
 * Polls a queue file for items to process and runs a configurable
 * processing function on each item. Uses a recursive setTimeout loop
 * to ensure sequential execution.
 */
export class FileBasedQueueProcessor {
  /**
   * Create a new queue processor
   *
   * @param {Object} config - Configuration options
   * @param {string} config.name - Processor name for logging
   * @param {string} config.debug_namespace - Debug namespace (e.g., 'metadata:queue')
   * @param {string} config.queue_file_path - Path to the queue file
   * @param {string} config.processed_file_path - Path to the processed log file
   * @param {Function} config.process_item - Async function to process each item
   * @param {Function} [config.format_log_details] - Optional function to format details for processed log
   * @param {number} [config.poll_interval_ms=2000] - Poll interval for checking queue file
   * @param {number} [config.item_delay_ms=500] - Delay between processing items
   * @param {number} [config.max_retries=3] - Maximum retry attempts for failed items
   * @param {number} [config.retry_base_delay_ms=30000] - Base delay for exponential backoff (30s)
   * @param {string} [config.dead_letter_path] - Path for dead-letter log (items that exhausted retries)
   */
  constructor(config) {
    this.name = config.name
    this.log = debug(config.debug_namespace)
    this.queue_file_path = config.queue_file_path
    this.processed_file_path = config.processed_file_path
    this.process_item = config.process_item
    this.format_log_details = config.format_log_details || (() => '')

    this.poll_interval_ms = config.poll_interval_ms || 2000
    this.item_delay_ms = config.item_delay_ms || 500
    this.max_retries = config.max_retries ?? 3
    this.retry_base_delay_ms = config.retry_base_delay_ms || 30000
    this.dead_letter_path = config.dead_letter_path || null

    // retry_counts tracks how many times each item has been retried
    // retry_eligible_at tracks when an item becomes eligible for retry (backoff)
    this.retry_counts = new Map()
    this.retry_eligible_at = new Map()

    this.poll_active = false
    this.poll_timeout = null
    this.is_processing = false
  }

  /**
   * Read items from the queue file
   * @returns {Promise<string[]>} Array of items
   */
  async read_queue_file() {
    try {
      const content = await fs.readFile(this.queue_file_path, 'utf-8')
      const lines = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)

      // Deduplicate
      return [...new Set(lines)]
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      this.log(`Failed to read queue file: ${error.message}`)
      throw error
    }
  }

  /**
   * Write items back to the queue file
   * @param {string[]} items - Items to write
   */
  async write_queue_file(items) {
    const content = items.join('\n') + (items.length > 0 ? '\n' : '')
    await fs.writeFile(this.queue_file_path, content, 'utf-8')
  }

  /**
   * Remove an item from the queue
   * @param {string} item - Item to remove
   */
  async remove_from_queue(item) {
    const queue = await this.read_queue_file()
    const updated = queue.filter((id) => id !== item)
    await this.write_queue_file(updated)
    this.log(`Removed ${item} from queue`)
  }

  /**
   * Log a processed item
   * @param {string} item - Item that was processed
   * @param {string} status - Processing status
   * @param {Object} [result] - Processing result for details
   */
  async log_processed(item, status, result = {}) {
    const timestamp = new Date().toISOString()
    const details = this.format_log_details(result)
    const details_str = details ? `\t${details}` : ''
    const entry = `${timestamp}\t${item}\t${status}${details_str}\n`

    try {
      await fs.appendFile(this.processed_file_path, entry, 'utf-8')
    } catch (error) {
      this.log(`Failed to log processed item: ${error.message}`)
    }
  }

  /**
   * Log an item to the dead-letter file after exhausting retries
   * @param {string} item - Item that failed permanently
   * @param {string} error - Error description
   */
  async log_dead_letter(item, error) {
    if (!this.dead_letter_path) return

    const timestamp = new Date().toISOString()
    const entry = `${timestamp}\t${item}\t${error}\n`

    try {
      await fs.appendFile(this.dead_letter_path, entry, 'utf-8')
    } catch (err) {
      this.log(`Failed to write dead letter: ${err.message}`)
    }
  }

  /**
   * Check if the queue file exists
   * @returns {Promise<boolean>}
   */
  async queue_file_exists() {
    try {
      await fs.access(this.queue_file_path)
      return true
    } catch {
      return false
    }
  }

  /**
   * Process all items in the queue
   */
  async process_queue() {
    if (this.is_processing) {
      this.log('Already processing, skipping')
      return
    }

    this.is_processing = true

    try {
      const queue = await this.read_queue_file()

      if (queue.length === 0) {
        return
      }

      // Filter to items eligible for processing (respecting backoff)
      const now = Date.now()
      const eligible = queue.filter((item) => {
        const eligible_at = this.retry_eligible_at.get(item)
        return !eligible_at || now >= eligible_at
      })
      const deferred = queue.filter((item) => !eligible.includes(item))

      if (eligible.length === 0) {
        return
      }

      this.log(
        `Processing ${eligible.length} items from queue${deferred.length ? ` (${deferred.length} deferred for backoff)` : ''}`
      )

      const requeue_items = [...deferred]

      for (let i = 0; i < eligible.length; i++) {
        const item = eligible[i]
        let result

        try {
          result = await this.process_item(item)
          this.log(`Item ${item} result: ${result?.status || 'unknown'}`)
        } catch (error) {
          this.log(`Error processing item ${item}: ${error.message}`)
          result = {
            item,
            status: 'error',
            error: error.message
          }
        }

        const is_error =
          result?.status === 'error' || result?.status === 'failed'
        const is_partial = result?.status === 'partial'

        if (is_error || is_partial) {
          const retry_count = (this.retry_counts.get(item) || 0) + 1

          if (retry_count <= this.max_retries) {
            const delay =
              this.retry_base_delay_ms * Math.pow(2, retry_count - 1)
            this.retry_counts.set(item, retry_count)
            this.retry_eligible_at.set(item, Date.now() + delay)
            requeue_items.push(item)
            this.log(
              `Re-queuing ${item} for retry ${retry_count}/${this.max_retries} (backoff ${delay}ms)`
            )
          } else {
            this.retry_counts.delete(item)
            this.retry_eligible_at.delete(item)
            await this.log_dead_letter(
              item,
              result?.error || 'max retries exceeded'
            )
            this.log(
              `Item ${item} exhausted ${this.max_retries} retries, moved to dead letter`
            )
          }
        } else {
          // Success -- clean up retry state
          this.retry_counts.delete(item)
          this.retry_eligible_at.delete(item)
        }

        // Log the result
        await this.log_processed(item, result?.status || 'unknown', result)

        // Brief delay between processing items
        if (i < eligible.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.item_delay_ms)
          )
        }
      }

      // Write back deferred + re-queued items, or clear if none
      await this.write_queue_file(requeue_items)

      this.log('Queue processing complete')
    } catch (error) {
      this.log(`Queue processing failed: ${error.message}`)
    } finally {
      this.is_processing = false
    }
  }

  /**
   * Poll loop using recursive setTimeout to ensure sequential execution.
   * Each iteration waits for processing to complete before scheduling the next.
   */
  async poll_loop() {
    if (!this.poll_active) {
      return
    }

    const exists = await this.queue_file_exists()
    if (exists) {
      await this.process_queue()
    }

    if (this.poll_active) {
      this.poll_timeout = setTimeout(
        () => this.poll_loop(),
        this.poll_interval_ms
      )
    }
  }

  /**
   * Start the queue processor
   */
  start() {
    if (this.poll_active) {
      this.log(`${this.name} already running`)
      return
    }

    this.log(`Starting ${this.name}`)
    this.log(
      `Polling: ${this.queue_file_path} every ${this.poll_interval_ms}ms`
    )

    this.poll_active = true

    // Process any existing queue entries on startup, then begin polling
    this.poll_loop()
  }

  /**
   * Stop the queue processor
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.poll_active) {
      this.log(`No ${this.name} to stop`)
      return
    }

    this.log(`Stopping ${this.name}`)

    this.poll_active = false

    if (this.poll_timeout) {
      clearTimeout(this.poll_timeout)
      this.poll_timeout = null
    }

    this.log(`${this.name} stopped`)
  }
}

/**
 * Helper to detect if running as main module (direct execution or PM2)
 * @param {string} filename - The processor filename (e.g., 'metadata-queue-processor.mjs')
 * @param {string} pm2_name - The PM2 process name
 * @returns {boolean}
 */
export const is_standalone_execution = (filename, pm2_name) => {
  const is_direct = process.argv[1]?.endsWith(filename)
  const is_pm2 =
    process.env.pm_id !== undefined && process.env.name === pm2_name
  return is_direct || is_pm2
}
