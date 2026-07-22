const fs = require('fs');

async function main(env = process.env, fetcher = globalThis.fetch) {
  const apiUrl = (env.GITHUB_API_URL || '').replace(/\/$/, '');
  const token = env.GITHUB_TOKEN;
  const [owner, repo] = (env.GITHUB_REPOSITORY || '').split('/');
  const event = loadEvent(env.GITHUB_EVENT_PATH);
  const prIndex = event?.pull_request?.number;

  const identifier = getInput('identifier', env);
  const body = getInput('body', env);

  if (!apiUrl) throw new Error('GITHUB_API_URL is not set');
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY is not set');
  if (!body) throw new Error('Input body is required');
  if (!prIndex) {
    console.log('Not a pull_request event. Skipping.');
    return;
  }

  const marker = identifier ? `<!-- pr-comment-action:${identifier} -->` : null;
  const bodyWithMarker = marker ? `${body}\n\n${marker}` : body;

  const headers = {
    'Authorization': `token ${token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  let existingId = null;

  if (marker) {
    const comments = await listComments(apiUrl, owner, repo, prIndex, headers, fetcher);
    const existing = comments.find((c) => c.body && c.body.includes(marker));
    if (existing) existingId = existing.id;
  }

  let comment;
  if (existingId) {
    comment = await updateComment(apiUrl, owner, repo, existingId, bodyWithMarker, headers, fetcher);
    console.log(`Updated comment ${comment.id}`);
  } else {
    comment = await createComment(apiUrl, owner, repo, prIndex, bodyWithMarker, headers, fetcher);
    console.log(`Created comment ${comment.id}`);
  }

  setOutput('comment-id', String(comment.id), env.GITHUB_OUTPUT);
}

function getInput(name, env = process.env) {
  const envName = 'INPUT_' + name.replace(/-/g, '_').toUpperCase();
  return (env[envName] || '').trim();
}

function setOutput(name, value, outputPath = process.env.GITHUB_OUTPUT) {
  if (outputPath) {
    fs.appendFileSync(outputPath, `${name}=${value}\n`, { encoding: 'utf8' });
  }
  console.log(`::set-output name=${name}::${value}`);
}

function loadEvent(path = process.env.GITHUB_EVENT_PATH) {
  if (!path) return null;
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    return null;
  }
}

async function listComments(base, owner, repo, index, headers, fetcher = globalThis.fetch) {
  const all = [];
  for (let page = 1; ; page++) {
    const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(index)}/comments?limit=100&page=${page}`;
    const res = await fetcher(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list comments: ${res.status} ${res.statusText} - ${text}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function createComment(base, owner, repo, index, body, headers, fetcher = globalThis.fetch) {
  const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${encodeURIComponent(index)}/comments`;
  const res = await fetcher(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create comment: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

async function updateComment(base, owner, repo, id, body, headers, fetcher = globalThis.fetch) {
  const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/comments/${encodeURIComponent(id)}`;
  const res = await fetcher(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update comment: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { main, getInput, setOutput, loadEvent, listComments, createComment, updateComment };
