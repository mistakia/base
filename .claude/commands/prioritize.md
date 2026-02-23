# Task Prioritization Command

Generate a prioritized task list by retrieving and analyzing all active tasks.

## Step 1: Retrieve Active Tasks

Use the base CLI to retrieve active tasks:

```bash
base entity list -t task --status "Planned,In Progress" --json
```

## Step 2: Group and Analyze

After retrieving tasks:

- Group related tasks by project or work area
- Identify dependencies and deadlines
- Apply the prioritization framework below

## Step 3: Prioritization Framework

**Reward Potential** (in order of importance):

- **Compounding**: Creates exponential value over time (automation, systems, processes)
- **High-Impact**: Significant immediate value or unlocks major opportunities
- **Foundation**: Enables other important work (dependencies, infrastructure)
- **Maintenance**: Prevents degradation or maintains current value
- **Urgent**: Immediate consequences if delayed

**Time Sensitivity**:

- **Overdue**: Past deadline - immediate attention required
- **Due-Today**: Must be completed today
- **Due-Soon**: Deadline within next few days
- **Flexible**: No strict deadline but progress beneficial
- **None**: No time constraints

## Step 4: Priority Rankings

**Critical/High Priority**:

- Overdue tasks with high reward potential
- Compounding reward tasks due soon
- Foundation tasks blocking other high-value work
- High-impact tasks with approaching deadlines

**Medium Priority**:

- Maintenance tasks due soon
- High-impact tasks with flexible timing
- Foundation tasks with no immediate blockers

**Lower Priority**:

- Maintenance tasks with flexible timing
- Tasks with unclear or low reward potential

## Step 5: Output Format

For each project group, show top 5 tasks:

```
## [Project Name]

### 1. [Task Title]
**Deadline**: [YYYY-MM-DD or "No deadline"]
**Priority**: [Critical/High/Medium/Low]
**Why Now**: [Clear reasoning including urgency factors, value proposition, and strategic importance]

### 2. [Next Task]
...
```

## Step 6: Update Schedule Document

After generating the prioritized task list, update the `user/text/prioritized-task-schedule.md` file with:

- Current analysis and recommendations
- Any changes in priorities or deadlines
- New observations about task patterns or risks
- Updated weekly targets and daily focus areas

Follow the `system/guideline/write-entity.md` guideline when updating the schedule document to ensure proper frontmatter formatting, relations, and observations structure.

## Important Notes

- Focus on what creates the most value in both immediate and long-term contexts
- Balance urgent needs with important strategic work
- Provide clear, actionable reasoning for each prioritization decision
- Consider task dependencies and how completing one task enables others
- Maintain the living schedule document as the single source of truth for task priorities

Please analyze current tasks and provide a clear, actionable priority list with compelling reasoning for each task's ranking.
