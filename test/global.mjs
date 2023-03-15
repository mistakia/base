import path, { dirname } from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'

import db from '#db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const schemaFile = path.resolve(__dirname, '../db/schema.sql')

export async function mochaGlobalSetup() {
  const sql = await fs.readFile(schemaFile, 'utf8')
  await db.schema.raw(sql)
}
