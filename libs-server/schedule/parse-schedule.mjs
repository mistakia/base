import cron_parser from 'cron-parser'
const { parseExpression } = cron_parser
import ms from 'ms'
import debug from 'debug'

const log = debug('schedule:parse')

/**
 * Parse a schedule configuration and return the next trigger timestamp
 * @param {Object} params
 * @param {string} params.schedule_type - Type of schedule: 'expr', 'at', or 'every'
 * @param {string} params.schedule - Schedule expression (cron, ISO timestamp, or duration)
 * @param {string} [params.timezone] - Timezone for cron expressions
 * @param {string} [params.last_triggered_at] - Last trigger timestamp for 'every' type
 * @returns {string|null} ISO timestamp string for next trigger, or null if schedule is invalid/expired
 */
export const parse_schedule = ({
  schedule_type,
  schedule,
  timezone,
  last_triggered_at
}) => {
  try {
    switch (schedule_type) {
      case 'expr':
        return parse_cron_expression({ schedule, timezone })
      case 'at':
        return parse_at_timestamp({ schedule })
      case 'every':
        return parse_every_interval({ schedule, last_triggered_at })
      default:
        log(`Unknown schedule_type: ${schedule_type}`)
        return null
    }
  } catch (error) {
    log(`Error parsing schedule: ${error.message}`)
    return null
  }
}

/**
 * Parse cron expression and return next trigger time
 * @param {Object} params
 * @param {string} params.schedule - Cron expression
 * @param {string} [params.timezone] - Timezone for the expression
 * @returns {string} ISO timestamp for next trigger
 */
const parse_cron_expression = ({ schedule, timezone }) => {
  const options = {
    currentDate: new Date()
  }

  if (timezone) {
    options.tz = timezone
  }

  const interval = parseExpression(schedule, options)
  const next = interval.next()

  log(`Cron expression "${schedule}" next trigger: ${next.toISOString()}`)
  return next.toISOString()
}

/**
 * Parse ISO timestamp for one-shot execution
 * @param {Object} params
 * @param {string} params.schedule - ISO 8601 timestamp
 * @returns {string|null} ISO timestamp or null if in the past
 */
const parse_at_timestamp = ({ schedule }) => {
  const trigger_time = new Date(schedule)

  if (isNaN(trigger_time.getTime())) {
    log(`Invalid timestamp: ${schedule}`)
    return null
  }

  // Return the timestamp even if in the past - let the processor decide
  log(`At schedule: ${trigger_time.toISOString()}`)
  return trigger_time.toISOString()
}

/**
 * Parse interval duration and return next trigger time
 * @param {Object} params
 * @param {string} params.schedule - Duration string (e.g., '30m', '6h', '1d')
 * @param {string} [params.last_triggered_at] - Last trigger timestamp
 * @returns {string} ISO timestamp for next trigger
 */
const parse_every_interval = ({ schedule, last_triggered_at }) => {
  const interval_ms = ms(schedule)

  if (!interval_ms) {
    log(`Invalid duration: ${schedule}`)
    return null
  }

  const base_time = last_triggered_at
    ? new Date(last_triggered_at)
    : new Date()

  if (isNaN(base_time.getTime())) {
    log(`Invalid last_triggered_at: ${last_triggered_at}`)
    return null
  }

  const next_trigger = new Date(base_time.getTime() + interval_ms)

  log(`Every ${schedule} from ${base_time.toISOString()}: ${next_trigger.toISOString()}`)
  return next_trigger.toISOString()
}

export default parse_schedule
