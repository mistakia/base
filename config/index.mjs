import secure_config from '@tsmx/secure-config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const current_file_path = fileURLToPath(import.meta.url)
const current_dir = dirname(current_file_path)
const config_dir = join(current_dir)

const config = secure_config({ directory: config_dir })

// Generate random temp path for test environments
if (process.env.NODE_ENV === 'test') {
  const random_path = join(tmpdir(), `base_data_${randomUUID()}`)
  config.user_base_directory = random_path
}

if (process.env.BASE_PUBLIC_URL) {
  config.production_url = process.env.BASE_PUBLIC_URL
  config.public_url = process.env.BASE_PUBLIC_URL
}

if (process.env.BASE_PUBLIC_WSS) {
  config.production_wss = process.env.BASE_PUBLIC_WSS
}

export default config
