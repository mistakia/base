/**
 * Git tool definitions for MCP
 */

export const GIT_TOOLS = {
  knowledge_base_apply_patch: {
    description: 'Apply patches to create or modify files in a git branch',
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: ['main', 'data'],
          description:
            'Which repository to target (main repo or data submodule)'
        },
        branch_name: {
          type: 'string',
          description:
            "Branch name to apply patches to (will be created if doesn't exist)"
        },
        base_branch: {
          type: 'string',
          description:
            "Base branch to create from if branch_name doesn't exist (defaults to main/master)",
          default: 'main'
        },
        patches: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file to patch relative to repo root'
              },
              content: {
                type: 'string',
                description:
                  'New file content (for new files or complete rewrites)'
              },
              patch_content: {
                type: 'string',
                description:
                  'Git patch content in unified diff format (for modifications to existing files)'
              },
              operation: {
                type: 'string',
                enum: ['create', 'modify', 'delete'],
                description: 'Operation to perform on the file',
                default: 'modify'
              }
            },
            required: ['path']
          },
          minItems: 1
        },
        commit_message: {
          type: 'string',
          description: 'Commit message for the changes'
        },
        create_pr: {
          type: 'boolean',
          description: 'Whether to create a PR after committing changes',
          default: true
        },
        pr_title: {
          type: 'string',
          description: 'Title for the PR (defaults to commit message)'
        },
        pr_description: {
          type: 'string',
          description: 'Description for the PR'
        }
      },
      required: ['repo', 'branch_name', 'patches', 'commit_message']
    }
  },

  knowledge_base_get_diff: {
    description:
      'Get the diff between branches or changes in a specific branch',
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: ['main', 'data'],
          description:
            'Which repository to examine (main repo or data submodule)'
        },
        branch: {
          type: 'string',
          description: 'Branch to get diff for'
        },
        compare_with: {
          type: 'string',
          description: 'Branch to compare with (defaults to main/master)',
          default: 'main'
        },
        path: {
          type: 'string',
          description: 'Optionally filter diff to a specific path'
        },
        format: {
          type: 'string',
          enum: ['unified', 'name-only', 'stat'],
          description: 'Diff format to return',
          default: 'unified'
        }
      },
      required: ['repo', 'branch']
    }
  },

  knowledge_base_read_file: {
    description: 'Read a knowledge base file from a specific branch',
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: ['main', 'data'],
          description:
            'Which repository to read from (main repo or data submodule)'
        },
        path: {
          type: 'string',
          description: 'Path to the file relative to repo root'
        },
        branch: {
          type: 'string',
          description: 'Branch to read from (defaults to main/master)',
          default: 'main'
        }
      },
      required: ['repo', 'path']
    }
  },

  knowledge_base_list_files: {
    description: 'List files in the knowledge base',
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: ['main', 'data'],
          description:
            'Which repository to list files from (main repo or data submodule)'
        },
        path: {
          type: 'string',
          description: 'Optional directory path to list files from',
          default: ''
        },
        branch: {
          type: 'string',
          description: 'Branch to list files from (defaults to main/master)',
          default: 'main'
        },
        pattern: {
          type: 'string',
          description: "Optional glob pattern to filter files (e.g. '*.md')",
          default: '*.md'
        }
      },
      required: ['repo']
    }
  },

  knowledge_base_search: {
    description: 'Search for content in the knowledge base',
    parameters: {
      type: 'object',
      properties: {
        repo: {
          type: 'string',
          enum: ['main', 'data'],
          description:
            'Which repository to search in (main repo or data submodule)'
        },
        query: {
          type: 'string',
          description: 'Search query'
        },
        branch: {
          type: 'string',
          description: 'Branch to search in (defaults to main/master)',
          default: 'main'
        },
        path: {
          type: 'string',
          description: 'Optional path to restrict search to'
        },
        case_sensitive: {
          type: 'boolean',
          description: 'Whether search should be case sensitive',
          default: false
        }
      },
      required: ['repo', 'query']
    }
  }
}

export default GIT_TOOLS
