const { describe, it, expect, beforeEach, afterEach, jest: jestGlobal } = require('@jest/globals');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { main, getInput, setOutput, loadEvent, listComments, createComment, updateComment } = require('./index');

let envBackup = {};

beforeEach(() => {
  envBackup = {};
  Object.keys(process.env).forEach((key) => {
    if (/^(GITHUB|INPUT_)/.test(key)) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }
  });
});

afterEach(() => {
  Object.assign(process.env, envBackup);
});

function mockResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe('getInput', () => {
  it('reads env INPUT_* variables', () => {
    expect(getInput('body', { INPUT_BODY: 'hello' })).toBe('hello');
  });

  it('replaces dashes with underscores', () => {
    expect(getInput('my-identifier', { INPUT_MY_IDENTIFIER: 'foo' })).toBe('foo');
  });

  it('trims whitespace', () => {
    expect(getInput('body', { INPUT_BODY: '  hello  ' })).toBe('hello');
  });

  it('returns empty string when missing', () => {
    expect(getInput('body', {})).toBe('');
  });
});

describe('loadEvent', () => {
  const tmpFile = path.join(os.tmpdir(), 'event.json');

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  it('parses event file', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ pull_request: { number: 42 } }));
    expect(loadEvent(tmpFile)).toEqual({ pull_request: { number: 42 } });
  });

  it('returns null when path missing', () => {
    expect(loadEvent()).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    fs.writeFileSync(tmpFile, 'not json');
    expect(loadEvent(tmpFile)).toBeNull();
  });
});

describe('setOutput', () => {
  const tmpFile = path.join(os.tmpdir(), 'github_output');

  beforeEach(() => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  });

  it('writes to GITHUB_OUTPUT', () => {
    const log = jestGlobal.spyOn(console, 'log').mockImplementation(() => {});
    setOutput('comment-id', '123', tmpFile);
    expect(fs.readFileSync(tmpFile, 'utf8')).toBe('comment-id=123\n');
    log.mockRestore();
  });

  it('skips file write when path missing', () => {
    const log = jestGlobal.spyOn(console, 'log').mockImplementation(() => {});
    setOutput('comment-id', '123', undefined);
    log.mockRestore();
  });
});

describe('listComments', () => {
  it('paginates through comments', async () => {
    const fetcher = jestGlobal.fn()
      .mockResolvedValueOnce(mockResponse(200, Array(100).fill({ id: 1, body: 'first' })))
      .mockResolvedValueOnce(mockResponse(200, []));

    const result = await listComments('https://api.example.com', 'owner', 'repo', 1, {}, fetcher);
    expect(result).toHaveLength(100);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws on non-ok response', async () => {
    const fetcher = jestGlobal.fn().mockResolvedValue(mockResponse(500, { error: 'fail' }));
    await expect(listComments('https://api.example.com', 'owner', 'repo', 1, {}, fetcher))
      .rejects.toThrow('Failed to list comments');
  });
});

describe('createComment', () => {
  it('creates comment', async () => {
    const fetcher = jestGlobal.fn().mockResolvedValue(mockResponse(201, { id: 99 }));
    const result = await createComment('https://api.example.com', 'owner', 'repo', 1, 'body', {}, fetcher);
    expect(result).toEqual({ id: 99 });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/repos/owner/repo/issues/1/comments',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ body: 'body' }) })
    );
  });

  it('throws on failure', async () => {
    const fetcher = jestGlobal.fn().mockResolvedValue(mockResponse(400, { error: 'bad' }));
    await expect(createComment('https://api.example.com', 'owner', 'repo', 1, 'body', {}, fetcher))
      .rejects.toThrow('Failed to create comment');
  });
});

describe('updateComment', () => {
  it('updates comment', async () => {
    const fetcher = jestGlobal.fn().mockResolvedValue(mockResponse(200, { id: 99 }));
    const result = await updateComment('https://api.example.com', 'owner', 'repo', 99, 'new body', {}, fetcher);
    expect(result).toEqual({ id: 99 });
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/repos/owner/repo/issues/comments/99',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ body: 'new body' }) })
    );
  });

  it('throws on failure', async () => {
    const fetcher = jestGlobal.fn().mockResolvedValue(mockResponse(400, { error: 'bad' }));
    await expect(updateComment('https://api.example.com', 'owner', 'repo', 99, 'body', {}, fetcher))
      .rejects.toThrow('Failed to update comment');
  });
});

describe('main', () => {
  const env = {
    GITHUB_API_URL: 'https://api.example.com/',
    GITHUB_TOKEN: 'token',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_EVENT_PATH: '',
    INPUT_BODY: 'Hello',
  };

  let eventFile;

  beforeEach(() => {
    eventFile = path.join(os.tmpdir(), `event-${Date.now()}.json`);
    fs.writeFileSync(eventFile, JSON.stringify({ pull_request: { number: 1 } }));
    env.GITHUB_EVENT_PATH = eventFile;
  });

  afterEach(() => {
    try { fs.unlinkSync(eventFile); } catch (_) {}
  });

  it('creates new comment without identifier', async () => {
    const fetcher = jestGlobal.fn().mockResolvedValue(mockResponse(201, { id: 42 }));
    const log = jestGlobal.spyOn(console, 'log').mockImplementation(() => {});
    await main(env, fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/repos/owner/repo/issues/1/comments',
      expect.objectContaining({ method: 'POST' })
    );
    log.mockRestore();
  });

  it('updates existing comment when identifier matches', async () => {
    env.INPUT_IDENTIFIER = 'my-id';
    const marker = '<!-- pr-comment-action:my-id -->';
    const fetcher = jestGlobal.fn()
      .mockResolvedValueOnce(mockResponse(200, [{ id: 7, body: marker }]))
      .mockResolvedValueOnce(mockResponse(200, { id: 7 }));
    const log = jestGlobal.spyOn(console, 'log').mockImplementation(() => {});
    await main(env, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][0]).toBe('https://api.example.com/repos/owner/repo/issues/comments/7');
    expect(fetcher.mock.calls[1][1].method).toBe('PATCH');
    log.mockRestore();
  });

  it('creates new comment when identifier not found', async () => {
    env.INPUT_IDENTIFIER = 'my-id';
    const fetcher = jestGlobal.fn()
      .mockResolvedValueOnce(mockResponse(200, []))
      .mockResolvedValueOnce(mockResponse(201, { id: 8 }));
    const log = jestGlobal.spyOn(console, 'log').mockImplementation(() => {});
    await main(env, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].method).toBe('POST');
    log.mockRestore();
  });

  it('throws when GITHUB_API_URL missing', async () => {
    await expect(main({ ...env, GITHUB_API_URL: '' })).rejects.toThrow('GITHUB_API_URL is not set');
  });

  it('throws when GITHUB_TOKEN missing', async () => {
    await expect(main({ ...env, GITHUB_TOKEN: '' })).rejects.toThrow('GITHUB_TOKEN is not set');
  });

  it('throws when GITHUB_REPOSITORY missing', async () => {
    await expect(main({ ...env, GITHUB_REPOSITORY: '' })).rejects.toThrow('GITHUB_REPOSITORY is not set');
  });

  it('skips when not pull_request event', async () => {
    fs.writeFileSync(eventFile, JSON.stringify({}));
    const log = jestGlobal.spyOn(console, 'log').mockImplementation(() => {});
    await main(env, jestGlobal.fn());
    expect(log).toHaveBeenCalledWith('Not a pull_request event. Skipping.');
    log.mockRestore();
  });

  it('throws when body missing', async () => {
    await expect(main({ ...env, INPUT_BODY: '' })).rejects.toThrow('Input body is required');
  });
});
