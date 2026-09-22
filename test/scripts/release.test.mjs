import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validateRelease } from '../../scripts/validate-release.mjs'

test('release tags must match the version and belong to develop', (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'frame-release-'))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'develop')
  git('config', 'user.name', 'Release test')
  git('config', 'user.email', 'release-test@example.invalid')
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.6.12-home.1' }))
  git('add', 'package.json')
  git('commit', '-m', 'Version')
  const sha = git('rev-parse', 'HEAD')
  git('update-ref', 'refs/remotes/origin/develop', sha)
  git('tag', 'v0.6.12-home.1')
  assert.deepEqual(validateRelease('v0.6.12-home.1', cwd), { sha, tag: 'v0.6.12-home.1' })
  assert.throws(() => validateRelease('develop', cwd))
  assert.throws(() => validateRelease('v0.6.12-home.1\nsha=forged', cwd))
  git('tag', 'v0.6.13')
  assert.throws(() => validateRelease('v0.6.13', cwd), /must match/)
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ version: '0.6.14' }))
  git('commit', '-am', 'Unmerged version')
  git('tag', 'v0.6.14')
  assert.throws(() => validateRelease('v0.6.14', cwd))
})
