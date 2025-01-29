export const default_repos = [
  'mistakia/nano-community',
  'mistakia/league',
  'mistakia/personal',
  'mistakia/properties',
  'mistakia/base',
  'mistakia/parcels'
]

const task_labels = [
  {
    name: 'priority/critical',
    color: 'b60205',
    description: 'should be addressed before its too late'
  },
  {
    name: 'priority/high',
    color: 'd93f0b',
    description: 'should be addressed soon when there is time'
  },
  {
    name: 'priority/medium',
    color: 'e99695',
    description: 'good to have but can wait until its convenient'
  },
  {
    name: 'priority/low',
    color: 'f9d0c4',
    description: 'not a priority right now'
  },
  {
    name: 'kind/docs',
    color: 'c7def8',
    description: 'documentation related'
  },
  {
    name: 'kind/content',
    color: 'c7def8',
    description: 'displayed information'
  },
  {
    name: 'kind/infrastructure',
    color: 'c7def8',
    description: 'infrastructure related'
  },
  {
    name: 'kind/data',
    color: 'c7def8',
    description: 'data related'
  },
  {
    name: 'kind/bug',
    color: 'fc2929',
    description: 'an unintended behavior'
  },
  {
    name: 'kind/enhancement',
    color: 'c7def8',
    description: 'a net-new feature or improvement to an existing feature'
  },
  {
    name: 'kind/performance',
    color: 'c7def8',
    description: 'improving the performance of the project'
  },
  {
    name: 'kind/maintenance',
    color: 'c7def8',
    description: "work required to maintain the project's status quo"
  },
  {
    name: 'kind/test',
    color: 'c7def8',
    description: 'work related to testing'
  },
  {
    name: 'need/triage',
    color: 'ededed',
    description: 'needs initial labeling and prioritization'
  },
  {
    name: 'effort/minutes',
    color: 'fef2c0',
    description: 'estimated to take one or several minutes'
  },
  {
    name: 'effort/hours',
    color: 'fef2c0',
    description: 'estimated to take one or several hours'
  },
  {
    name: 'status/planned',
    color: 'dcc8e0',
    description: 'doing this in the near future'
  },
  {
    name: 'status/started',
    color: 'dcc8e0',
    description: 'started but not on going'
  },
  {
    name: 'status/waiting',
    color: 'dcc8e0',
    description: 'waiting for something external to happen'
  },
  {
    name: 'status/blocked',
    color: 'b52ed1',
    description:
      'unable to be worked further until another internal task is completed'
  },
  {
    name: 'status/paused',
    color: 'dcc8e0',
    description: 'decision has been made to not continue working on this'
  },
  {
    name: 'status/inactive',
    color: 'dcc8e0',
    description:
      'started but there has been no significant work in the previous month'
  },
  {
    name: 'status/in-progress',
    color: 'dcc8e0',
    description: 'currently being worked on day to day'
  },
  {
    name: 'status/ready',
    color: 'dcc8e0',
    description: 'ready to be worked on'
  },
  {
    name: 'status/duplicate',
    color: 'e9dfeb',
    description: 'this issue or pull request already exists'
  }
]

const project_labels = [
  {
    name: 'projects/home',
    color: 'dcc8e0',
    description: 'living space organization and design project',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'projects/land',
    color: 'dcc8e0',
    description: 'land research and purchase project',
    repos: ['mistakia/personal', 'mistakia/parcels']
  },
  {
    name: 'projects/homelab',
    color: 'dcc8e0',
    description: 'onsite server and network project',
    repos: ['mistakia/personal', 'mistakia/base']
  }
]

const location_labels = [
  {
    name: 'location/1 Alley Lot Place NW',
    color: 'D48146',
    description: '1 Alley Lot Place NW location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/14 N ST NW',
    color: '7FBDD6',
    description: '14 N ST NW location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/40 Rhode Island Unit A',
    color: 'c5def5',
    description: '40 Rhode Island Unit A location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/40 Rhode Island Unit B',
    color: 'AE9C93',
    description: '40 Rhode Island Unit B location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/55 U ST NW Unit A',
    color: 'c5def5',
    description: '55 U ST NW Unit A location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/55 U ST NW Unit B',
    color: '357A9F',
    description: '55 U ST NW Unit B location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/2914 Dawson Ave',
    color: 'BF0E67',
    description: '2914 Dawson Ave location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/9808 Betteker Lane',
    color: '0CD772',
    description: '9808 Betteker Lane location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/10719 Kings Riding Way #102',
    color: '295FEE',
    description: '10719 Kings Riding Way #102 location',
    repos: ['mistakia/properties', 'mistakia/personal']
  },
  {
    name: 'location/11510 Seven Locks Rd',
    color: 'D9DE8A',
    description: '11510 Seven Locks Rd location',
    repos: ['mistakia/properties', 'mistakia/personal']
  }
]

export const labels = [...task_labels, ...project_labels, ...location_labels]
