# Gitea Pull Request Comment Action

Create a new pull request comment, or update an existing one identified by a unique marker.

## Usage

It is intended to run on `pull_request` events.

```yaml
jobs:
  comment:
    - name: Post PR comment
      uses: saitho/gitea-action-pr-comment@v1
      if: gitea.event_name == 'pull_request'
      env:
        GITHUB_TOKEN: "${{ gitea.token }}"
        GITHUB_EVENT_PATH: "${{ gitea.event_path }}"
        GITHUB_API_URL: "${{ gitea.api_url }}"
        GITHUB_REPOSITORY: "${{ gitea.repository }}"
      with:
        body: |
          ## Coverage report
          Current coverage: **80 %**
        identifier: coverage-report
```

Example reading a generated markdown file:

```yaml
jobs:
  coverage:
    - name: Run Code coverage
      run: echo 'Run your code coverage command here, generating code-coverage-results.md'
    - name: Prepare comment body
      if: gitea.event_name == 'pull_request'
      id: comment
      run: |
        echo "body<<EOF" >> "$GITHUB_OUTPUT"
        echo "# Coverage Report" >> "$GITHUB_OUTPUT"
        echo "$(cat code-coverage-results.md)" >> "$GITHUB_OUTPUT"
        echo "EOF" >> "$GITHUB_OUTPUT"
    - name: Post PR comment
      uses: saitho/gitea-action-pr-comment@v1
      if: gitea.event_name == 'pull_request'
      env:
        GITHUB_TOKEN: "${{ gitea.token }}"
        GITHUB_EVENT_PATH: "${{ gitea.event_path }}"
        GITHUB_API_URL: "${{ gitea.api_url }}"
        GITHUB_REPOSITORY: "${{ gitea.repository }}"
      with:
        body: ${{ steps.comment.outputs.body }}
        identifier: coverage-report
```

## Inputs

| Input        | Required | Description                                                                           |
|--------------|----------|---------------------------------------------------------------------------------------|
| `body`       | yes      | Markdown body.                                                                        |
| `identifier` | no       | Unique string to identify a comment for updates. Omit to always create a new comment. |

## Outputs

| Output       | Description                        |
|--------------|------------------------------------|
| `comment-id` | ID of the created/updated comment. |

## How it works

When an `identifier` is given, the action searches existing PR comments for the hidden HTML marker `<!-- pr-comment-action:{identifier} -->`. If found, the comment is updated. Otherwise a new comment is created and the marker is appended.
