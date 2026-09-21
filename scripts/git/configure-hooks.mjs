#!/usr/bin/env node

// Opt-in management for this repository's native Git hooks. This deliberately
// uses core.hooksPath instead of a package dependency: setup works after clone,
// and enabling hooks does not widen the npm install surface.

import { execFileSync, spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const HOOKS_PATH = 'scripts/git';

function git(rootDir, ...args) {
  return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim();
}

export function configuredHookPaths(rootDir) {
  const result = spawnSync(
    'git',
    ['config', '--local', '--get-all', 'core.hooksPath'],
    { cwd: rootDir, encoding: 'utf8' },
  );
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'failed to read core.hooksPath');
  }
  return result.stdout.trim().split('\n').filter(Boolean);
}

export function configureHooks(rootDir, action) {
  const current = configuredHookPaths(rootDir);

  if (action === 'enable') {
    if (current.length > 0 && !current.every((p) => p === HOOKS_PATH)) {
      throw new Error(
        `refusing to replace existing core.hooksPath: ${current.join(', ')}`,
      );
    }
    git(
      rootDir,
      'config',
      '--local',
      '--replace-all',
      'core.hooksPath',
      HOOKS_PATH,
    );
    return `Git hooks enabled from ${HOOKS_PATH}.`;
  }

  if (action === 'disable') {
    if (current.length === 0) return 'Git hooks are already disabled.';
    if (!current.every((p) => p === HOOKS_PATH)) {
      throw new Error(
        `refusing to remove existing core.hooksPath: ${current.join(', ')}`,
      );
    }
    git(rootDir, 'config', '--local', '--unset-all', 'core.hooksPath');
    return 'Repository Git hooks disabled.';
  }

  if (action === 'status') {
    if (current.length === 0) return 'Git hooks are disabled.';
    if (current.every((p) => p === HOOKS_PATH)) {
      return `Git hooks are enabled from ${HOOKS_PATH}.`;
    }
    return `A custom Git hooks path is configured: ${current.join(', ')}`;
  }

  throw new Error(
    `unknown action '${action}'; expected enable, disable, or status`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  try {
    const rootDir = git(process.cwd(), 'rev-parse', '--show-toplevel');
    console.log(configureHooks(rootDir, process.argv[2]));
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
