import { expect } from 'chai'
import { validate_entity_from_filesystem } from '#libs-server/entity/filesystem/validate-entity-from-filesystem.mjs'

describe('validate_entity_from_filesystem - warnings pipeline', () => {
  const base_schemas = {
    physical_item: {
      properties: [
        { name: 'consumable', type: 'boolean', required: false },
        { name: 'perishable', type: 'boolean', required: false }
      ],
      constraints: [
        {
          rule: 'conflicts',
          condition_field: 'perishable',
          condition_value: true,
          field: 'consumable',
          field_value: true,
          message: 'perishable and consumable conflict'
        }
      ],
      relation_constraints: [
        {
          type: 'target_area',
          max_count: 1,
          message: 'multiple target_area relations'
        }
      ]
    }
  }

  it('should return warnings alongside successful validation', async () => {
    const result = await validate_entity_from_filesystem({
      entity_properties: {
        title: 'Test Item',
        type: 'physical_item',
        entity_id: '11111111-1111-4111-8111-111111111111',
        perishable: true,
        consumable: true
      },
      formatted_entity_metadata: {
        property_tags: [],
        relations: [],
        references: []
      },
      schemas: base_schemas
    })

    expect(result.success).to.be.true
    expect(result.warnings).to.be.an('array')
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.equal('perishable and consumable conflict')
  })

  it('should return warnings alongside errors when both present', async () => {
    const result = await validate_entity_from_filesystem({
      entity_properties: {
        title: 'Test Item',
        type: 'physical_item',
        entity_id: '11111111-1111-4111-8111-111111111111',
        perishable: true,
        consumable: true,
        relations: ['relates [[user:nonexistent/does-not-exist.md]]']
      },
      formatted_entity_metadata: {
        property_tags: [],
        relations: [
          { type: 'relates', base_uri: 'user:nonexistent/does-not-exist.md' }
        ],
        references: []
      },
      schemas: base_schemas
    })

    // Non-existent relation target triggers an error
    expect(result.success).to.be.false
    expect(result.errors).to.be.an('array').that.is.not.empty
    expect(result.warnings).to.be.an('array')
    expect(result.warnings).to.have.lengthOf(1)
    expect(result.warnings[0]).to.equal('perishable and consumable conflict')
  })

  it('should return relation cardinality warnings', async () => {
    const result = await validate_entity_from_filesystem({
      entity_properties: {
        title: 'Test Item',
        type: 'physical_item',
        entity_id: '11111111-1111-4111-8111-111111111111',
        relations: [
          'target_area [[user:physical-location/a.md]]',
          'target_area [[user:physical-location/b.md]]'
        ]
      },
      formatted_entity_metadata: {
        property_tags: [],
        relations: [
          { type: 'target_area', base_uri: 'user:physical-location/a.md' },
          { type: 'target_area', base_uri: 'user:physical-location/b.md' }
        ],
        references: []
      },
      schemas: base_schemas
    })

    // The relation existence check may fail (targets don't exist on filesystem),
    // but warnings should still be populated
    expect(result.warnings).to.be.an('array')
    expect(result.warnings).to.include('multiple target_area relations')
  })

  it('should return empty warnings when no constraints are violated', async () => {
    const result = await validate_entity_from_filesystem({
      entity_properties: {
        title: 'Test Item',
        type: 'physical_item',
        entity_id: '11111111-1111-4111-8111-111111111111',
        perishable: true,
        consumable: false
      },
      formatted_entity_metadata: {
        property_tags: [],
        relations: [],
        references: []
      },
      schemas: base_schemas
    })

    expect(result.success).to.be.true
    expect(result.warnings).to.deep.equal([])
  })
})
