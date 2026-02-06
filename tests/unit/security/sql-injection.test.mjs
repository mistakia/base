import { expect } from 'chai'
import {
  build_duckdb_where_clause,
  build_duckdb_order_clause
} from '#libs-server/embedded-database-index/duckdb/duckdb-table-queries.mjs'

describe('SQL Injection Protection', () => {
  describe('build_duckdb_where_clause', () => {
    it('should reject invalid column names in filters', () => {
      const filters = [
        { column_id: 'status; DROP TABLE entities--', operator: '=', value: 'active' }
      ]

      const { where_sql, parameters } = build_duckdb_where_clause({ filters })

      // Invalid column should be skipped, resulting in empty WHERE clause
      expect(where_sql).to.equal('')
      expect(parameters).to.have.lengthOf(0)
    })

    it('should reject SQL injection via column_id', () => {
      const filters = [
        { column_id: "status' OR '1'='1", operator: '=', value: 'active' }
      ]

      const { where_sql, parameters } = build_duckdb_where_clause({ filters })

      expect(where_sql).to.equal('')
      expect(parameters).to.have.lengthOf(0)
    })

    it('should allow valid column names', () => {
      const filters = [
        { column_id: 'status', operator: '=', value: 'active' }
      ]

      const { where_sql, parameters } = build_duckdb_where_clause({ filters })

      expect(where_sql).to.include('status')
      expect(parameters).to.include('active')
    })

    it('should reject ORDER BY injection via column_id', () => {
      const filters = [
        { column_id: 'status ORDER BY 1--', operator: '=', value: 'test' }
      ]

      const { where_sql } = build_duckdb_where_clause({ filters })

      expect(where_sql).to.equal('')
    })

    it('should allow all valid entity columns', () => {
      const valid_columns = ['type', 'status', 'priority', 'archived', 'created_at', 'updated_at']

      for (const column of valid_columns) {
        const filters = [{ column_id: column, operator: '=', value: 'test' }]
        const { where_sql } = build_duckdb_where_clause({ filters })
        expect(where_sql).to.include(column)
      }
    })
  })

  describe('build_duckdb_order_clause', () => {
    it('should reject invalid column names in sort', () => {
      const sort = [
        { column_id: 'title; DROP TABLE entities--', desc: false }
      ]

      const order_sql = build_duckdb_order_clause({ sort })

      // Invalid column should be filtered out, but ORDER BY prefix may still be there
      // The important thing is the injection payload is not present
      expect(order_sql).to.not.include('DROP TABLE')
      expect(order_sql).to.not.include(';')
    })

    it('should reject SQL injection via sort column_id', () => {
      const sort = [
        { column_id: "created_at' OR '1'='1", desc: true }
      ]

      const order_sql = build_duckdb_order_clause({ sort })

      // The injected column should be filtered out
      // Only check for the injection payload, not 'OR' which is in 'ORDER'
      expect(order_sql).to.not.include("'1'='1")
      expect(order_sql).to.not.include("created_at'")
    })

    it('should allow valid sort columns', () => {
      const sort = [
        { column_id: 'created_at', desc: true },
        { column_id: 'title', desc: false }
      ]

      const order_sql = build_duckdb_order_clause({ sort })

      expect(order_sql).to.include('created_at')
      expect(order_sql).to.include('DESC')
      expect(order_sql).to.include('title')
      expect(order_sql).to.include('ASC')
    })

    it('should handle priority with special CASE expression', () => {
      const sort = [{ column_id: 'priority', desc: true }]

      const order_sql = build_duckdb_order_clause({ sort })

      expect(order_sql).to.include('CASE priority')
      expect(order_sql).to.include('DESC')
    })
  })
})
