# Frostfall Roleplay OVH Handoff

This repo is a clean server handoff package. Paths are repo-relative and do not depend on the local Windows workspace.

## Contents

- `Frostfall-Server/` - SkyMP server runtime package, built `dist_back/skymp5-server.js`, active Frostfall gamemode source, and built `gamemode.js`.
- `Frostfall-Server/server-settings.example.json` - copy to `server-settings.json` on the host and fill real secrets/settings there.
- `Frostfall-Backend/` - optional Express backend for launcher/server status, master API/session flow, metrics proxy, admin routes, and WS relay.

## Do Not Commit

- Real `server-settings.json`, `.env`, private keys, logs, `world/`, `changeForms/`, `node_modules/`, Skyrim plugin/archive files, game assets, or generated client zips.
- The actual Skyrim `Data` directory should be installed/provisioned on the server separately if the SkyMP server needs plugin/archive access.

## Rebuild Gamemode

From `Frostfall-Server/gamemode`:

```powershell
npm ci
npm run build
```

The build writes `../gamemode.js` and `../gamemode.js.map`. Rebuilding requires an untracked `Frostfall-Server/signing-private.pem` deploy secret because `webpack.config.js` signs the gamemode bundle. The handoff includes the already built signed bundle, but it intentionally excludes private keys. Monorepo contract tests were run before packaging and are not included in this server-only handoff because one test suite depends on `Frostfall-Client` source.

## OVH Setup Outline

1. Install Node.js on the OVH host.
2. Clone this repo and install server dependencies:

```bash
cd Frostfall-Server
npm ci
```

3. Create the live SkyMP config:

```bash
cp server-settings.example.json server-settings.json
```

4. Edit `server-settings.json` on the host:

- Keep `gamemodePath` as `gamemode.js`.
- Keep `archives` empty unless a specific archive is proven safe for server Papyrus loading.
- Set `dataDir` to the host's deployed Skyrim `Data` directory if records/assets are needed.
- Replace `masterKey`, `metricsAuth`, Discord, and any other secrets with production values.
- For online mode, set `offlineMode` to `false` and point `master` at the backend URL.
- If rebuilding the gamemode on the host, place the signing private key at `Frostfall-Server/signing-private.pem` without committing it.

5. Start the SkyMP server:

```bash
npm start
```

Expected healthy logs include:

```text
[gamemode] Frostfall Roleplay - initializing
[commands] Registered <n> commands
[gamemode] Frostfall Roleplay - ready
```

## Optional Backend

The backend is included because it has a runnable `package.json` and serves launcher/status/master API related endpoints.

```bash
cd Frostfall-Backend
npm install
cp .env.example .env
npm start
```

Fill `.env` with production secrets and keep it untracked. If the game server runs in online mode, `SERVER_MASTER_KEY`, `MASTER_URL`, and `MASTER_API_AUTH_TOKEN` must match the corresponding `server-settings.json` values.

## Commit/Push After Review

From this handoff repo only:

```bash
git status
git commit -m "Prepare Frostfall Roleplay OVH handoff"
git push -u origin main
```
