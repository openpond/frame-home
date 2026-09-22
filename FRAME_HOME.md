# Frame Home

A desktop fork of [floating/frame](https://github.com/floating/frame), published at [glucrypto/frame-home](https://github.com/glucrypto/frame-home), with a persistent holdings window. Based on upstream commit `dac4378979fe1f490f4d0bf141dc19c201d2cb58` (package version 0.6.11).

Home uses Frame’s shared palette, fonts, navigation, dropdown, token icons, and balance formatting. The total is at the top; the network selector and **Open Extension** button are at the upper right. The rest of the page is a holdings list. Sidebar navigation renders Frame’s original Accounts, Chains, Tokens, Dapps, and Settings components inside Home, including nested editors and Back navigation. Only **Open Extension** or an explicit account selection opens the wallet panel. Home navigation and filters do not change the selected account.

Holdings combines native Ether across accounts and networks into one row. ERC-20 balances combine across accounts by chain and contract, so unrelated contracts sharing a symbol are not mixed. Each row shows its largest holder and “+N accounts”; expanding it lists all holders in descending balance order, with per-network balances. The balance and value columns show the combined amount. Selecting an account in the expanded list uses Frame’s normal signer-selection flow.

**Open Extension** opens Frame’s existing wallet panel, which handles browser-extension connection and signing requests. It does not open a browser toolbar popup. Connection, unlock, and approval prompts still use Frame’s original flows.

## Network defaults

Fresh profiles retain Frame’s default networks and RPC presets. Home does not require a separate RPC configuration or API key. Existing profiles retain their network settings. Chains disabled in Frame remain disabled until enabled in its original Chains view; the overview can still show their cached holdings.

The current upstream presets use Pylon for Ethereum, Optimism, Polygon, Arbitrum, Base, and the supported Sepolia networks. Other configured chains use the upstream custom endpoints. These are defaults, not a guarantee of third-party service availability.

## Run

The Linux x64 build is `dist/home/linux-unpacked/frame-home`. Keep its neighboring files with it. Quit stock Frame before running the fork: both use port 1248 for the wallet provider and port 8421 for the dapp server.

The packaged application has a separate display and packaging identity (`Frame Home`, `local.frame.home`), but retains the package name `frame` and uses the existing Frame profile by default (on Linux, `~/.config/frame`). It has not been installed into system menus. Home opens at launch; the wallet panel opens through **Open Extension**, sidebar navigation, or Frame’s existing summon and request flows. The X in either the wallet panel or its expanded view dismisses both wallet views while Home stays open.

To test with a separate copy of a complete Frame profile:

```bash
FRAME_HOME_USER_DATA="/absolute/path/to/copied-frame-profile" ./dist/home/linux-unpacked/frame-home
```

Copy the profile while Frame is closed. Signing-capable profiles include `signers/` as well as `config.json`; the main JSON alone may not include encrypted signer material. Unlock with Frame’s normal password dialog.

## Develop and package

Use Node 18/20/22 for the upstream tooling. The build also completed with Node 24, with upstream engine warnings.

```bash
npm run setup:ci
npm run compile
npm run bundle
FRAME_HOME_USER_DATA="/absolute/path/to/test-profile" npm start
```

`npm run package:home` creates an unpacked application with the separate identity. Use this command rather than the original upstream packaging commands when distributing this fork. Upstream automatic update checks are disabled: updating this fork requires incorporating upstream changes and rebuilding.

## Checks

```bash
npm run test:exec -- --env=jsdom test/app/home --testTimeout=5000
npm run test:exec -- --env=node test/main/store/state --testTimeout=5000
npm run test:exec -- --env=node test/main/api test/main/provider test/main/signers/hot --testTimeout=5000
./node_modules/.bin/electron scripts/smoke-home.cjs
```

The smoke test uses sample watch-only accounts, a temporary profile, and an ephemeral provider port. It substitutes the fixed-port dapp server so it can run alongside another wallet. It checks the native window, state updates, existing account view, account selection, window reopening, responsive layout, and extension protocol handshake. Set `FRAME_HOME_SCREENSHOT` to save the sample screenshot to a chosen absolute path.

277 backend and transaction tests passed across API/provider/hot-signer, state, external-data, and transaction-normalization suites. All 25 Home tests passed. TypeScript compilation and all production bundles passed. Regressions cover missing native decimals, malformed token precision, account aggregation, local navigation, bounded background scans, failed balance requests, and transaction calldata aliases. Lint reports only the two existing `@ts-ignore` errors in upstream `main/store/state/index.ts` and `main/windows/systemTray.ts`, plus type warnings.

Earlier Linux x64 packaging and real-profile checks also passed: all 20 saved accounts refreshed, all five sidebar sections stayed inside Home, nested Add Account and Back worked, and the connected account stayed unchanged.

Actual browser-extension use with a real dapp, password entry through the UI, hardware device signing, and transaction submission have not been validated. macOS and Windows have not been runtime-tested.

## Repository workflow

The default branch is `develop`. The initial Home feature branch is `feat/persistent-home`. The `origin` remote points to `https://github.com/glucrypto/frame-home.git`, and `upstream` points to `https://github.com/floating/frame.git`. Pushes default to `origin`.

Publish feature branches to `origin` and open pull requests **within the fork**, targeting `develop` in `glucrypto/frame-home`. `PR.md` describes the initial Home changes. Upstream changes can be fetched separately from `upstream`.

## Data coverage

Home lists native/ERC-20 holdings known to Frame. NFTs remain in the existing inventory view, and arbitrary DeFi positions or undiscovered assets are not included. While Home is visible, a background queue refreshes all saved accounts through Frame’s existing balance worker on connected networks, two accounts at a time, with a two-minute interval per account. The original selected-account scanner remains available. Token-price subscriptions include known tokens across saved accounts. Failed balance requests retain cached values instead of fabricating a zero balance; the footer reports progress and partial failures. Disabled or disconnected networks can still have stale cached data. Unknown and zero placeholder prices are excluded from the total, as are testnet holdings. The displayed total covers only the priced subset of the current filters.

Frame’s GPL-3.0 license is retained. Encryption, signer implementations, and permission flows are retained. Transaction normalization accepts the JSON-RPC `input` alias as `data` when `data` is absent, preserving explicit `data` when both fields are supplied. A small existing chain-monitor mount bug was fixed so an account with no configured chain does not attach a ResizeObserver to a missing element.
