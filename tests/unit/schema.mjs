/* global describe, it */

import chai from 'chai'

import db from '#db'

const expect = chai.expect

describe('check schema', () => {
  it('should have tables', async () => {
    const tables = await db('information_schema.tables')
      .where({
        table_schema: 'public',
        table_type: 'BASE TABLE'
      })
      .select('table_name')

    expect(tables).to.have.lengthOf(39)
  })
})
