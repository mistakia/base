/**
 * Sort timeline entries by timestamp (primary) with ordering.sequence as tie-breaker.
 * Mutates and returns the input array. Treats invalid dates as timestamp 0.
 */
export const sort_timeline_entries = (entries) => {
  return entries.sort((a, b) => {
    const timestamp_a = a.timestamp
    const timestamp_b = b.timestamp

    const time_a = timestamp_a ? new Date(timestamp_a).getTime() : 0
    const time_b = timestamp_b ? new Date(timestamp_b).getTime() : 0

    // Handle invalid dates (NaN) by treating them as timestamp 0
    const safe_time_a = isNaN(time_a) ? 0 : time_a
    const safe_time_b = isNaN(time_b) ? 0 : time_b

    if (safe_time_a !== safe_time_b) {
      return safe_time_a - safe_time_b
    }

    // Tie-breaker: use ordering.sequence if both have it
    const seq_a = a.ordering?.sequence
    const seq_b = b.ordering?.sequence
    if (seq_a !== undefined && seq_b !== undefined) {
      return seq_a - seq_b
    }

    return 0
  })
}

export default sort_timeline_entries
