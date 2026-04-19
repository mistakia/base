import fs from 'fs/promises'
import path from 'path'

export const seed_thread_metadata = async ({ thread_dir, thread_id }) => {
  await fs.writeFile(
    path.join(thread_dir, 'metadata.json'),
    JSON.stringify({ thread_id })
  )
}
