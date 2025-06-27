import React, { useEffect, useState } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { connect } from 'react-redux'
import { createSelector } from 'reselect'
import PropTypes from 'prop-types'

import { get_app } from '@core/app'
import { resource_actions, get_resource_state } from '@core/resource'
import LoadingIndicator from '@components/loading-indicator'
import ErrorMessage from '@components/error-message'
import ResourceDirectory from './resource-directory'
import ResourceFile from './resource-file'

const map_state_to_props = createSelector(
  get_app,
  get_resource_state,
  (app, resource_state) => ({
    username: app.username,
    resource_state
  })
)

const map_dispatch_to_props = {
  load_resource: resource_actions.load_resource,
  clear_resource: resource_actions.clear_resource
}

const ResourcePage = ({
  username,
  resource_state,
  load_resource,
  clear_resource
}) => {
  const { username: route_username } = useParams()
  const location = useLocation()
  const [parsed_base_uri, set_parsed_base_uri] = useState(null)
  const [resource_content, set_resource_content] = useState(null)

  // Parse URI from current route
  useEffect(() => {
    try {
      const path_parts = location.pathname.split('/').filter(Boolean)
      if (path_parts.length >= 2) {
        const scheme = path_parts[1] // user, sys, ssh, git
        let resource_path = path_parts.slice(2).join('/')

        // For system URIs, ensure path starts with 'system/' but don't duplicate it
        if (
          scheme === 'sys' &&
          resource_path &&
          !resource_path.startsWith('system/')
        ) {
          resource_path = `system/${resource_path}`
        }

        const base_uri = resource_path
          ? `${scheme}:${resource_path}`
          : `${scheme}:`

        set_parsed_base_uri({
          scheme,
          path: resource_path,
          base_uri,
          is_directory: !resource_path || resource_path.endsWith('/')
        })
      } else {
        set_parsed_base_uri(null)
      }
    } catch (error) {
      console.error('Error parsing URI from route:', error)
      set_parsed_base_uri(null)
    }
  }, [location.pathname])

  // Load resource when URI changes
  useEffect(() => {
    if (parsed_base_uri && parsed_base_uri.base_uri && route_username) {
      try {
        load_resource({
          base_uri: parsed_base_uri.base_uri,
          username: route_username
        })
      } catch (error) {
        console.error('Error loading resource:', error)
      }
    }

    return () => {
      try {
        if (parsed_base_uri && parsed_base_uri.base_uri) {
          clear_resource({ base_uri: parsed_base_uri.base_uri })
        }
      } catch (error) {
        console.error('Error clearing resource:', error)
      }
    }
  }, [parsed_base_uri, route_username, load_resource, clear_resource])

  // Get resource content from state
  useEffect(() => {
    try {
      if (parsed_base_uri && parsed_base_uri.base_uri && resource_state) {
        const resource = resource_state.getIn([
          'resources',
          parsed_base_uri.base_uri
        ])
        const content = resource ? resource.toJS() : null
        set_resource_content(content)
      }
    } catch (error) {
      console.error('Error getting resource content:', error)
      set_resource_content(null)
    }
  }, [parsed_base_uri, resource_state])

  // Handle loading states
  if (!parsed_base_uri) {
    return <LoadingIndicator />
  }

  const loading = resource_state?.get('loading')
  const error = resource_state?.get('error')

  if (loading) {
    return <LoadingIndicator />
  }

  if (error) {
    return <ErrorMessage error={error} />
  }

  // Check if resource hasn't been loaded yet
  if (!resource_content && !loading && !error) {
    return <LoadingIndicator />
  }

  // Render directory or file based on URI structure
  if (parsed_base_uri.is_directory || resource_content?.type === 'directory') {
    return (
      <ResourceDirectory
        base_uri={parsed_base_uri.base_uri}
        scheme={parsed_base_uri.scheme}
        path={parsed_base_uri.path}
        username={route_username}
        content={resource_content}
      />
    )
  }

  return (
    <ResourceFile
      base_uri={parsed_base_uri.base_uri}
      scheme={parsed_base_uri.scheme}
      path={parsed_base_uri.path}
      username={route_username}
      content={resource_content}
    />
  )
}

ResourcePage.propTypes = {
  username: PropTypes.string,
  resource_state: PropTypes.object,
  load_resource: PropTypes.func.isRequired,
  clear_resource: PropTypes.func.isRequired
}

export default connect(map_state_to_props, map_dispatch_to_props)(ResourcePage)
