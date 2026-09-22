import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function validateRelease(tag, cwd = process.cwd()) {
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag || '')) {
    throw new Error('Use a version tag such as v0.6.12-home.1')
  }
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  const sha = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
  git('merge-base', '--is-ancestor', sha, 'refs/remotes/origin/develop')
  const { version } = JSON.parse(git('show', `${sha}:package.json`))
  if (tag !== `v${version}`) throw new Error('Release tag must match package.json version')
  return { sha, tag }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sha, tag } = validateRelease(process.env.RELEASE_TAG)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `sha=${sha}\ntag=${tag}\n`)
  console.log(`Validated ${tag} at ${sha}`)
}
