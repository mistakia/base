import React, { useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import { Box } from '@mui/material'
import { useDispatch, useSelector } from 'react-redux'

import { git_actions } from '@core/git/actions'
import {
  get_file_at_ref,
  get_is_loading_file_at_ref_for_key,
  get_git_error
} from '@core/git/selectors'
import MarkdownViewer from '@components/primitives/MarkdownViewer.js'
import TwoColumnLayout from '@components/primitives/TwoColumnLayout.js'
import EntityFrontmatter from './EntityFrontmatter/index.js'
import FileActions from '@components/FileActions/index.js'
import FileDiffToggle from '@components/FileActions/FileDiffToggle.js'
import GitFileActions from '@components/FileActions/GitFileActions.js'
import CopyPageButton from '@components/FileActions/CopyPageButton.js'
import SharedViewBadge from '@components/SharedViewBadge/SharedViewBadge.js'
import DiffViewer from '@components/DiffViewer/index.js'
import PageHead from '@views/components/PageHead/index.js'
import { TagDashboard } from './TagDetailSection/index.js'

const EntityRenderer = ({
  frontmatter,
  markdown,
  content,
  is_redacted,
  path,
  git_context,
  can_write
}) => {
  const dispatch = useDispatch()
  const [is_diff_view_active, set_is_diff_view_active] = useState(false)

  const is_loading_file_at_ref = useSelector((state) =>
    git_context
      ? get_is_loading_file_at_ref_for_key(
          state,
          git_context.repo_path,
          git_context.relative_path,
          'HEAD'
        )
      : false
  )
  const git_error = useSelector(get_git_error)
  const file_at_ref_data = useSelector((state) =>
    git_context
      ? get_file_at_ref(
          state,
          git_context.repo_path,
          git_context.relative_path,
          'HEAD'
        )
      : null
  )

  const handle_diff_toggle = useCallback(() => {
    if (!is_diff_view_active && git_context) {
      dispatch(
        git_actions.load_file_at_ref({
          repo_path: git_context.repo_path,
          file_path: git_context.relative_path,
          ref: 'HEAD'
        })
      )
    }
    set_is_diff_view_active(!is_diff_view_active)
  }, [is_diff_view_active, git_context, dispatch])
  const entity_metadata = React.useMemo(() => {
    return {
      title: frontmatter?.title || 'Untitled',
      description: frontmatter?.description || frontmatter?.summary || '',
      tags: frontmatter?.tags || [],
      author: frontmatter?.author,
      published_time: frontmatter?.date || frontmatter?.published,
      modified_time: frontmatter?.modified || frontmatter?.updated
    }
  }, [frontmatter])
  const render_diff_toggle = () => (
    <FileDiffToggle
      git_context={git_context}
      is_active={is_diff_view_active}
      on_toggle={handle_diff_toggle}
    />
  )

  const left_content = markdown ? (
    <Box sx={{ pr: 2 }}>
      {is_diff_view_active && git_context ? (
        <DiffViewer
          original_content={file_at_ref_data?.content}
          current_content={content || ''}
          file_path={path}
          is_redacted={file_at_ref_data?.is_redacted}
          is_loading={is_loading_file_at_ref}
          error={git_error}
        />
      ) : (
        <MarkdownViewer content={markdown} is_redacted={is_redacted} />
      )}
    </Box>
  ) : null

  const right_content = frontmatter ? (
    <Box>
      <EntityFrontmatter
        frontmatter={frontmatter}
        is_sticky={Boolean(markdown)}
        markdown={markdown}
        path={path}
        can_write={can_write}
      />
      <SharedViewBadge />
      <FileActions>
        <CopyPageButton
          path={path}
          content={content}
          entity_id={frontmatter?.entity_id}
          entity_title={frontmatter?.title}
          entity_owner_key={frontmatter?.user_public_key}
        />
        <GitFileActions git_context={git_context} path={path} />
        {render_diff_toggle()}
      </FileActions>
    </Box>
  ) : null

  // Check if this is a tag entity
  const is_tag_entity = frontmatter?.type === 'tag'

  // If there's no markdown content, use full-width layout for frontmatter
  // For tag entities, also render the TagDashboard
  if (!markdown && frontmatter) {
    return (
      <>
        <PageHead
          title={entity_metadata.title}
          description={entity_metadata.description}
          tags={entity_metadata.tags}
          url={`${window.location.origin}${window.location.pathname}`}
          type='article'
          site_name='Base'
          author={entity_metadata.author || 'Base System'}
          published_time={entity_metadata.published_time}
          modified_time={entity_metadata.modified_time}
        />
        <Box
          sx={{
            p: 3,
            maxWidth: is_tag_entity ? '900px' : '1400px',
            width: '100%',
            margin: '0 auto'
          }}>
          {is_diff_view_active && git_context ? (
            <DiffViewer
              original_content={file_at_ref_data?.content}
              current_content={content || ''}
              file_path={path}
              is_redacted={file_at_ref_data?.is_redacted}
              is_loading={is_loading_file_at_ref}
              error={git_error}
            />
          ) : (
            <EntityFrontmatter
              frontmatter={frontmatter}
              is_sticky={false}
              markdown={markdown}
              path={path}
              layout='full-width'
              can_write={can_write}
            />
          )}
          <SharedViewBadge />
          <FileActions>
            <CopyPageButton
              path={path}
              content={content}
              entity_id={frontmatter?.entity_id}
              entity_title={frontmatter?.title}
              entity_owner_key={frontmatter?.user_public_key}
            />
            <GitFileActions git_context={git_context} path={path} />
            {render_diff_toggle()}
          </FileActions>
          {is_tag_entity && <TagDashboard frontmatter={frontmatter} />}
        </Box>
      </>
    )
  }

  // For tag entities with markdown, render TagDashboard below the two-column layout
  return (
    <>
      <PageHead
        title={entity_metadata.title}
        description={entity_metadata.description}
        tags={entity_metadata.tags}
        url={`${window.location.origin}${window.location.pathname}`}
        type='article'
        site_name='Base'
        author={entity_metadata.author || 'Base System'}
        published_time={entity_metadata.published_time}
        modified_time={entity_metadata.modified_time}
      />
      <Box sx={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <TwoColumnLayout
          left_content={left_content}
          right_content={right_content}
          left_column_width={8}
          right_column_width={4}
          container_padding={0}
          sticky_right={true}
        />
        {is_tag_entity && (
          <Box sx={{ px: 3, pb: 3 }}>
            <TagDashboard frontmatter={frontmatter} />
          </Box>
        )}
      </Box>
    </>
  )
}

EntityRenderer.propTypes = {
  frontmatter: PropTypes.object,
  markdown: PropTypes.string,
  content: PropTypes.string,
  is_redacted: PropTypes.bool,
  path: PropTypes.string,
  can_write: PropTypes.bool,
  git_context: PropTypes.shape({
    repo_path: PropTypes.string,
    relative_path: PropTypes.string,
    status: PropTypes.oneOf([
      'modified',
      'added',
      'deleted',
      'untracked',
      null
    ]),
    is_staged: PropTypes.bool,
    additions: PropTypes.number,
    deletions: PropTypes.number
  })
}

export default React.memo(EntityRenderer)
