// import * as gql from 'gql-query-builder'
import fetch from 'node-fetch'

// https://docs.github.com/en/graphql/overview/explorer

export const get_github_project = async ({
  username,
  project_number,
  github_token
}) => {
  const query = `
    query {
      user(login: "${username}") {
        projectV2(number: ${project_number}) {
          id
          items(first: 100) {
            nodes {
              fieldValues(first: 100) {
                nodes {
                  ... on ProjectV2ItemFieldTextValue {
                    id
                    text
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                    }
                    item {
                      id
                      content {
                        ... on PullRequest {
                          id
                          url
                          body
                          bodyHTML
                          bodyText
                          title
                        }
                        ... on Issue {
                          id
                          url
                          body
                          bodyHTML
                          bodyResourcePath
                          bodyText
                          bodyUrl
                          title
                        }
                      }
                    }
                  }
                  ... on ProjectV2ItemFieldDateValue {
                    field {
                      ... on ProjectV2Field {
                        id
                        name
                      }
                    }
                    date
                  }
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    id
                    name
                    field {
                      ... on ProjectV2SingleSelectField {
                        id
                        name
                      }
                    }
                  }
                }
              }
              id
              content {
                ... on Issue {
                  id
                  url
                }
                ... on PullRequest {
                  id
                  url
                }
              }
            }
          }
        }
      }
    }`

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${github_token}`
    },
    body: JSON.stringify({ query })
  })
  const data = await response.json()

  return data
}
