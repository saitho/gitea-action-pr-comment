# Gitea Pull Request Comment Action

Create a new pull request comment, or update an existing one identified by a unique marker.

## Usage

```yaml
- name: Post PR comment
  uses: saitho/gitea-action-pr-comment@v1
  if: gitea.event_name == 'pull_request'
  with:
    identifier: coverage-report
    body: |
      ## Coverage report
      Current coverage: **80 %**
```

## Inputs

| Input        | Required | Description                                                                           |
|--------------|----------|---------------------------------------------------------------------------------------|
| `body`       | yes      | Markdown body.                                                                        |
| `identifier` | no       | Unique string to identify a comment for updates. Omit to always create a new comment. |

## Context values

The action reads the Gitea context from the runner environment:

- `gitea.api_url` → `GITHUB_API_URL`
- `gitea.token` → `GITHUB_TOKEN`
- `gitea.repository` → `GITHUB_REPOSITORY`
- `gitea.event.pull_request.number` → `GITHUB_EVENT_PATH`

It is intended to run on `pull_request` events.

## Outputs

| Output       | Description                        |
|--------------|------------------------------------|
| `comment-id` | ID of the created/updated comment. |

## How it works

When an `identifier` is given, the action searches existing PR comments for the hidden HTML marker `<!-- pr-comment-action:{identifier} -->`. If found, the comment is updated. Otherwise a new comment is created and the marker is appended.
