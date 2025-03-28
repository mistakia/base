import create_tag from './create_tag.mjs'
import delete_tag from './delete_tag.mjs'
import get_tag_by_id, { get_tag_by_name } from './get_tag.mjs'
import get_tags from './get_tags.mjs'
import get_tagged_entities from './get_tagged_entities.mjs'
import update_tag from './update_tag.mjs'
import { tag_entity, untag_entity } from './tag_entity.mjs'

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
