import GenericToolComponent from './GenericToolComponent'

// File System Tools
import ReadTool from './FileSystemTools/ReadTool'
import WriteTool from './FileSystemTools/WriteTool'
import EditTool from './FileSystemTools/EditTool'
import MultiEditTool from './FileSystemTools/MultiEditTool'

// Execution Tools
import BashTool from './ExecutionTools/BashTool'
import SubThreadTool from './ExecutionTools/SubThreadTool'

// Search Tools
import GrepTool from './SearchTools/GrepTool'
import GlobTool from './SearchTools/GlobTool'

// Management Tools
import TodoWriteTool from './ManagementTools/TodoWriteTool'
import LSTool from './ManagementTools/LSTool'
import WebFetchTool from './ManagementTools/WebFetchTool'

// MCP Tools
import DatabaseTool from './MCPTools/DatabaseTool'
import BrowserTool from './MCPTools/BrowserTool'
import GenericMCPTool from './MCPTools/GenericMCPTool'

import './ToolComponents.styl'

const getToolComponent = (toolName) => {
  // Main tool mapping registry
  const toolMap = {
    // File system tools
    Read: ReadTool,
    Write: WriteTool,
    Edit: EditTool,
    MultiEdit: MultiEditTool,

    // Execution tools
    Bash: BashTool,
    Task: SubThreadTool,

    // Search tools
    Grep: GrepTool,
    Glob: GlobTool,

    // Management tools
    TodoWrite: TodoWriteTool,
    LS: LSTool,
    WebFetch: WebFetchTool,
    WebSearch: WebFetchTool, // Reuse WebFetch component

    // Default fallback
    default: GenericToolComponent
  }

  // Handle MCP tools with prefix matching
  if (toolName?.startsWith('mcp__')) {
    if (toolName.includes('postgres')) return DatabaseTool
    if (toolName.includes('playwright') || toolName.includes('browser'))
      return BrowserTool
    return GenericMCPTool
  }

  return toolMap[toolName] || toolMap.default
}

export { getToolComponent }
export default getToolComponent
