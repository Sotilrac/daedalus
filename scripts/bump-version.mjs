#!/usr/bin/env node
// Bump the project version in every place that hard-codes it. The root
// package.json is the source of truth; other files mirror it.
//
// Usage:
//   node scripts/bump-version.mjs <new-version>
//   node scripts/bump-version.mjs patch | minor | major
//
// Files touched:
//   - package.json                                       (root)
//   - packages/desktop/src-tauri/Cargo.toml              ([package] version line)
//   - packages/desktop/src-tauri/tauri.conf.json         (top-level "version")
//   - packages/desktop/src-tauri/Cargo.lock              (the daedalus crate entry)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/;

const arg = process.argv[2];
if (!arg) {
  console.error('usage: bump-version.mjs <new-version|patch|minor|major>');
  process.exit(1);
}

const rootPkgPath = resolve(ROOT, 'package.json');
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
const current = rootPkg.version;

const next = resolveNext(current, arg);
if (next === current) {
  console.log(`already at ${current}, nothing to do`);
  process.exit(0);
}

writeJson(rootPkgPath, { ...rootPkg, version: next });

const cargoPath = resolve(ROOT, 'packages/desktop/src-tauri/Cargo.toml');
const cargo = readFileSync(cargoPath, 'utf8');
// Anchored to start-of-line so only the [package] crate version matches —
// dependency entries write `version = "..."` inside `{ ... }` inline tables
// and never appear at column 0.
const cargoNext = cargo.replace(/^version = "[^"]+"/m, `version = "${next}"`);
if (cargoNext === cargo) fail(`Cargo.toml: failed to find a [package] version line`);
writeFileSync(cargoPath, cargoNext);

const confPath = resolve(ROOT, 'packages/desktop/src-tauri/tauri.conf.json');
const conf = JSON.parse(readFileSync(confPath, 'utf8'));
writeJson(confPath, { ...conf, version: next });

const lockPath = resolve(ROOT, 'packages/desktop/src-tauri/Cargo.lock');
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, 'utf8');
  // Replace the `version = "..."` line that immediately follows
  // `name = "daedalus"`. Limit to the first match — the lockfile is one entry
  // per crate, so there's exactly one block named `daedalus`.
  const lockNext = lock.replace(
    /(name = "daedalus"\nversion = ")[^"]+(")/,
    (_, head, tail) => `${head}${next}${tail}`,
  );
  if (lockNext === lock) {
    console.warn('warning: Cargo.lock present but no daedalus entry was rewritten');
  } else {
    writeFileSync(lockPath, lockNext);
  }
}

// Reformat the JSON files so they keep prettier's canonical layout — JSON.stringify
// always splits arrays one-per-line, but prettier collapses short arrays inline.
formatJson([rootPkgPath, confPath]);

console.log(`bumped ${current} → ${next}`);

function formatJson(files) {
  const r = spawnSync('npx', ['prettier', '--write', ...files], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.warn('warning: prettier --write failed; run `make format` to clean up');
  }
}

function resolveNext(current, arg) {
  if (SEMVER.test(arg)) return arg;
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(current);
  if (!m) fail(`current version "${current}" is not semver; pass an explicit version`);
  let [, major, minor, patch] = m;
  major = Number(major);
  minor = Number(minor);
  patch = Number(patch);
  switch (arg) {
    case 'patch':
      patch += 1;
      break;
    case 'minor':
      minor += 1;
      patch = 0;
      break;
    case 'major':
      major += 1;
      minor = 0;
      patch = 0;
      break;
    default:
      fail(`unrecognised bump "${arg}"; expected semver or patch|minor|major`);
  }
  return `${major}.${minor}.${patch}`;
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}
