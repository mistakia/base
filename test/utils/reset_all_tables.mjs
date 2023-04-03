import db from '#db'
import config from '#config'

export default async function () {
  // get all tables
  const tables = await db('information_schema.tables')
    .where('table_schema', config.mysql.connection.database)
    .select('table_name')

  // disable foreign key checks
  await db.raw('SET FOREIGN_KEY_CHECKS = 0')

  // truncate all tables
  await Promise.all(tables.map((table) => db(table.table_name).delete()))

  // enable foreign key checks
  await db.raw('SET FOREIGN_KEY_CHECKS = 1')
}
