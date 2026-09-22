# op-walletctl

A separate read-only CLI for OpenPond Local Wallet. It does not extend the existing `openpond` command.

Install with `npm install --global /absolute/path/to/frame-home/cli`, then use:

```sh
op-walletctl connect
op-walletctl status --json
op-walletctl accounts --json
op-walletctl holdings --json
```

`connect` discovers or launches the local desktop and returns its readiness. Hosted Personal Vault pairing is deferred; this version reads the desktop's existing local, hardware and watch-only accounts.

The desktop must have been launched once, or its `openpond-local-wallet` executable must be on PATH. `OP_WALLET_EXECUTABLE` can select an installed executable explicitly. Discovery records the executable and profile, allowing later commands to launch the wallet from any working directory. `--profile /absolute/path` selects a previously launched profile. The CLI uses a filesystem-protected Unix socket, not the browser provider or a TCP port. Linux is the validated platform.

The returned raw balances include chain ID, contract address, symbol and decimals. Each account has `scan.state`, `checkedAt`, `stale` and `partial`; cached balances are explicitly marked. CLI reads wake the existing scanner for 30 seconds. Query again after a pending refresh to obtain the result. Locked hardware or local signers remain readable without unlocking; signer status is included. The service has no signing, seed-export, approval or policy-changing operations.

The local service trusts the current OS user. Other software with unrestricted same-user filesystem access shares that trust boundary. Agent-specific grants and integration are a later step.

`OPENPOND_WALLET_PROFILE` selects an alternate desktop profile; `FRAME_HOME_USER_DATA` remains supported. The default retains the existing Frame profile. No hosted wallet page or account is required for these commands.
