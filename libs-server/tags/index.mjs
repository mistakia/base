import create_tag from './create-tag.mjs'
import delete_tag from './delete-tag.mjs'
import get_tag_by_id, { get_tag_by_name } from './get-tag.mjs'
import get_tags from './get-tags.mjs'
import get_tagged_entities from './get-tagged-entities.mjs'
import update_tag from './update-tag.mjs'
import { tag_entity, untag_entity } from './tag-entity.mjs'

export {
  create_tag,
  delete_tag,
  get_tag_by_id,
  get_tag_by_name,
  get_tags,
  get_tagged_entities,
  tag_entity,
  untag_entity,
  update_tag
}
