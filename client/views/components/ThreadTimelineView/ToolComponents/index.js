import GenericToolComponent from './GenericToolComponent'

// File System Tools
import ReadTool from './FileSystemTools/ReadTool'
import WriteTool from './FileSystemTools/WriteTool'
import EditTool from './FileSystemTools/EditTool'
import MultiEditTool from './FileSystemTools/MultiEditTool'

// Execution Tools
import BashTool from './ExecutionTools/BashTool'
import SubThreadTool from './ExecutionTools/SubThreadTool'
import AgentTool from './ExecutionTools/AgentTool'
import KillShellTool from './ExecutionTools/KillShellTool'

// Search Tools
import GrepTool from './SearchTools/GrepTool'
import GlobTool from './SearchTools/GlobTool'

// Management Tools
import TodoWriteTool from './ManagementTools/TodoWriteTool'
import LSTool from './ManagementTools/LSTool'
import WebFetchTool from './ManagementTools/WebFetchTool'
import ToolSearchTool from './ManagementTools/ToolSearchTool'
import SendMessageTool from './ManagementTools/SendMessageTool'
import SkillTool from './ManagementTools/SkillTool'

// MCP Tools
import DatabaseTool from './MCPTools/DatabaseTool'
import BrowserTool from './MCPTools/BrowserTool'
import GenericMCPTool from './MCPTools/GenericMCPTool'

// Interaction Tools
import {
  AskUserQuestionTool,
  EnterPlanModeTool,
  ExitPlanModeTool
} from './InteractionTools'

import './ToolComponents.styl'

// Case variant aliases for tool names that appear in different forms across providers
const TOOL_NAME_ALIASES = {
  bash: 'Bash',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  grep: 'Grep',
  glob: 'Glob',
  exit_plan_mode: 'ExitPlanMode',
  enter_plan_mode: 'EnterPlanMode',
  ask_user_question: 'AskUserQuestion',
  todo_write: 'TodoWrite',
  web_fetch: 'WebFetch',
  web_search: 'WebSearch',
  multi_edit: 'MultiEdit',
  agent: 'Agent',
  kill_shell: 'KillShell',
  send_message: 'SendMessage',
  skill: 'Skill',
  tool_search: 'ToolSearch'
}

// Main tool mapping registry (static, constructed once at module level)
const tool_map = {
  // File system tools
  Read: ReadTool,
  Write: WriteTool,
  Edit: EditTool,
  MultiEdit: MultiEditTool,

  // Execution tools
  Bash: BashTool,
  BashOutput: BashTool,
  Task: SubThreadTool,
  Agent: AgentTool,
  KillShell: KillShellTool,
  KillBash: KillShellTool,

  // Search tools
  Grep: GrepTool,
  Glob: GlobTool,

  // Management tools
  TodoWrite: TodoWriteTool,
  LS: LSTool,
  WebFetch: WebFetchTool,
  WebSearch: WebFetchTool,
  ToolSearch: ToolSearchTool,
  SendMessage: SendMessageTool,
  Skill: SkillTool,
  SlashCommand: SkillTool,

  // Interaction tools
  AskUserQuestion: AskUserQuestionTool,
  EnterPlanMode: EnterPlanModeTool,
  ExitPlanMode: ExitPlanModeTool,

  // Default fallback
  default: GenericToolComponent
}

const getToolComponent = (toolName) => {
  // Normalize tool name via alias lookup
  const normalized_name = TOOL_NAME_ALIASES[toolName] || toolName

  // Handle MCP tools with prefix matching
  if (normalized_name?.startsWith('mcp__')) {
    if (normalized_name.includes('postgres')) return DatabaseTool
    if (
      normalized_name.includes('playwright') ||
      normalized_name.includes('browser')
    )
      return BrowserTool
    return GenericMCPTool
  }

  return tool_map[normalized_name] || tool_map.default
}

export { getToolComponent }
export default getToolComponent
