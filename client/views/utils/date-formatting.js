export const format_date_time = (date) => {
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return null
    
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ]
    const month = months[d.getMonth()]
    const day = d.getDate()
    const year = d.getFullYear()

    let hours = d.getHours()
    const minutes = d.getMinutes().toString().padStart(2, '0')
    const ampm = hours >= 12 ? 'PM' : 'AM'
    hours = hours % 12
    hours = hours || 12

    return `${month} ${day}, ${year} ${hours}:${minutes} ${ampm}`
  } catch {
    return null
  }
}

export const format_relative_time = (date) => {
  try {
    const now = new Date()
    const then = new Date(date)
    
    if (isNaN(then.getTime())) return null
    
    const seconds = Math.floor((now - then) / 1000)
    
    if (isNaN(seconds)) return null

    if (seconds < 60) return 'just now'

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`

    const days = Math.floor(hours / 24)
    if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`

    const years = Math.floor(months / 12)
    return `${years} year${years !== 1 ? 's' : ''} ago`
  } catch {
    return null
  }
}

export const format_shorthand_time = (date) => {
  try {
    const now = new Date()
    const then = new Date(date)
    
    if (isNaN(then.getTime())) return null
    
    const seconds = Math.floor((now - then) / 1000)
    
    if (isNaN(seconds)) return null

    if (seconds < 60) return 'now'

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`

    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`

    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`

    const weeks = Math.floor(days / 7)
    if (weeks < 4) return `${weeks}w`

    const months = Math.floor(days / 30)
    if (months < 12) return `${months}mo`

    const years = Math.floor(months / 12)
    return `${years}y`
  } catch {
    return null
  }
}

export const format_shorthand_number = (num) => {
  if (!num || num === 0) return '0'

  if (num < 1000) return num.toString()

  if (num < 1000000) {
    const k = num / 1000
    return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
  }

  const m = num / 1000000
  return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
}

export const format_duration = (created_at, updated_at) => {
  if (!created_at || !updated_at) return null

  try {
    const start = new Date(created_at)
    const end = new Date(updated_at)
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null
    
    const seconds = Math.floor((end - start) / 1000)
    
    if (isNaN(seconds)) return null

    if (seconds < 60) return `${seconds}s`

    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m`

    const hours = Math.floor(minutes / 60)
    const remaining_minutes = minutes % 60

    if (hours < 24) {
      return remaining_minutes > 0
        ? `${hours}h ${remaining_minutes}m`
        : `${hours}h`
    }

    const days = Math.floor(hours / 24)
    const remaining_hours = hours % 24

    return remaining_hours > 0 ? `${days}d ${remaining_hours}h` : `${days}d`
  } catch {
    return null
  }
}
