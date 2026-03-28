import React, { useEffect, useCallback, useMemo } from 'react'
import { useDispatch } from 'react-redux'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'

import PageLayout from '@views/layout/PageLayout.js'
import PhysicalItemsTable from '@views/components/PhysicalItemsTable/index.js'
import DirectoryPage from '@pages/DirectoryPage/index.js'
import { physical_items_actions } from '@core/physical_items/actions.js'
import PageHead from '@views/components/PageHead/index.js'
import use_page_meta from '@views/hooks/usePageMeta.js'
import {
  slug_to_view_id,
  DEFAULT_PHYSICAL_ITEM_VIEW_ID,
  KNOWN_PHYSICAL_ITEM_VIEW_IDS,
  parse_url_table_state,
  build_data_view_url
} from '@core/utils/view-url-utils.js'

const PhysicalItemsPage = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const splat = useParams()['*'] || ''
  const [search_params] = useSearchParams()

  // Disambiguate: single segment matching a known view ID is a data view,
  // everything else is a directory/entity path
  const splat_view_id = splat ? slug_to_view_id(splat) : null
  const is_known_view =
    splat_view_id &&
    !splat.includes('/') &&
    KNOWN_PHYSICAL_ITEM_VIEW_IDS.has(splat_view_id)
  const is_directory_path = splat && !is_known_view

  // Parse URL table state (tag, where, sort)
  const tag_param = search_params.get('tag') || ''
  const where_param = search_params.get('where') || ''
  const sort_param = search_params.get('sort') || ''
  const { url_filters, url_sort } = useMemo(
    () => parse_url_table_state(search_params),
    [tag_param, where_param, sort_param]
  )

  const has_url_table_state = url_filters.length > 0 || url_sort

  const resolved_view_id = is_known_view
    ? splat_view_id
    : has_url_table_state
      ? 'default'
      : DEFAULT_PHYSICAL_ITEM_VIEW_ID

  const url_tag_filter = search_params.get('tag')

  const page_meta = use_page_meta({
    custom_title: url_tag_filter
      ? `Physical Items - ${url_tag_filter}`
      : 'Physical Items',
    custom_description: 'Browse and manage physical items in the Base system'
  })

  useEffect(() => {
    if (!is_directory_path) {
      dispatch(
        physical_items_actions.select_physical_item_table_view({
          view_id: resolved_view_id
        })
      )
      dispatch(
        physical_items_actions.load_physical_items_table({
          view_id: resolved_view_id,
          url_filters,
          url_sort
        })
      )
    }
  }, [dispatch, resolved_view_id, is_directory_path, url_filters, url_sort])

  const handle_view_select = useCallback(
    (view_id) => {
      navigate(
        build_data_view_url({ base_path: '/physical-item', view_id })
      )
    },
    [navigate]
  )

  if (is_directory_path) {
    return <DirectoryPage />
  }

  return (
    <>
      <PageHead
        title={page_meta.title}
        description={page_meta.description}
        tags={page_meta.tags}
        url={page_meta.url}
        type={page_meta.type}
        site_name={page_meta.site_name}
      />
      <PageLayout>
        <div>
          <PhysicalItemsTable on_view_select={handle_view_select} />
        </div>
      </PageLayout>
    </>
  )
}

export default PhysicalItemsPage
