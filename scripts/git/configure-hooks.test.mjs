import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  configureHooks,
  configuredHookPaths,
  HOOKS_PATH,
} from './configure-hooks.mjs';

describe('configureHooks()', () => {
  let root;
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'otel-git-hooks-'));
    git('init', '-q');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('enables, reports, and disables the repository hooks', () => {
    assert.deepStrictEqual(configuredHookPaths(root), []);
    assert.match(configureHooks(root, 'status'), /disabled/);

    assert.match(configureHooks(root, 'enable'), /enabled/);
    assert.deepStrictEqual(configuredHookPaths(root), [HOOKS_PATH]);
    assert.match(configureHooks(root, 'status'), /enabled/);

    assert.match(configureHooks(root, 'disable'), /disabled/);
    assert.deepStrictEqual(configuredHookPaths(root), []);
    assert.match(configureHooks(root, 'disable'), /already disabled/);
  });

  it('does not replace or remove a contributor-owned hooks path', () => {
    git('config', '--local', 'core.hooksPath', '.custom-hooks');

    assert.throws(
      () => configureHooks(root, 'enable'),
      /refusing to replace existing core\.hooksPath: \.custom-hooks/,
    );
    assert.throws(
      () => configureHooks(root, 'disable'),
      /refusing to remove existing core\.hooksPath: \.custom-hooks/,
    );
    assert.deepStrictEqual(configuredHookPaths(root), ['.custom-hooks']);
  });

  it('configures a path that Git invokes on commit', () => {
    const hooksDir = path.join(root, HOOKS_PATH);
    const marker = path.join(root, 'hook-ran');
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(
      path.join(hooksDir, 'pre-commit'),
      `#!/bin/sh\ntouch '${marker}'\n`,
    );
    chmodSync(path.join(hooksDir, 'pre-commit'), 0o755);
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    writeFileSync(path.join(root, 'file.txt'), 'content\n');
    git('add', 'file.txt');

    configureHooks(root, 'enable');
    git('commit', '-qm', 'exercise hook');

    assert.ok(existsSync(marker), 'the configured pre-commit hook ran');
  });

  it('rejects unknown actions without changing Git config', () => {
    assert.throws(
      () => configureHooks(root, 'maybe'),
      /expected enable, disable, or status/,
    );
    assert.deepStrictEqual(configuredHookPaths(root), []);
  });
});
