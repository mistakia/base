import { useState, useCallback, useEffect, useRef } from 'react'

const DISCARD_CONFIRM_TIMEOUT_MS = 6000

export const use_discard_confirm = ({ on_discard }) => {
  const [is_confirming, set_is_confirming] = useState(false)
  const timer_ref = useRef(null)

  useEffect(() => {
    return () => {
      if (timer_ref.current) {
        clearTimeout(timer_ref.current)
      }
    }
  }, [])

  const handle_discard_click = useCallback(() => {
    set_is_confirming((prev) => {
      if (prev) {
        clearTimeout(timer_ref.current)
        on_discard()
        return false
      }
      timer_ref.current = setTimeout(() => {
        set_is_confirming(false)
      }, DISCARD_CONFIRM_TIMEOUT_MS)
      return true
    })
  }, [on_discard])

  return { is_confirming, handle_discard_click }
}
