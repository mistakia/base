import { List, Map } from 'immutable'

export const create_default_table_state = ({
  columns,
  sort,
  where = new List(),
  splits = new List(),
  limit = 1000,
  offset = 0
}) => {
  return new Map({
    columns: new List(columns),
    sort: new List(sort),
    where,
    splits,
    limit,
    offset
  })
}
