export const format_token_shorthand = ({ count }) => {
  if (count == null || isNaN(count)) return '0'

  const absolute_count = Math.abs(count)

  const format_with_suffix = (value, suffix) => {
    const fixed = value.toFixed(1)
    const trimmed = fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed
    return `${trimmed}${suffix}`
  }

  if (absolute_count >= 1e12) return format_with_suffix(count / 1e12, 'T')
  if (absolute_count >= 1e9) return format_with_suffix(count / 1e9, 'B')
  if (absolute_count >= 1e6) return format_with_suffix(count / 1e6, 'M')
  if (absolute_count >= 1e3) return format_with_suffix(count / 1e3, 'K')
  return `${count}`
}
