import { expect } from 'chai'
import { validate_constraints } from '#libs-server/entity/validation/validate-constraints.mjs'

describe('validate_constraints', () => {
  const make_schemas = (constraints) => ({
    physical_item: { constraints }
  })

  it('should return empty warnings when schema has no constraints', () => {
    const result = validate_constraints({
      entity_properties: { type: 'physical_item', perishable: true },
      entity_type: 'physical_item',
      schemas: { physical_item: {} }
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should return empty warnings when entity type has no schema', () => {
    const result = validate_constraints({
      entity_properties: { type: 'unknown' },
      entity_type: 'unknown',
      schemas: {}
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should fire conflicts rule when both fields match trigger values', () => {
    const schemas = make_schemas([
      {
        rule: 'conflicts',
        condition_field: 'perishable',
        condition_value: true,
        field: 'consumable',
        field_value: true,
        message: 'perishable and consumable conflict'
      }
    ])

    const result = validate_constraints({
      entity_properties: { type: 'physical_item', perishable: true, consumable: true },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.equal('perishable and consumable conflict')
  })

  it('should not fire conflicts rule when field is missing', () => {
    const schemas = make_schemas([
      {
        rule: 'conflicts',
        condition_field: 'perishable',
        condition_value: true,
        field: 'consumable',
        field_value: true,
        message: 'should not appear'
      }
    ])

    const result = validate_constraints({
      entity_properties: { type: 'physical_item', perishable: true },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should not fire conflicts rule when field value does not match', () => {
    const schemas = make_schemas([
      {
        rule: 'conflicts',
        condition_field: 'perishable',
        condition_value: true,
        field: 'consumable',
        field_value: true,
        message: 'should not appear'
      }
    ])

    const result = validate_constraints({
      entity_properties: { type: 'physical_item', perishable: true, consumable: false },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should not fire conflicts rule when condition field does not match', () => {
    const schemas = make_schemas([
      {
        rule: 'conflicts',
        condition_field: 'perishable',
        condition_value: true,
        field: 'consumable',
        field_value: true,
        message: 'should not appear'
      }
    ])

    const result = validate_constraints({
      entity_properties: { type: 'physical_item', perishable: false, consumable: true },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should evaluate multiple constraints independently', () => {
    const schemas = make_schemas([
      {
        rule: 'conflicts',
        condition_field: 'perishable',
        condition_value: true,
        field: 'consumable',
        field_value: true,
        message: 'conflict A'
      },
      {
        rule: 'conflicts',
        condition_field: 'exist',
        condition_value: false,
        field: 'consumable',
        field_value: true,
        message: 'conflict B'
      }
    ])

    const result = validate_constraints({
      entity_properties: {
        type: 'physical_item',
        perishable: true,
        consumable: true,
        exist: false
      },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.have.lengthOf(2)
    expect(result.warnings).to.include('conflict A')
    expect(result.warnings).to.include('conflict B')
  })
})
