import { useEffect, useRef } from 'react'

const ORIGINAL_FAVICON = '/favicon.ico'

function create_waiting_favicon() {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')

  // Draw orange circle
  ctx.beginPath()
  ctx.arc(16, 16, 14, 0, 2 * Math.PI)
  ctx.fillStyle = '#e67e22'
  ctx.fill()
  ctx.strokeStyle = '#d35400'
  ctx.lineWidth = 2
  ctx.stroke()

  // Draw pause bars
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(10, 9, 4, 14)
  ctx.fillRect(18, 9, 4, 14)

  return canvas.toDataURL('image/x-icon')
}

let waiting_favicon_url = null

export default function use_dynamic_favicon(is_waiting) {
  const link_ref = useRef(null)

  useEffect(() => {
    let link = document.querySelector('link[rel="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link_ref.current = link

    if (is_waiting) {
      if (!waiting_favicon_url) {
        waiting_favicon_url = create_waiting_favicon()
      }
      link.href = waiting_favicon_url
    } else {
      link.href = ORIGINAL_FAVICON
    }

    return () => {
      if (link_ref.current) {
        link_ref.current.href = ORIGINAL_FAVICON
      }
    }
  }, [is_waiting])
}
