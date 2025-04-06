import db from '#db'

export default async function () {
  // get all tables
  const tables = await db('information_schema.tables')
    .where('table_schema', 'public')
    .where('table_type', 'BASE TABLE')
    .select('table_name')

  // disable foreign key checks
  await db.raw('SET CONSTRAINTS ALL DEFERRED')

  // truncate tables sequentially instead of in parallel to avoid deadlocks
  for (const table of tables) {
    // Using TRUNCATE is more efficient than DELETE in Postgres
    await db.raw('TRUNCATE TABLE ?? CASCADE', [table.table_name])
  }

  // enable foreign key checks
  await db.raw('SET CONSTRAINTS ALL IMMEDIATE')
}
