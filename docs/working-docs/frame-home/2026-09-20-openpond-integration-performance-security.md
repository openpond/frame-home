# 2026-09-20 Frame Home: OpenPond integration, distribution, performance, and security

Status: investigation complete; proposed implementation plan. Application fixes, the OpenPond connector, and release installers are not implemented by this review.

Latest checkpoint: 2026-09-21. Keep Frame's wallet and integrate directly through OpenPond Connected Apps, exposing specific account-scoped capabilities through an authenticated local executor. Cast and MCP are removed from the proposed integration. The agent prepares operations; the user clicks Sign/Send in Frame. Any future unattended policy must be explicitly enabled by the user and cannot be granted or expanded by the agent. Repair the confirmed provider/IPC boundaries and scanner issues before agent transaction requests. Next proof: paired connected-app reads, then a user-approved transaction with durable status. Documentation and investigation only; no connector or fixes implemented.

Related documents and evidence:

- [Frame Home behavior and development guide](../../../FRAME_HOME.md).
- [OpenPond connected-app architecture](../../../../openpond/docs/working-docs/agent-harness/2026-07-04-connected-app-integration-tools.md).
- [OpenPond local distribution plan](../../../../openpond/docs/working-docs/cli/2026-07-14-npx-local-app-distribution.md).
- [OpenPond Connect public contract](../../../../openpond/docs/public/openpond-connect.md).
- [Reproduction instructions and evidence index](./evidence/README.md).

## Summary

The user wants Frame Home to be easy to install and run alongside `../openpond`, and wants OpenPond to work with their assets. The appropriate product is a locally paired wallet connection: OpenPond can inspect explicitly granted accounts, prepare operations, and request transactions; Frame Home holds the signing authority and displays the final approval. Read access and spending authority must be separate grants.

The existing HTTP/WebSocket provider is useful for dapps, but it is not sufficient as an authenticated agent-control API. It uses origin-based permissions, a globally selected account, and an approval UI. It has no OpenPond device pairing, per-task capability, durable agent request identifier, or per-account agent execution contract. The privileged renderer IPC API is also unsuitable as an external connector.

Performance should be addressed before adding another consumer. The main issue is not simply the one-second scheduler timer: it is the expensive work launched repeatedly, unfair account selection, overlapping work, and the updates delivered to all renderers. The holdings calculation itself becomes a meaningful synchronous cost with larger portfolios.

## Current Code Review

### Reviewed baselines

| Repository          | Reviewed state                                                                                                   | Scope                                                                                                                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frame Home          | `8a3d79eaedf81329f84acbd56cfccf62fb786df3`, `develop`; feature commit `16e5941ffd47b0fd20c06f4e07552a11b54537a5` | Source, packaging, provider boundary, IPC, balance scheduler, rates, renderer derivation, isolated probes, running process counters        |
| Original Frame base | `dac4378979fe1f490f4d0bf141dc19c201d2cb58`                                                                       | Comparison establishes that API permission/polling code and renderer RPC authority were inherited                                          |
| OpenPond            | `f11d6ba49eb0550dbada7f0c48e21756cfbc378f` plus the existing local `feat/task-inbox-coordination` working tree   | Connected-app contracts, runtime routing, provider tools, existing wallet catalog and documentation; unrelated active edits left untouched |

This is a focused application review, not a complete wallet cryptography, dependency, hardware-signer, or malicious-dapp audit. No real signing operation was exercised. The already-running app was observed through process counters only; wallet profiles and private keys were not read.

### What is published?

| Item                           | Verified status                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frame Home GitHub source       | Published and merged into [glucrypto/frame-home](https://github.com/glucrypto/frame-home), default branch `develop`, [PR #1](https://github.com/glucrypto/frame-home/pull/1)                 |
| Frame Home installer/release   | None: authenticated GitHub releases API returned an empty array; [fork releases](https://github.com/glucrypto/frame-home/releases) has no release artifacts                                  |
| Fork GitHub Actions executions | Zero runs returned during this review; remote build/release validation has not occurred                                                                                                      |
| Local Frame Home executable    | `dist/home/linux-unpacked/frame-home` exists and is running; this is an unpacked local build, not a published installation artifact                                                          |
| Original Frame installers      | Upstream [v0.6.11](https://github.com/floating/frame/releases/tag/v0.6.11), published 2025-02-03, provides Linux, macOS and Windows assets. These are the original Frame app, not Frame Home |

The Home packaging command is `npm run package:home`; it runs compilation, bundling, and `electron-builder --dir` using [the Home config](../../../build/electron-builder-home.js). That config sets `Frame Home`, `local.frame.home`, and Linux executable `frame-home`. It does not define a complete installer/release/update channel. The generic `build`, `publish`, and `release` scripts still use upstream packaging, and `package.json` still identifies `github:floating/frame`. The inherited [release workflow](../../../.github/workflows/build.yml) runs the upstream publish commands and expects upstream signing credentials. Enabling it unchanged is not the Home release solution.

`web3_clientVersion` still returns `Frame/v0.6.11` ([provider](../../../main/provider/index.ts#L815)), so it cannot reliably distinguish this fork from stock Frame. Both use provider port 1248 and dapp port 8421, bound to `127.0.0.1`. The fork currently shares Frame's default profile unless `FRAME_HOME_USER_DATA` is supplied. These are practical installation and discovery blockers.

### OpenPond integration points

| Anchor                                                                                                      | Current behavior and required extension                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Connected-app package](../../../../openpond/packages/connected-apps/src/index.ts#L1)                       | Owns catalog, provider families, skills, capabilities and operations. Includes a read-only Turnkey Agent Wallet; no `frame_home` provider or local-app connection source exists     |
| [Tool-call schema](../../../../openpond/packages/contracts/src/connected-app-tool-calls.ts#L9)              | Explicit provider enum must be extended together with the catalog; adding an icon alone will not register execution                                                                 |
| [Connection resolution](../../../../openpond/apps/server/src/openpond/connected-app-context.ts#L82)         | Re-resolves mentions against active `integration_connection` rows. A local device connection needs an equally trusted local resolver                                                |
| [Provider tool registry](../../../../openpond/apps/server/src/openpond/connected-app-tool-registry.ts#L243) | Checks available capabilities and operation schemas. Write intent is currently a nonempty `explicitUserIntent` string; that model-supplied text is not a wallet authorization token |
| [Provider executor](../../../../openpond/apps/server/src/openpond/connected-app-executor.ts#L41)            | Delegates to the cloud tool-call endpoint. It cannot reach a user's local wallet by treating the cloud machine's `localhost` as the user's device                                   |
| [App server runtime](../../../../openpond/apps/server/src/app-server-runtime.ts#L173)                       | Installs the cloud executor and cloud connection listing. Add explicit routing by execution location and combine local connection status with cloud status                          |

The existing team-scoped MCP catalog entry is unrelated to this integration. Frame will use a dedicated Connected Apps provider and local executor with pairing, account scope and wallet approval.

## Performance Findings

Priority means implementation urgency; proof labels distinguish actual measurements/reproductions from code-based likely contributors.

### P1 — High: slow account scans can starve later accounts

**Confirmed with fake-time execution of the real scheduler.** [portfolio.ts:38–58](../../../main/externalData/portfolio.ts#L38) traverses accounts from the beginning every second, has two slots, and makes each account eligible again 120 seconds after its **start**. Earlier accounts can become eligible again before the tail gets a first scan.

With six synthetic accounts, 59-second scans, two slots, and ten simulated minutes, scan starts were **`[6, 6, 5, 5, 0, 0]`**. The last two accounts never ran. This directly explains incomplete or persistently stale account refresh under slow RPC conditions, although it does not establish how frequently the real profile encounters that latency.

Fix: use a fair queue ordered by oldest successful/attempted completion or an explicit rotating cursor. A completed account must not jump ahead of an account that has not run in the cycle. Add backoff for failures, cancellation on removal/shutdown, and a no-starvation invariant under slow and timed-out calls.

### P2 — High: a timeout releases the scheduler slot without cancelling worker work

**Confirmed controller behavior.** [controller.ts:144–154](../../../main/externalData/balances/controller.ts#L144) rejects the promise after 60 seconds and removes it from the pending map. It sends no cancellation and does not terminate the work. The scheduler's rejection handler releases its slot. Meanwhile [worker.ts:131–138](../../../main/externalData/balances/worker.ts#L131) continues its RPC operations; the message handler accepts additional scans without a worker-side queue.

The isolated probe observed `scanAccount`, then heartbeats, but no cancellation or worker termination at timeout. Under slow/hung RPC, new logical slots can therefore coexist with old work. The advertised two-account limit bounds controller promises, not necessarily all work still executing.

Fix: enforce the work limit inside the worker as well as the scheduler; propagate deadlines/cancellation to transport calls where supported, discard late results by generation, and use bounded worker restart when cancellation cannot stop underlying work. Do not report a slot free until the actual execution has ended or been isolated.

### P3 — High: broad token discovery is repeated by two overlapping scan loops

**Code-confirmed repeated work; balance-worker CPU measured, individual function shares not profiled.** Home calls native balances, known-token balances, and catalog-wide discovery for every scanned account ([worker.ts:68–85 and 131–138](../../../main/externalData/balances/worker.ts#L68)). The original selected-account loop remains active every **20 seconds** ([balances/index.ts:13–15 and 166–198](../../../main/externalData/balances/index.ts#L13)). Home includes that selected account in its two-minute schedule and keeps the active scanner awake while Home is visible.

With N accounts and fast successful scans, this is approximately N Home discovery passes plus six selected-account discovery passes per two minutes, not merely N cheap balance lookups. Each pass can encode/decode thousands of token calls. Multicall reduces round trips but still batches **2,000 calls** and starts all batches concurrently ([multicall/index.ts:129–155](../../../main/multicall/index.ts#L129)); chains run in parallel, and non-multicall token calls also use an unbounded `Promise.all` within their list. Two account slots are not a global RPC concurrency budget.

Fix: one scheduler shared by Home, wallet and connected-app consumers. Refresh native/known balances frequently; discover unknown tokens on account addition, catalog/chain changes, explicit refresh, or a much slower configurable cadence. Share in-flight `(account, chain, scan-kind)` work, prioritize selected accounts without starving others, and cap total/per-chain RPC work.

### P4 — Medium: whole-main-state subscription repeatedly derives and renders the portfolio

**Pure calculation benchmark measured; React commit frequency remains to be profiled.** [HomeStore](../../../app/home/App.js#L204) subscribes to all `main`; [Home](../../../app/home/App.js#L19) derives the portfolio with `useMemo` depending on that entire object, even when another section is displayed. [portfolio.js](../../../app/home/portfolio.js) walks balances, builds BigNumbers, formats search data, groups accounts/assets, and sorts results. Token refreshes update `main.accounts.*.balances.lastUpdated` even when values have not changed ([actions](../../../main/store/actions/index.js#L129), [balance update](../../../main/externalData/balances/index.ts#L272)). Those updates invalidate the broad subscription.

Synthetic benchmark of the current derivation, five warmups and 25 samples on Node v24.18.0 / Intel i7-9700:

| Accounts × tokens each | Positions | Asset rows | Median calculation | p95 calculation |
| ---------------------- | --------: | ---------: | -----------------: | --------------: |
| 20 × 50                |     1,000 |         50 |           10.20 ms |        17.94 ms |
| 20 × 250               |     5,000 |        250 |           59.02 ms |        96.26 ms |
| 100 × 500              |    50,000 |        500 |          586.56 ms |       810.61 ms |

These are synthetic derivation timings, not measured UI latency or the user's actual holding count. They exclude DOM, IPC and network work and use a different Node version from Electron. They nevertheless identify a synchronous scaling cost worth removing.

Fix: subscribe to the specific balance/price/account-metadata inputs, separate freshness/status from portfolio data, derive only when Holdings is active, cache per-account normalized positions, and use indexed aggregation. Profile React commits before choosing virtualization; avoid reconstructing all holder lists on unrelated account metadata updates. A deferred search update can improve typing, but it does not remove the underlying computation.

### P5 — Medium: redundant updates amplify IPC, persistence and price subscription work

**Code-confirmed paths; contribution to observed main-thread time not separately measured.**

- Every store action batch is serialized and broadcast to every window, including hidden windows ([windows/index.ts:714–720](../../../main/windows/index.ts#L714)). All windows explicitly disable background throttling ([window.ts:28](../../../main/windows/window.ts#L28)).
- The persistence feed queues every update; `queue()` JSON-clones each value and writes pending data every 30 seconds ([store/index.ts:29](../../../main/store/index.ts#L29), [persist](../../../main/store/persist/index.ts#L24)). Installed `conf` serializes and synchronously writes its store. Home scan status is transient but is still sent through this feed.
- Every account scan sends the blacklist, and its handler loops over balances and known tokens for **all** accounts ([balances/index.ts:275](../../../main/externalData/balances/index.ts#L275)). Apply blacklist changes once per catalog revision instead.
- The portfolio token observer rebuilds the all-account price subscription when known tokens change, without comparing the resulting asset-ID set ([externalData/index.ts:106](../../../main/externalData/index.ts#L106), [assets/index.ts:68](../../../main/externalData/assets/index.ts#L68)). Deduplicate/collapse subscription changes.
- With no connected chains, the scheduler emits a new status object every second even if nothing changed ([portfolio.ts:34](../../../main/externalData/portfolio.ts#L34)). Suppress unchanged status.
- Balance reconciliation uses nested `find`/`every` scans ([balances/index.ts:233](../../../main/externalData/balances/index.ts#L233), [setBalances](../../../main/store/actions/index.js#L579)). Index by chain and normalized contract rather than repeatedly comparing arrays.

Fix: separate persisted state from transient operational state, coalesce balance/status changes, send window-specific projections or subscriptions, and suspend expensive hidden views while retaining signing/request delivery. Do not globally throttle the wallet approval UI without proving request responsiveness.

### Observed running-process baseline

Three 10-second samples of the already-running packaged app showed balance-worker CPU at **23.38%, 68.93%, 92.11%** of one logical core, averaging approximately **61.47%**. Main-process CPU was **6.09%, 11.39%, 15.19%**; three renderer processes together were **3.70%, 4.80%, 5.29%**. Twenty-eight signer workers were present but used 0.00% during these samples, so they are not the demonstrated CPU culprit. Their memory/startup cost was not measured.

The sampled workload and UI visibility were not controlled. No main/worker function-level CPU profile was attached to the real wallet. The packaged scheduler, balance worker, and controller bytes were compared to the current compiled modules and matched. See [process counters](./evidence/process-cpu.json) and [benchmark](./evidence/portfolio-benchmark.json).

## Security and Data-Integrity Findings

### S1 — High: wrapped RPC methods bypass the connection-permission check

**Confirmed with the real HTTP handler, WebSocket handler, request mapper and provider, using mocked accounts/chains. Inherited from the upstream base.** [HTTP](../../../main/api/http.ts#L100) and [WebSocket](../../../main/api/ws.ts#L124) check `protectedMethods` against the outer method. [Provider.send](../../../main/provider/index.ts#L996) subsequently unwraps [wallet_request/caip_request](../../../main/requests/index.ts) into their inner method. The wrappers are absent from [protectedMethods](../../../main/api/protectedMethods.ts).

The probe explicitly denies an origin's provider permission. Direct `eth_accounts` is denied; wrapping the same method in `wallet_request` returns the synthetic selected address on HTTP and WebSocket. `caip_request` also reproduces over HTTP. No permission request is created. Other protected inner methods take the same route; their individual downstream controls still need separate review.

Impact: unauthorized account disclosure and bypass of the origin connection gate. This does **not** establish silent signing or theft: `sendTransaction` and signature methods still construct approval requests downstream. Browser access also depends on the browser's localhost/network policies; a local client can reach the loopback listener. HTTP's permissive CORS is not an authorization substitute.

Fix: normalize/validate envelopes once **before authorization**, enforce the canonical method/account/chain policy at a shared entry point, reject unsupported/nested envelopes and conflicting routing fields, and ensure no alternate provider entry can bypass the same policy. Add negative transport tests for direct and wrapped accounts, assets, signing, raw broadcast and chain-management methods. The investigation tests must be inverted into denial regressions when fixed.

### S2 — Medium: HTTP polling queues are not bound to their owning origin

**Confirmed conditional cross-origin disclosure/drain. Inherited.** The server records a subscription's origin at [http.ts:147](../../../main/api/http.ts#L147), but [polling](../../../main/api/http.ts#L108) indexes the global queue solely by client-supplied `pollId`. It never checks queue ownership. `eth_pollSubscriptions` is unprotected.

With a known synthetic poll ID, a second origin read an event queued for the owner and drained it so the owner's next poll was empty. The proof injected an already-authorized provider event; it did not claim the second origin could obtain a private subscription by itself. Practical exploitation requires learning, guessing, reusing or colliding with a poll ID. The API also permits a missing `pollId` to become an empty string.

Fix: server-issued session IDs bound to authenticated connection/origin, owner checks for polling and unsubscription, rejection of empty IDs, bounded queues, expiry and cleanup. Review `Provider.ifSubRemove`, which removes by subscription ID without origin ownership, as part of this same boundary.

### S3 — Medium: origin identity collapses secure and insecure schemes

**Confirmed identity collision; no browser MITM exploit attempted. Inherited.** [parseOrigin](../../../main/api/origins.ts#L49) strips `http`, `https`, `ws` and `wss` schemes before permissions are looked up. The probe confirms `http://wallet.example` and `https://wallet.example` become the same permission identity. Content served from an insecure version of an approved host can consequently share its connection grant if it can reach the local API.

Fix: use canonical full origins for authorization and separate readable display names. Existing ambiguous stored grants should be re-approved rather than silently assigned to multiple schemes. For OpenPond native pairing, authenticate the client using its explicit pairing grant; a caller-chosen `Origin` header or extension identity is not native application authentication.

### S4 — Medium: public loopback request handling lacks explicit resource bounds

**Code-confirmed availability exposure, not stress-tested against the user's app. Inherited.** [HTTP body handling](../../../main/api/http.ts#L69) accumulates the entire body before parsing, without an application body-size cap. Invalid JSON-RPC returns after logging without ending the response. Subscription queues and pending requests lack explicit per-client quotas. [WebSocket construction](../../../main/api/ws.ts#L170) uses library defaults rather than an app-specific payload/concurrency policy.

Fix: small documented body/message limits, validated JSON-RPC schemas, bounded in-flight requests and event queues, explicit error responses, cancellation on disconnect, per-session rate limits, and safe logging that never dumps arbitrary request bodies. Test oversized, malformed and stalled requests using synthetic local servers. Loopback binding limits network exposure; it does not make untrusted local processes trustworthy.

### S5 — High-priority hardening: Home inherits privileged signing/approval IPC

**Code-confirmed excessive authority; no renderer-code-execution exploit demonstrated. Inherited authority, extended to the new Home window.** The [preload bridge](../../../resources/bridge/index.js) forwards generic renderer RPC/events/invocations. [main:rpc](../../../main/rpc/index.js#L316) dispatches without sender/window capability validation and exposes direct signing and approval methods ([methods](../../../main/rpc/index.js#L41), [approveRequest](../../../main/rpc/index.js#L146)). [tray:action](../../../main/index.ts#L322) accepts any matching store action. Home receives this same preload.

Existing sandboxing, context isolation, disabled Node integration, blocked navigation/new windows, and file-origin checks are useful controls. Their presence does not turn a renderer into an appropriate external wallet API. A compromised privileged renderer has much more authority than read-only holdings require. This review did not establish XSS, private-key extraction, or arbitrary remote IPC access.

Fix: explicit channel/method allowlists by window and validated sender frame, minimal Home read/navigation capabilities, and approval actions bound to a stored immutable request and the dedicated approval surface. OpenPond must use the new policy API, never `main:rpc`, `tray:action`, password entry, or automatic clicks on approval buttons. This matches [Electron's sender-validation guidance](https://www.electronjs.org/docs/latest/tutorial/security#17-validate-the-sender-of-all-ipc-messages).

### S6 — High-priority release blocker: unsupported runtime and dependency backlog

`package.json` pins **Electron 23.1.3**. This is an old runtime with published security fixes absent from the pin. For example, [Electron's context-isolation advisory](https://github.com/electron/electron/security/advisories/GHSA-p7v2-p9m8-qqg7) includes 23.1.3 in the affected version range. Its specific exploit prerequisites have not been demonstrated in Frame Home; version exposure is not an exploit proof. Upgrade to a currently supported, patched Electron line and validate the native signer modules, preload, permission handling and packaging; simply moving to the old advisory's minimum patch is not a supported-runtime strategy. See [Electron release policy](https://www.electronjs.org/docs/latest/tutorial/electron-timelines).

`npm audit --json --ignore-scripts` reported **109 vulnerable dependency entries: 10 critical, 56 high, 30 moderate, 13 low**, including development/transitive dependencies. These are registry findings, not 109 proven wallet vulnerabilities. The [saved summary](./evidence/dependency-audit-summary.json) includes selected Electron, ws, extraction and signing-library dependency paths. Separate shipped runtime reachability from build-tool exposure before choosing upgrades; do not use a blind `npm audit fix --force` on the wallet.

### C1 — High for agent decisions: token prices lose chain identity

**Confirmed with synthetic prices through the real rate handler and portfolio function.** The all-account subscription distinguishes `(chainId, address)`, but [rate storage](../../../main/externalData/assets/index.ts#L50) collapses updates to an address-only key; [portfolio lookup](../../../app/home/portfolio.js#L106) reads that same address-only key. Distinct assets at the same contract address on two chains therefore share whichever quote was stored last.

The probe supplied one token unit on each of two chains with prices $1 and $20. Home returned **$40 instead of $21**, while correctly retaining two asset rows. This is a portfolio valuation bug, not a demonstrated fund-transfer exploit. The underlying address-only quote model was inherited; broader Home aggregation and an agent reading the total make the consequence more important.

Fix: key prices by chain and normalized contract throughout the rate store, types, consumers and caches. Return price provenance and freshness with portfolio data. Never base spend limits, trade sizing, or approval solely on the displayed USD total. Token discovery currently also reports success after `getTokenBalances` has filtered failed calls; carry explicit partial-failure information rather than treating an empty discovery result as a complete scan ([worker](../../../main/externalData/balances/worker.ts#L77), [loader](../../../main/externalData/balances/scan.ts#L109), [multicall](../../../main/multicall/index.ts#L141)).

## Product Decision

### Direct Connected Apps integration with user-controlled signing

Keep Frame's wallet, account management, approval UI and signer implementations. Integrate through OpenPond's existing Connected Apps capability model with a Frame-specific local executor. Cast, MCP and a wallet rebuild are outside this plan.

```text
OpenPond Connected Apps / agent tools
  -> capability check and Frame local executor
  -> authenticated account-scoped Frame request service
  -> user reviews and clicks Sign/Send in Frame
  -> existing signer
  -> transaction/signature result and durable status in OpenPond
```

The user connects Frame once and chooses which accounts, networks and actions the agent may access. Approved reads should work without repeated wallet prompts. The agent can inspect holdings, prepare a supported operation, request approval, and follow its result. Granting proposal access does not grant signing authority. OpenPond presents clear preparing, awaiting signature, rejected, expired, submitted and confirmed states, with a way to open the matching Frame request. Return a durable request ID while waiting; reconnecting or retrying must not duplicate a send.

Frame owns the approval decision. The signed payload must match the reviewed request; edits require fresh approval. Signature requests are a separate permission and show the exact message or typed-data domain and contents. OpenPond must not expose an approval tool, unlock secrets, generic privileged RPC, or automatic clicks on wallet approval controls. Enforce this in Frame's request service and IPC boundary, not just in tool descriptions or model instructions. An agent with unrestricted same-user shell or desktop control is not isolated by a connector allowlist; deployment must account for that broader authority before claiming approvals cannot be bypassed.

The initial product requires user approval for each sign/send. A possible future **user-enabled auto-approval policy** would be a separate setting in the trusted wallet UI, with explicit accounts, actions, destinations/contracts, spend limits, expiry and revocation. The agent could operate only within that policy and could not create, enable, expand or override it. Chat text such as “skip approval” is not a wallet policy change. The user's exploratory question about an override does not authorize enabling unattended signing; that remains outside the initial delivery.

### Local connected-app experience

Recommend **Frame Home (Local)** in OpenPond's Apps page, with an explicit “Runs on this device” status. Keep the existing cloud Turnkey wallet as a separate product. A Frame connection should expose the chosen accounts, networks, capabilities, version, reachability, lock state and last verification time, without exporting signer material.

Default mode: approved reads plus **human-approved transactions in Frame Home**. The model may prepare a transaction and request approval; it cannot approve its own request. Persistent unattended spending is a separate later capability requiring explicit policy, restricted funding, and a different threat-model decision.

User flow: install a verified Home release → launch or discover the local app → pair in Frame Home → select accounts/networks and read/propose permissions → see the local connection in OpenPond → ask for holdings or a prepared operation → review exact effects in Frame Home → receive transaction status in OpenPond. Show offline, locked, awaiting approval, rejected and expired states distinctly. Connection permission alone must never mean “spend everything.”

## Implementation Shape

### Local transport and execution routing

```text
OpenPond chat / native tool
  -> local runtime capability resolution
  -> Frame Home connected-app local executor (bound to this device and pairing)
  -> authenticated local wallet policy API
  -> account-scoped request store
  -> Frame Home approval window
  -> existing signer implementation
  -> configured chain RPC
  -> receipt/status back to OpenPond
```

Prefer a Unix-domain socket on Linux/macOS and an ACL-restricted named pipe on Windows, with explicit pairing and protocol-version negotiation. If a loopback HTTP transport is needed, add authentication, exact origin/host validation, anti-replay/idempotency and quotas. Keep the legacy dapp port separate. Resolve endpoints from trusted local configuration; do not let tool arguments choose an arbitrary URL or executable.

Pairing creates a revocable local connection bound to a device, profile, permitted accounts/chains and capability set. Keep pairing credentials in protected local storage and out of model context, URLs, transcripts and cloud connector payloads. OS file permissions and same-user peer identity are useful but do not isolate secrets from unrestricted shell execution as that same OS user. Unattended agent execution therefore needs a dedicated restricted wallet and, for a stronger boundary, separate OS/sandbox authority and a narrowly scoped broker.

Extend OpenPond's shared catalog/schema, status resolver, mention resolver and executor composition together. Introduce an explicit execution location such as `local_device`; reject that capability in hosted/cloud runtimes unless an independently authenticated device bridge is deliberately added later. There must be no automatic cloud fallback for local wallet operations. Keep generic OAuth provider execution on its existing cloud path.

### Proposed capability contract

These operation names are proposals, not existing commands or methods.

| Capability                                  | Output / behavior                                                                                                            | Authority                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `frame_home.status`                         | Protocol/build version, profile instance ID, lock/reachability and supported capabilities                                    | Paired device metadata only                                           |
| `frame_home.accounts.read`                  | Only explicitly granted account IDs, addresses, labels and signer categories                                                 | Scoped read grant; no keys or signer internals                        |
| `frame_home.portfolio.read`                 | Chain-qualified assets, raw quantities, decimals, quote provenance, timestamps and partial/error flags; bounded pagination   | Account/chain read grant; cached reads do not launch full discovery   |
| `frame_home.transaction.prepare`            | Validated account/chain, resolved destination, calldata, value, fees, simulation summary, stable request ID and payload hash | Proposal grant; cannot sign or broadcast                              |
| `frame_home.transaction.request`            | Submit the immutable proposal to Frame Home's approval queue                                                                 | Exact account/chain policy plus user approval in Frame Home           |
| `frame_home.transaction.status` / `.cancel` | Idempotent status, rejection/expiry/cancellation, transaction hash and receipt where applicable                              | Same connection/request ownership; cancellation cannot undo broadcast |

Implement explicit `accountId` and chain identity without changing `selected.current`. The current provider and direct account signer methods rely on the globally selected account ([provider](../../../main/provider/index.ts#L548), [accounts](../../../main/accounts/index.ts#L668)); simply switching the UI account around a request creates races with dapps and other agent tasks. Bind and revalidate the intended account at preparation, approval and signing. Reuse signer implementations through an account-scoped request service, not an exposed direct-sign RPC.

Durable request states should cover prepared, awaiting approval, rejected, expired, signing, broadcast, confirmed, failed and cancelled. Bind idempotency keys to connection + normalized payload hash; a retry with a changed payload must fail. Persist enough state to reconcile a known transaction hash after restart rather than retrying an uncertain send as a new transaction. Validate recipient, chain, value, calldata, fee ceiling, token approval amount and any contract restrictions against the final signed payload. A model-generated `explicitUserIntent` string can explain the proposal but cannot satisfy this authorization.

Start with native transfers and a small explicitly specified contract-operation set. Arbitrary personal signatures, typed-data permits, unlimited token approvals, raw broadcast and arbitrary calldata are separate capabilities. Any later unattended policy needs per-asset/per-period limits, destination/contract restrictions, expiry, revocation, audit records and a clearly funded account boundary.

### Installation and launch plan

Keep Frame Home as a separately versioned desktop application; let OpenPond discover or launch a verified installation. Do not make OpenPond's basic startup compile Electron or download an unsigned wallet from a model-selected URL.

- Add release metadata that clearly identifies Frame Home, its build commit and bridge protocol version; use an independent Home version/release channel.
- Give the Home build explicit installer targets and explicit `glucrypto/frame-home` publish configuration. Add release checksums/provenance, license notices, platform signing/notarization where applicable, and an update policy for this fork.
- Use a distinct default Home profile with an explicit existing-Frame migration/import choice. Do not silently copy signer files or switch the existing installation's profile. Continue supporting an explicit `FRAME_HOME_USER_DATA` override for development/test isolation.
- Add a launcher/discovery helper that checks version/identity, reports port/profile conflicts, reuses a compatible running instance, and waits for authenticated readiness. Failure must not silently connect to stock Frame on port 1248.
- Validate Linux x64 first with the current local build; macOS/Windows installers and hardware-signing compatibility require separate runtime proof.
- Add a documented development workflow alongside OpenPond's existing `pnpm dev`. Reuse the running app when possible. A future single development command can orchestrate the two local processes, but no such combined command exists yet.

Current manual Home build/run remains:

```bash
# In frame-home; dependencies already installed, otherwise first run npm run setup:ci.
npm run package:home
FRAME_HOME_USER_DATA="/absolute/path/to/dedicated-home-profile" ./dist/home/linux-unpacked/frame-home
```

The executable needs the rest of its unpacked directory. Stock Frame and Frame Home currently cannot use the same fixed provider/dapp ports concurrently. The isolated smoke test avoids this conflict using synthetic data and a test transport; that is not a production port configuration feature.

## Boundaries

- This change set contains the working document and audit evidence only. No application fixes, wallet settings, approvals, transfers, releases, connector deployment, or OpenPond source edits were made.
- Do not expose renderer IPC as the connector, export private keys, give the model wallet passwords, or automate the wallet's approval UI.
- Read-only connection grants must not imply permission to sign. Untrusted token metadata, dapp content, or tool output must not widen grants.
- Real-wallet operation and public distribution should follow the security and dependency remediation gates below. Findings have not been sent upstream or published as issues by this review.
- Avoid unrelated rewrites of OpenPond's active task-inbox work. The connected-app contracts should be extended coherently, without introducing a second competing cloud OAuth path.

## Phases

### Phase 0 — Establish evidence and architecture

- [x] Verify repository/release state and trace OpenPond's executor and catalog.
- [x] Reproduce permission, polling, origin, scheduling, timeout and quote issues using synthetic data.
- [x] Record process CPU and synthetic portfolio scaling. Preserve the original evidence and add an after-change portfolio benchmark.

Function-level worker/main/React profiling remains follow-up work. The process sample is uncontrolled and cannot establish a before/after CPU improvement. It does not block fixing the reproduced defects.

### Phase 1 — Repair boundaries and financial-data correctness

- [x] Normalize wallet/CAIP envelopes before HTTP/WS authorization, bound nesting, validate subscription parameters and reject malformed HTTP requests.
- [x] Bind HTTP poll IDs and unsubscribe to origin ownership; bind WS unsubscribe to socket and origin. Bound incoming payloads, HTTP session count and queued events; reject duplicate pending polls and expire abandoned sessions.
- [x] Preserve origin schemes. Existing scheme-stripped grants deliberately do not transfer; sites must approve again.
- [x] Validate privileged RPC/action IPC against registered wallet-window main frames; reject other web contents and subframes. Reject inherited RPC method names and malformed argument JSON.
- [x] Use chain-and-address price keys in the updater, provider API, Home, balances and transaction presentation. Legacy address-only quotes are not used as fallback.
- [x] Mark incomplete discovery results partial by checking returned token counts rather than reporting unconditional success.

This is sender validation, not a complete per-window capability redesign. Electron/dependency modernization, signer compatibility and packaged-app release checks remain a separate required release workstream. Native-agent pairing belongs to phase 3. Per-quote timestamps and a versioned connected-app freshness contract belong with that API; this change retains the existing partial/cached portfolio presentation.

### Phase 2 — Remove scan duplication and responsiveness bottlenecks

- [x] Prioritize least-recently attempted accounts; ignore completion status from a different chain set or removed account.
- [x] Route selected-account and portfolio scans through the same bounded controller; share identical in-flight account/chain requests. At capacity, report partial instead of launching more work.
- [x] Terminate a timed-out worker, reject its other pending scans, ignore messages from that retired controller, and wait for worker close before the existing restart path runs.
- [x] Separate frequent known/native balance refresh from successful catalog discovery, which runs at most once per account/chain set per ten minutes. Remove obsolete fire-and-forget scan entry points; update the blacklist with discovery.
- [x] Subscribe Home to portfolio inputs instead of all main state; memoize using those inputs and skip Holdings derivation in other views.
- [x] Suppress identical status reports and duplicate rate-subscription requests.
- [x] Regression-test fairness, worker retirement, request ownership, sender identity and cross-chain quotes.

A broad IPC transport/persistence rewrite, generalized job framework and full capability system would be premature in this pass. Persistence exclusion and detailed profiling remain explicit follow-ups, not completed work. Native pairing is necessary later, not overkill. Electron modernization is necessary before distribution, not an optional optimization.

Implementation validation: `npm run test:unit` passed 1,251 tests (901 main, 232 component, 118 resource) and the final focused rerun passed 48 tests, including an additional controller concurrency/late-message regression. TypeScript compilation and the Home production bundle passed. The synthetic ten-minute scheduling workload changed from `[6,6,5,5,0,0]` to `[4,4,4,4,3,3]`; the two-chain quote case changed from $40 to the correct $21. No signing, broadcasting, hardware-wallet compatibility or installed-package smoke test was performed. Source edits do not update an already-running packaged installation.

### Phase 3 — Package and pair a read-only local connected app

- [ ] Publish a verified Home installer/archive with fork-specific identity and explicit release configuration.
- [ ] Implement local discovery, authenticated status, paired device/account/chain grants, revocation, and version negotiation.
- [ ] Add the Frame Connected Apps provider, capability schemas, status, mention resolution and authenticated local-executor routing; verify supported local runtimes and reject hosted execution.
- [ ] Prove account/portfolio reads with fresh/stale/partial states, locked/offline handling and cloud-runtime rejection.
- [ ] Prove packaged-install launch and reconnect from an unrelated working directory; do not depend on sibling source paths at runtime.

### Phase 4 — Add supervised asset operations

- [ ] Implement account-pinned preparation, immutable approval requests, per-operation policy and durable idempotent status.
- [ ] Show exact chain/account/destination/value/fees/calldata or decoded effects in Frame Home; approval must match the final signed payload.
- [ ] Test concurrent tasks, account switches, rejection, timeout, restart, disconnect, duplicate submission and receipt reconciliation.
- [ ] Prove that connected-app calls cannot approve requests, change approval policy or reach direct-sign IPC; changed payloads must require fresh user approval.
- [ ] Validate on a dedicated testnet account before any explicitly authorized real-asset operation; hardware devices need their own proof.

### Phase 5 — Decide bounded unattended execution separately

- [ ] Decide whether unattended operations are actually required and define supported assets/actions, budgets, destinations and expiry.
- [ ] Establish the agent OS/sandbox boundary and dedicated wallet funding model; account for unrestricted same-user shell access.
- [ ] Prove policy enforcement against prompt injection, forged tool intent, payload changes, retries and revocation before exposing the capability.

## Validation

Evidence generated in this review is in [evidence/README.md](./evidence/README.md). Exact commands:

```bash
gh api repos/glucrypto/frame-home/releases
gh api repos/glucrypto/frame-home/actions/runs
gh api repos/floating/frame/releases/latest
npm audit --json --ignore-scripts
npm run test:exec -- --env=node --roots test docs/working-docs/frame-home/evidence --runTestsByPath docs/working-docs/frame-home/evidence/audit-boundaries.test.js --testTimeout=5000
node docs/working-docs/frame-home/evidence/portfolio-benchmark.cjs
python3 docs/working-docs/frame-home/evidence/sample-process-cpu.py
```

The seven probe assertions deliberately demonstrate current defects; a passing probe is **not** a security pass. No real socket listener or real RPC was used by the boundary probes. The initial wrapper probe needed its mocked chain registry completed; the final run passed against the actual transport/mapper/provider code with only accounts/chains and infrastructure mocked.

Earlier merge validation at `16e5941` passed 302 targeted tests, TypeScript compilation, production bundles and the Electron smoke test. Those checks do not cover the new negative boundaries and fairness cases; successful ordinary tests did not establish security or good performance. The smoke run also logged a missing-window message during teardown after reporting success. No fresh release build, hardware signing, real-dapp transaction, cross-platform runtime proof, or OpenPond integration end-to-end test was performed for this document.

Proposed acceptance gates: no unauthorized direct/wrapped wallet data access; no cross-session event access; every eligible account serviced under a bounded slow-RPC fixture; actual work respects concurrency/deadline limits; UI input-to-update p95 under 100 ms for the agreed 20-account fixture; no recurring renderer long tasks from unrelated status ticks; read-only tools cannot sign; changed-payload retries fail; cloud turns cannot reach local wallet capabilities. Performance targets are proposed and require controlled workload measurements.

## Open Questions

- Which OpenPond local runtimes must expose the Frame connected-app capabilities initially? Verify equivalent capability checks and local routing for each supported runtime.
- Which chains and accounts should the initial local grant cover, and which first operation matters most: native transfer, ERC-20 transfer, or a specific contract action?
- Is a user-configured auto-approval policy needed in a later release? Initial sign/send operations require approval in Frame; no unattended authority is enabled or approved.
- Should the first Home release support only Linux x64, or must macOS/Windows ship together?
- Should existing Frame profiles be explicitly imported or remain selectable external profiles? Either choice needs migration/backup and coexistence rules.
- How should local wallet visibility interact with team-scoped OpenPond sessions? Default recommendation: device/user-private grants, with no automatic team sharing.
- Does a future cloud agent need a user-device bridge? This is out of the first local integration scope and needs a separate authenticated relay design.

## Progress Log

- 2026-09-21 latest decision: Removed Cast and MCP from the integration plan. Use Connected Apps with specific capabilities and a local executor; retain user Sign/Send approval in Frame. A user-controlled auto-approval policy remains a separate future decision. Documentation updated and local links checked; no application behavior changed.

- 2026-09-21 (superseded MCP proposal): User clarified the send/sign replacement question and chose to retain Frame's wallet. Superseded the rebuild proposal; documented local MCP tools, Frame-owned approval and the existing OpenPond local MCP registration path. Documentation only; no connector implemented.

- 2026-09-20 follow-up (superseded rebuild proposal): Compared selective UI reuse and a focused local service against retaining the full fork; checked current Foundry documentation and recorded Cast/Anvil roles, missing responsibilities and a bounded prototype. Documentation only; no tool installation, key migration or rebuild performed.
- 2026-09-20: Reviewed published Frame Home and the sibling OpenPond worktree, recorded release gaps, reproduced seven boundary/performance/data issues, sampled the running app, and wrote the phased local integration plan. Application behavior remains unchanged; evidence and documentation are local and have not been pushed.
