# Frame Home review evidence

Parent: [OpenPond integration, performance and security working doc](../2026-09-20-openpond-integration-performance-security.md).

Source baseline: `8a3d79eaedf81329f84acbd56cfccf62fb786df3`. Commands run from the Frame Home repository root. This directory contains investigation artifacts, not production fixes.

## Boundary probes

```bash
npm run test:exec -- --env=node --roots test docs/working-docs/frame-home/evidence --runTestsByPath docs/working-docs/frame-home/evidence/audit-boundaries.test.js --testTimeout=5000
```

Seven probes passed: HTTP wrapper bypass, WebSocket wrapper bypass, cross-origin poll queue consumption, scheme-collapsed origin identity, scheduler starvation, timeout without cancellation, and cross-chain quote overwrite. These assertions **expect the baseline bugs** and are retained as historical evidence; they are not expected to pass against repaired source. Active regression tests now live in `test/main/api/boundaries.test.js` and `test/main/windows/sender.test.js`; a green result here is not a security endorsement.

The HTTP/WS handlers, provider, request mapping, scheduler, controller, rate handler and portfolio function are real source modules. Accounts, chains, store/infrastructure, workers and sockets are mocked; requests use in-memory events and fake timers. No listener is opened, no real wallet is loaded, and nothing is signed or broadcast. The polling probe assumes a known synthetic poll ID and injects an event already authorized for the owner; it proves missing ownership enforcement, not poll-ID discovery.

Scheduler evidence over ten simulated minutes: six accounts with 59-second scans started `[6, 6, 5, 5, 0, 0]` times. Timeout evidence: the controller rejected after 60 seconds while sending no cancellation and leaving the worker alive. Quote evidence: one unit each at $1 and $20 across two chains produced a $40 portfolio instead of $21.

## Performance artifacts

- [portfolio-benchmark.cjs](./portfolio-benchmark.cjs) executes the real portfolio derivation against synthetic fixtures; [results](./portfolio-benchmark.json) record the CPU/runtime, fixture dimensions, sample count and median/p95. Run `node docs/working-docs/frame-home/evidence/portfolio-benchmark.cjs`; an optional output filename saves JSON. It reads source only, not profile data. Babel transformation executes the source as CommonJS in a VM context, so these are microbenchmark results, not renderer latency measurements.
- [sample-process-cpu.py](./sample-process-cpu.py) samples `/proc` counters for already-running Frame Home processes over three ten-second windows; [results](./process-cpu.json) record aggregate CPU by role, with 100% meaning one logical core. It does not read process environments, wallet profiles or memory contents. Run `python3 docs/working-docs/frame-home/evidence/sample-process-cpu.py`; an optional output filename saves JSON. The workload is uncontrolled and the results are not a function-level profile.

Packaged modules matched the current compiled files when extracted read-only from `dist/home/linux-unpacked/resources/app.asar` using `@electron/asar.extractFile`:

| Module                                              | SHA-256                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `compiled/main/externalData/portfolio.js`           | `1177e0a61a7780d258ef188024f2e071e9bde3d2ba99cb33811c046c4c62ec98` |
| `compiled/main/externalData/balances/worker.js`     | `dc91dc8d46430f4b8b9bcd0ce5eaa66e073b7ff624066644ebf30fe851a36f68` |
| `compiled/main/externalData/balances/controller.js` | `5c51cab3a6c085d01b6dfecf79c5dbb9cfb475b8d879d3f329f8e65092a2c819` |

This comparison covers those files on disk; it is not a cryptographic attestation of the entire running process.

## Dependency and release evidence

[dependency-audit-summary.json](./dependency-audit-summary.json) is a selected, credential-free summary of `npm audit --json --ignore-scripts`. Registry-reported counts include development and transitive dependencies; exploit reachability was not established for each advisory. No dependency fix was applied.

GitHub API checks returned no fork releases and zero fork Actions runs. Original `floating/frame` latest release was v0.6.11, published 2025-02-03, with Linux/macOS/Windows installers. See the parent document for release links, source anchors and implementation gates.

## Implementation follow-up

The active regressions invert the reproduced failures. All accounts now receive turns (`[4,4,4,4,3,3]`), timeout stops the worker, and distinct chain quotes total $21. `portfolio-benchmark-after.json` records the updated derivation with chain-qualified fixture prices. This is a microbenchmark, not proof of a process CPU or UI latency improvement. The original process sample is retained unchanged.
