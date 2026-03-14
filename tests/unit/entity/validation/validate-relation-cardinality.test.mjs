import { expect } from 'chai'
import { validate_relation_cardinality } from '#libs-server/entity/validation/validate-relation-cardinality.mjs'

describe('validate_relation_cardinality', () => {
  const make_schemas = (relation_constraints) => ({
    physical_item: { relation_constraints }
  })

  it('should return empty warnings when schema has no relation_constraints', () => {
    const result = validate_relation_cardinality({
      entity_properties: {
        type: 'physical_item',
        relations: ['target_area [[user:physical-location/kitchen.md]]']
      },
      entity_type: 'physical_item',
      schemas: { physical_item: {} }
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should return empty warnings when entity has no relations', () => {
    const schemas = make_schemas([
      { type: 'target_area', max_count: 1, message: 'too many' }
    ])

    const result = validate_relation_cardinality({
      entity_properties: { type: 'physical_item' },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should return empty warnings when relations are within max_count', () => {
    const schemas = make_schemas([
      { type: 'target_area', max_count: 1, message: 'too many target areas' }
    ])

    const result = validate_relation_cardinality({
      entity_properties: {
        type: 'physical_item',
        relations: ['target_area [[user:physical-location/kitchen.md]]']
      },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.deep.equal([])
  })

  it('should produce warning when relations exceed max_count', () => {
    const schemas = make_schemas([
      { type: 'target_area', max_count: 1, message: 'too many target areas' }
    ])

    const result = validate_relation_cardinality({
      entity_properties: {
        type: 'physical_item',
        relations: [
          'target_area [[user:physical-location/kitchen.md]]',
          'target_area [[user:physical-location/bathroom.md]]'
        ]
      },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.equal('too many target areas')
  })

  it('should check multiple relation types independently', () => {
    const schemas = make_schemas([
      { type: 'target_area', max_count: 1, message: 'too many target areas' },
      { type: 'current_location', max_count: 1, message: 'too many locations' }
    ])

    const result = validate_relation_cardinality({
      entity_properties: {
        type: 'physical_item',
        relations: [
          'target_area [[user:physical-location/kitchen.md]]',
          'target_area [[user:physical-location/bathroom.md]]',
          'current_location [[user:physical-location/garage.md]]'
        ]
      },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.equal('too many target areas')
  })

  it('should parse relation type from various string formats', () => {
    const schemas = make_schemas([
      { type: 'stored_in', max_count: 2, message: 'too many stored_in' }
    ])

    const result = validate_relation_cardinality({
      entity_properties: {
        type: 'physical_item',
        relations: [
          'stored_in [[user:physical-location/shelf-a.md]]',
          'stored_in [[user:physical-location/shelf-b.md]]',
          'stored_in [[user:physical-location/shelf-c.md]]'
        ]
      },
      entity_type: 'physical_item',
      schemas
    })
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.equal('too many stored_in')
  })
})
