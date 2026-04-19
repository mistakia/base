let backstop_count = 0

export function increment_timeline_backstop_counter() {
  backstop_count += 1
}

export function read_and_reset_timeline_backstop_counter() {
  const value = backstop_count
  backstop_count = 0
  return value
}
