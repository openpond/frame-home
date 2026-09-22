# Add a persistent holdings window using Frame’s existing UI

Frame’s portfolio view is tied to its narrow wallet panel. This adds a normal, resizable Home window that shows the total known value and holdings across saved accounts, while keeping the existing wallet panels and backend available.

The window uses Frame’s shared colors, fonts, navigation, token icons, and balance formatter. Accounts, Chains, Tokens, Dapps, and Settings render their original components inside Home, including nested forms and Back navigation. The wallet panel remains available through “Open Extension”.

Holdings aggregates balances across accounts, with native Ether combined across networks. Each asset row shows the largest holder and an expandable account breakdown sorted by balance. ERC-20 identity remains chain-and-contract based. Selecting a holder uses the existing signer-selection flow; navigation, filtering, expanding holders, and background scans do not change the account connected to dapps.

Frame’s default networks, RPC presets, browser-extension protocol, permissions, password handling, and signer implementations are retained. Cached balances are restored for the overview; incomplete prices are excluded from totals. Home opens by default while the wallet panel stays hidden until summoned. Both wallet close buttons dismiss the wallet views without closing Home. Native-coin precision comes from chain metadata, matching Frame’s existing balance UI; missing token precision is skipped. A loading state and render-error fallback prevent an unexplained blank Home. The fork retains the existing Frame profile by default, has a separate packaging identity, and disables upstream automatic update checks to avoid replacing the custom build.

Transaction normalization also accepts the JSON-RPC `input` alias as `data` when `data` is absent. Explicit `data` takes precedence, and the alias is removed before signing. This preserves calldata supplied by clients such as Foundry’s unlocked sender. Obsolete demo GIFs are removed, and the README links to the fork’s setup and packaging guide.

Validation:

- TypeScript compilation and all production bundles.
- 277 backend and transaction tests covering API/provider/hot-signer, state, external-data behavior, and calldata normalization.
- 25 Home tests covering aggregation, holder expansion, filtering, and local navigation.
- Electron smoke test with sample watch accounts: holdings rendering, live state updates, existing account views, account selection, persistent/reopened window, and narrow layout.
- Simulated extension handshake and selected-account response through the actual WebSocket handler on an isolated port.
- Changed-file formatting and whitespace checks. Lint reports two existing upstream `@ts-ignore` errors in `main/store/state/index.ts` and `main/windows/systemTray.ts`, plus type warnings.
- Previously recorded Linux x64 unpacked build and real-profile checks: 20 saved accounts refreshed, all five sidebar sections rendered inside Home, nested navigation worked, and the selected account was unchanged.

Actual browser-extension use against a real dapp, hardware devices, password entry through the UI, and transaction submission remain untested. “Open Extension” opens the Frame wallet panel, not a browser toolbar popup. NFTs remain in the original inventory view. While Home is visible, saved accounts refresh on connected networks through the existing worker, at most two accounts concurrently and once every two minutes per account. Original selected-account refreshing is retained. Token-price subscriptions include known assets across saved accounts. The footer shows progress and partial failures; failed native RPC calls preserve cached balances. Disabled or disconnected networks can show older cached data.
