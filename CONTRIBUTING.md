# Changes and releases

Frame Home uses one integration branch, `develop`. There is no separate `master` or `main` release branch. Work in `feat/<description>` branches and open pull requests against `develop`.

## Pull requests

1. Implement the change with focused regression coverage.
2. Run `npm run compile`, `npm run test:unit`, and `npm run bundle`. CI uses Node 22 on Ubuntu 22.04; native builds need `build-essential`, `libudev-dev`, and `libusb-1.0-0-dev`.
3. Push the feature branch and open a PR into `develop`.
4. Wait for the required **Verify** check and resolve review conversations, then merge. Branch protection requires an up-to-date branch and passing verification; force pushes and branch deletion are disabled. Reviewer approval is not mandatory for this solo-maintainer fork.

The Verify workflow installs locked dependencies with the existing lifecycle-script allowlist, validates the release-tag guard, compiles, runs all unit suites, bundles all renderers, and packages a Linux x64 Frame Home archive. Its downloadable archive includes a SHA-256 manifest. PR artifacts are development builds, not published releases.

## Releases

Merging into `develop` does **not** publish a release. Releases are explicit and produce a draft for review:

1. Update the version in `package.json` and `package-lock.json` in a PR. Use a fork prerelease version where appropriate, for example `0.6.12-home.1`.
2. Merge the PR after Verify passes.
3. Tag that exact merged commit with the corresponding `v` version and push the tag. Alternatively, manually run **Draft Frame Home release** with an existing tag.
4. The workflow requires the tag to match `package.json` and point to a commit reachable from `develop`. It reruns Verify against the exact tagged commit and attaches the resulting archive and checksums to a new draft. It never deletes or replaces an existing release.
5. Inspect the draft, check the checksum, and smoke-test the extracted app in an isolated profile before manually publishing it on GitHub.

Initial automated packaging supports **Linux x64 tar.gz** using `build/electron-builder-home.js`, with the Frame Home identity and upstream publishing disabled. macOS/Windows installers and signing/notarization need a separate validated setup. Do not use the inherited `npm run publish` or `npm run release` commands for this fork; they target upstream packaging.

The current Electron/dependency upgrade and hardware-wallet/package compatibility work remain release gates described in the [working doc](docs/working-docs/frame-home/2026-09-20-openpond-integration-performance-security.md). A green unit/build check does not complete those gates. No release tag or public release is created merely by adopting this workflow.
