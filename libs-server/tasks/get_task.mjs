import db from '#db'
import {
  fetch_entity_data,
  fetch_entity_tags
} from '#libs-server/entities/index.mjs'

export default async function get_task({ entity_id, user_id }) {
  // Get the task entity with type data
  const entity = await fetch_entity_data({
    entity_id,
    user_id,
    include_type_data: true
  })

  if (!entity || entity.type !== 'task') {
    return null
  }

  // Get tags
  const tags = await fetch_entity_tags({ entity_id: entity_id })

  // Get all relations from entity_relations
  const outgoing_relations = await db('entity_relations')
    .where('source_entity_id', entity_id)
    .select('relation_type', 'target_entity_id')
    .join('entities', 'entities.entity_id', 'entity_relations.target_entity_id')
    .select('entities.type as target_type')

  // Get all relations where task is the target
  const incoming_relations = await db('entity_relations')
    .where('target_entity_id', entity_id)
    .select('relation_type', 'source_entity_id')
    .join('entities', 'entities.entity_id', 'entity_relations.source_entity_id')
    .select('entities.type as source_type')

  // Process relations into appropriate arrays
  const relations_by_type = {}
  
  // Process outgoing relations
  outgoing_relations.forEach(relation => {
    const key = `${relation.relation_type}_${relation.target_type}_ids`
    if (!relations_by_type[key]) {
      relations_by_type[key] = []
    }
    relations_by_type[key].push(relation.target_entity_id)
  })
  
  // Process incoming relations (reversed)
  incoming_relations.forEach(relation => {
    const key = `incoming_${relation.relation_type}_${relation.source_type}_ids`
    if (!relations_by_type[key]) {
      relations_by_type[key] = []
    }
    relations_by_type[key].push(relation.source_entity_id)
  })

  // Extract common relation patterns for backward compatibility
  const dependent_on = outgoing_relations
    .filter(r => r.relation_type === 'depends_on' && r.target_type === 'task')
    .map(r => r.target_entity_id)
    
  const dependent_for = incoming_relations
    .filter(r => r.relation_type === 'depends_on' && r.source_type === 'task')
    .map(r => r.source_entity_id)
    
  const children_task_ids = incoming_relations
    .filter(r => r.relation_type === 'child_of' && r.source_type === 'task')
    .map(r => r.source_entity_id)
    
  const parents_task_ids = outgoing_relations
    .filter(r => r.relation_type === 'child_of' && r.target_type === 'task')
    .map(r => r.target_entity_id)
    
  const organization_ids = outgoing_relations
    .filter(r => (r.relation_type === 'involves' || r.relation_type === 'assigned_to') && 
           r.target_type === 'organization')
    .map(r => r.target_entity_id)
    
  const person_ids = outgoing_relations
    .filter(r => (r.relation_type === 'assigned_to' || r.relation_type === 'involves') && 
           r.target_type === 'person')
    .map(r => r.target_entity_id)
    
  const physical_item_ids = outgoing_relations
    .filter(r => r.relation_type === 'requires' && r.target_type === 'physical_item')
    .map(r => r.target_entity_id)
    
  const digital_item_ids = outgoing_relations
    .filter(r => r.relation_type === 'requires' && r.target_type === 'digital_item')
    .map(r => r.target_entity_id)
    
  const activity_ids = outgoing_relations
    .filter(r => r.relation_type === 'executes' && r.target_type === 'activity')
    .map(r => r.target_entity_id)

  return {
    task_id: entity.entity_id,
    title: entity.title,
    description: entity.description,
    user_id: entity.user_id,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    // Task-specific data
    status: entity.status,
    priority: entity.priority,
    assigned_to: entity.assigned_to,
    start_by: entity.start_by,
    finish_by: entity.finish_by,
    estimated_total_duration: entity.estimated_total_duration,
    estimated_preparation_duration: entity.estimated_preparation_duration,
    estimated_execution_duration: entity.estimated_execution_duration,
    estimated_cleanup_duration: entity.estimated_cleanup_duration,
    actual_duration: entity.actual_duration,
    planned_start: entity.planned_start,
    planned_finish: entity.planned_finish,
    started_at: entity.started_at,
    finished_at: entity.finished_at,
    snooze_until: entity.snooze_until,
    // Canonical relations (for backward compatibility)
    dependent_on,
    dependent_for,
    children_task_ids,
    parents_task_ids,
    tag_ids: tags.map(tag => tag.tag_id),
    organization_ids,
    person_ids,
    physical_item_ids,
    digital_item_ids,
    activity_ids,
    // All relation types
    ...relations_by_type
  }
}
