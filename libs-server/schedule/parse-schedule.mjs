import cronParser from 'cron-parser'
const { CronExpressionParser } = cronParser
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
 * @param {string} [params.created_at] - Entity creation timestamp (fallback for 'every' type)
 * @returns {string|null} ISO timestamp string for next trigger, or null if schedule is invalid/expired
 */
export const parse_schedule = ({
  schedule_type,
  schedule,
  timezone,
  last_triggered_at,
  created_at
}) => {
  try {
    switch (schedule_type) {
      case 'expr':
        return parse_cron_expression({
          schedule,
          timezone,
          last_triggered_at,
          created_at
        })
      case 'at':
        return parse_at_timestamp({ schedule })
      case 'every':
        return parse_every_interval({ schedule, last_triggered_at, created_at })
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
const parse_cron_expression = ({
  schedule,
  timezone,
  last_triggered_at,
  created_at
}) => {
  const reference = last_triggered_at || created_at
  const options = {
    currentDate: reference ? new Date(reference) : new Date()
  }

  if (timezone) {
    options.tz = timezone
  }

  const interval = CronExpressionParser.parse(schedule, options)
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
 * @param {string} [params.created_at] - Entity creation timestamp (fallback base time)
 * @returns {string} ISO timestamp for next trigger
 */
const parse_every_interval = ({ schedule, last_triggered_at, created_at }) => {
  const interval_ms = ms(schedule)

  if (!interval_ms) {
    log(`Invalid duration: ${schedule}`)
    return null
  }

  // Priority: last_triggered_at > created_at > now
  // Using created_at ensures new schedules become due after one interval from creation,
  // rather than perpetually being "interval" time in the future
  let base_time
  if (last_triggered_at) {
    base_time = new Date(last_triggered_at)
  } else if (created_at) {
    base_time = new Date(created_at)
  } else {
    base_time = new Date()
  }

  if (isNaN(base_time.getTime())) {
    log(
      `Invalid base time: last_triggered_at=${last_triggered_at}, created_at=${created_at}`
    )
    return null
  }

  const next_trigger = new Date(base_time.getTime() + interval_ms)

  log(
    `Every ${schedule} from ${base_time.toISOString()}: ${next_trigger.toISOString()}`
  )
  return next_trigger.toISOString()
}

export default parse_schedule
