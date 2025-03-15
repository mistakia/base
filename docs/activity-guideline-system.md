# Activity and Guideline System

This document outlines the Activity and Guideline System, a core component of the human-in-the-loop agent architecture that provides context-aware processing and continuous improvement.

## 1. Overview

The Activity and Guideline System classifies actions, data, and tasks into "activities" and associates them with "guidelines" that govern how those activities should be performed. This system enables:

- Context-aware processing of inference requests
- Consistent application of best practices
- Targeted improvement of system components
- Association of related data items
- Effective multi-model comparison and selection

## 2. Activities

### 2.1 Definition

An **Activity** is a classification of actions that share common patterns, guidelines, and data requirements. Examples include:

- Writing an email
- Creating a task
- Organizing information
- Naming a home item
- Refactoring code
- Summarizing content

### 2.2 Activity Schema

```javascript
{
  activity_id: 'string', // Unique identifier
  name: 'string', // Human-readable name
  description: 'string', // Purpose description
  guidelines: [], // IDs of associated guidelines
  related_data_types: [], // Types of data associated with this activity
  related_activities: [], // IDs of related activities
  suggested_models: [], // Models recommended for this activity
  improvement_metrics: [], // Metrics to track for improvement
  created_at: 'timestamp',
  updated_at: 'timestamp',
  version: 'string' // Git version identifier
}
```

### 2.3 Activity Registry

The Activity Registry maintains the catalog of all defined activities and provides:

- Activity lookup by ID or name
- Activity search by related data types or guidelines
- Activity relationship mapping
- Activity versioning and history

### 2.4 Activity Matcher

The Activity Matcher analyzes inference requests and other system operations to identify relevant activities. It uses:

- Natural language understanding
- Pattern matching
- Explicit activity tags
- Historical activity associations

## 3. Guidelines

### 3.1 Definition

A **Guideline** is a set of rules or recommendations associated with activities that MUST, SHOULD, or MAY be followed when performing those activities. Guidelines use RFC 2119 keywords to indicate requirement levels.

### 3.2 Guideline Schema

```javascript
{
  guideline_id: 'string', // Unique identifier
  title: 'string', // Guideline title
  description: 'string', // Detailed description
  content: 'string', // The actual guideline content using RFC 2119 keywords
  activities: [], // Activities this guideline applies to
  priority: 'string', // 'MUST', 'SHOULD', 'MAY' etc. (RFC 2119)
  rationale: 'string', // Explanation of why this guideline exists
  examples: [], // Example applications of the guideline
  created_at: 'timestamp',
  updated_at: 'timestamp',
  version: 'string' // Git version identifier
}
```

### 3.3 RFC 2119 Requirement Levels

Guidelines MUST use the following RFC 2119 keywords to indicate requirement levels:

- **MUST** (or **REQUIRED**): Absolute requirement
- **MUST NOT** (or **SHALL NOT**): Absolute prohibition
- **SHOULD** (or **RECOMMENDED**): Strong recommendation
- **SHOULD NOT** (or **NOT RECOMMENDED**): Strong discouragement
- **MAY** (or **OPTIONAL**): Optional item

### 3.4 Guideline Manager

The Guideline Manager is responsible for:

- Storing and retrieving guidelines
- Associating guidelines with activities
- Versioning guidelines
- Collecting applicable guidelines for inference requests
- Evaluating guideline compliance

## 4. Activity-Guideline Relationships

### 4.1 Many-to-Many Relationship

Activities and guidelines have a many-to-many relationship:

- An activity can have multiple guidelines
- A guideline can apply to multiple activities

### 4.2 Inheritance

Activities can inherit guidelines from related activities:

- Parent activities pass guidelines to child activities
- More specific activities can override guidelines from more general activities

### 4.3 Conflict Resolution

When guidelines conflict, resolution follows these rules:

1. Higher priority guidelines (MUST > SHOULD > MAY) take precedence
2. More specific activity guidelines override more general ones
3. Newer guidelines override older ones
4. Human intervention resolves remaining conflicts

## 5. Implementation Components

### 5.1 Activity System

```
└── activities/
    ├── activity_registry.mjs # Stores activity definitions
    ├── activity_matcher.mjs  # Matches inference requests to activities
    ├── guideline_manager.mjs # Manages guidelines for activities
    ├── activity_tracker.mjs  # Tracks activity performance metrics
    └── activity_improver.mjs # Suggests improvements to activities
```

### 5.2 Core Functions

#### Activity Registration
```javascript
register_activity({
  name: 'email_writing',
  description: 'Composing email messages',
  guidelines: ['email_subject_guideline', 'email_body_guideline'],
  related_data_types: ['email', 'communication'],
  related_activities: ['writing', 'communication'],
  suggested_models: ['gpt-4', 'claude-3'],
  improvement_metrics: ['clarity', 'response_rate']
})
```

#### Guideline Registration
```javascript
register_guideline({
  title: 'Email Subject Line',
  description: 'Guidelines for writing effective email subject lines',
  content: 'Email subjects MUST be concise and descriptive. Subjects SHOULD be under 50 characters. Subjects SHOULD NOT use all caps.',
  activities: ['email_writing'],
  priority: 'MUST',
  rationale: 'Clear subject lines improve email open rates and findability',
  examples: ['Meeting request: Budget review June 15', 'Question about Q2 sales report']
})
```

#### Activity Matching
```javascript
match_activities({
  request_text: 'Can you help me write an email to my team about the upcoming project deadline?',
  explicit_tags: ['writing'],
  user_context: { recent_activities: ['task_creation', 'scheduling'] }
})
// Returns: ['email_writing', 'team_communication']
```

#### Guideline Collection
```javascript
collect_guidelines({
  activities: ['email_writing', 'team_communication'],
  context: { importance: 'high', audience: 'internal' }
})
// Returns: [array of applicable guidelines]
```

## 6. Workflow Integration

### 6.1 Inference Request Workflow

1. User submits inference request
2. Activity matcher identifies relevant activities
3. Guideline manager collects applicable guidelines
4. Guidelines are included in model context
5. Models generate outputs following guidelines
6. Outputs are evaluated for guideline compliance
7. Best output is selected and returned

### 6.2 Task Management Workflow

1. Task is created
2. Task is associated with relevant activities
3. Guidelines for those activities are attached to task
4. Task processing follows attached guidelines
5. Task completion is evaluated against guidelines

### 6.3 Data Management Workflow

1. Data item is created or modified
2. Data is classified and associated with activities
3. Guidelines for those activities govern data handling
4. Data access and modification follow guidelines

## 7. Continuous Improvement

### 7.1 Activity Improvement

Activities are continuously improved through:

1. Performance monitoring of activity metrics
2. Identification of improvement opportunities
3. Creation of improvement tasks
4. Implementation of improvements
5. Evaluation of improvement impact

### 7.2 Guideline Improvement

Guidelines are continuously improved through:

1. Compliance monitoring
2. Effectiveness evaluation
3. User feedback collection
4. Guideline refinement
5. Version control of changes

### 7.3 Self-Improvement Loop

The system can recursively improve its own activities and guidelines:

1. System monitors its own performance
2. Improvement agent identifies enhancement opportunities
3. System proposes improvements to activities and guidelines
4. Human reviews and approves changes
5. Approved changes are implemented and versioned

## 8. Example Activities and Guidelines

### 8.1 Email Writing Activity

```javascript
{
  activity_id: 'email_writing',
  name: 'Email Writing',
  description: 'Composing email messages for various purposes',
  guidelines: ['email_subject_guideline', 'email_body_guideline', 'email_tone_guideline'],
  related_data_types: ['email', 'communication'],
  related_activities: ['writing', 'communication'],
  suggested_models: ['gpt-4', 'claude-3'],
  improvement_metrics: ['clarity', 'response_rate', 'sentiment']
}
```

### 8.2 Email Subject Guideline

```javascript
{
  guideline_id: 'email_subject_guideline',
  title: 'Email Subject Line',
  description: 'Guidelines for writing effective email subject lines',
  content: `
    Email subjects MUST be concise and descriptive.
    Subjects SHOULD be under 50 characters.
    Subjects SHOULD NOT use all caps except for acronyms.
    Subjects SHOULD include keywords relevant to the email content.
    Subjects MAY include urgency indicators for time-sensitive matters.
  `,
  activities: ['email_writing'],
  priority: 'MUST',
  rationale: 'Clear subject lines improve email open rates and findability',
  examples: [
    'Meeting request: Budget review June 15',
    'Question about Q2 sales report',
    'URGENT: System outage response needed'
  ]
}
```

## 9. Conclusion

The Activity and Guideline System provides a flexible, extensible framework for organizing and improving system operations. By classifying actions into activities and governing them with guidelines, the system can:

1. Provide context-aware processing
2. Ensure consistent application of best practices
3. Enable targeted improvement of system components
4. Support effective multi-model comparison
5. Create a self-improving loop

This system is central to the human-in-the-loop agent architecture, enabling both powerful automation and meaningful human oversight. 