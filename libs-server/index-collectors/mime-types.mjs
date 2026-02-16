/**
 * Shared MIME type map for index collectors.
 * Used by local and SSH collectors to derive mime_type from file extension.
 * Google Drive collector gets mime_type from rclone directly.
 */

const MIME_TYPES = {
  // Documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',

  // Data formats
  '.json': 'application/json',
  '.jsonl': 'application/x-ndjson',
  '.xml': 'application/xml',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.sql': 'application/sql',
  '.parquet': 'application/x-parquet',
  '.geojson': 'application/geo+json',

  // Database
  '.db': 'application/x-sqlite3',
  '.duckdb': 'application/x-duckdb',
  '.dump': 'application/x-database-dump',

  // Archives
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tgz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.7z': 'application/x-7z-compressed',
  '.rar': 'application/vnd.rar',
  '.bz2': 'application/x-bzip2',

  // Text / code
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.py': 'text/x-python',
  '.sh': 'text/x-shellscript',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.log': 'text/plain',
  '.env': 'text/plain',
  '.toml': 'text/toml',
  '.ini': 'text/plain',
  '.cfg': 'text/plain',
  '.conf': 'text/plain',

  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.heic': 'image/heic',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.bmp': 'image/bmp',

  // Audio
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.wma': 'audio/x-ms-wma',
  '.alac': 'audio/x-alac',

  // Video
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',

  // Geospatial (shapefile components)
  '.shp': 'application/x-shapefile',
  '.shx': 'application/x-shapefile-index',
  '.dbf': 'application/x-dbase',
  '.prj': 'text/plain',

  // Security
  '.pem': 'application/x-pem-file',

  // Design
  '.ai': 'application/postscript',
  '.indd': 'application/x-indesign',
  '.psd': 'image/vnd.adobe.photoshop'
}

export function get_mime_type(ext) {
  return MIME_TYPES[ext] || null
}

export default MIME_TYPES
