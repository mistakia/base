import fs from 'fs/promises'
import config from '#config'

export default async function () {
  // Clean up test directory
  const test_directory = config.user_base_directory

  try {
    // Clean up user registry file for tests
    const user_registry_path = `${test_directory}/.system/users.json`
    try {
      await fs.writeFile(user_registry_path, JSON.stringify({}, null, 2))
    } catch (err) {
      // File might not exist, which is fine
    }

    // Clean up any test entity files (keep directory structure)
    const directories_to_clean = [
      'task',
      'workflow',
      'text',
      'thread',
      'change-request'
    ]

    for (const dir of directories_to_clean) {
      const dir_path = `${test_directory}/${dir}`
      try {
        const files = await fs.readdir(dir_path)
        for (const file of files) {
          if (file.endsWith('.md') || file.endsWith('.json')) {
            await fs.unlink(`${dir_path}/${file}`)
          }
        }
      } catch (err) {
        // Directory might not exist, create it
        try {
          await fs.mkdir(dir_path, { recursive: true })
        } catch (mkdirErr) {
          // Ignore mkdir errors
        }
      }
    }
  } catch (err) {
    // Ignore cleanup errors in tests
    console.warn('Test cleanup warning:', err.message)
  }
}
