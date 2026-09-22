# op-walletctl

A separate read-only CLI for OpenPond Local Wallet. It does not extend the existing `openpond` command.

Install with `npm install --global /absolute/path/to/frame-home/cli`, then use:

```sh
op-walletctl connect
op-walletctl status --json
op-walletctl accounts --json
op-walletctl holdings --json
op-walletctl disconnect
```

The desktop must have been launched once, or its `openpond-local-wallet` executable must be on PATH. `OP_WALLET_EXECUTABLE` can select an installed executable explicitly. Discovery records the executable and profile, allowing later commands to launch the wallet from any working directory. `--profile /absolute/path` selects a previously launched profile. The CLI uses a filesystem-protected Unix socket, not the browser provider or a TCP port. Linux is the validated platform.

`connect` opens the hosted approval page and prints a code. Compare it with the browser, sign in there, and explicitly approve Personal Vault for 24 hours. The browser session and Turnkey keys never enter this CLI. Hosted devices can be revoked at `/local-wallet`; `disconnect` revokes the current device and removes its local key. Signing, seed export, policy changes and Agent Wallet are unsupported.

The returned raw balances include chain ID, contract address, symbol and decimals. Each account has `scan.state`, `checkedAt`, `stale` and `partial`; a cached balance is never proof of a fresh scan. CLI reads wake the existing scanner for 30 seconds. Query again after a pending refresh to obtain the result. Existing local accounts remain readable if hosted pairing is offline; Personal Vault is excluded until its grant verifies again.

The local service trusts the current OS user. Other software with unrestricted same-user filesystem access shares that trust boundary. Agent-specific grants and integration are a later step.

For staging, launch the desktop with `OPENPOND_WALLET_ORIGIN=https://staging.ducky.capital`. The production default is `https://ducky.capital`; deploy the hosted pairing endpoints there before using production pairing. `OPENPOND_WALLET_PROFILE` selects an alternate desktop profile; `FRAME_HOME_USER_DATA` remains supported. The default retains the existing Frame profile.
