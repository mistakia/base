import path from 'path'

const CONTENT_TYPE_MAP = {
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
}

export function is_raw_request(req) {
  const req_path = req.path

  if (req_path.startsWith('/raw/')) {
    const file_path = req_path.slice(5)
    return { is_raw: true, file_path }
  }

  if (req.query.raw === 'true') {
    const file_path = req_path.replace(/^\/+/, '')
    return { is_raw: true, file_path }
  }

  return { is_raw: false, file_path: null }
}

export function get_content_type(file_path) {
  const ext = path.extname(file_path)
  return CONTENT_TYPE_MAP[ext] || 'application/octet-stream'
}
