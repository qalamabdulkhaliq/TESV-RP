/**
 * Backend server configuration.
 * All values are read from environment variables (set via .env for local dev,
 * real env vars in production).
 */
const path = require('path')

const SKYMP_PORT = parseInt(process.env.SKYMP_PORT || '7777', 10)

module.exports = {
  // ── Game server connection (used for status checks and metrics) ─────────────
  skyrimServerHost: process.env.SKYMP_HOST || '127.0.0.1',
  skyrimServerPort: SKYMP_PORT,

  // SkyMP HTTP UI port: always 3000 when game port is 7777, else port+1
  skympUiPort: SKYMP_PORT === 7777 ? 3000 : SKYMP_PORT + 1,

  // ── Server metadata (returned by /api/serverinfo and /api/servers) ──────────
  serverName:       process.env.SERVER_NAME        || 'SkyMP Server',
  serverMaxPlayers: parseInt(process.env.SERVER_MAX_PLAYERS || '100', 10),
  serverOfflineMode: process.env.SERVER_OFFLINE_MODE === 'true',
  serverNpcEnabled:  process.env.SERVER_NPC_ENABLED  === 'true',
  serverGamemode:    process.env.SERVER_GAMEMODE     || null,
  // Master API — used by the SkyMP client for online-mode authentication.
  // In offline mode these are ignored by the launcher but kept for future use.
  serverMasterKey:    process.env.SERVER_MASTER_KEY    || '',
  masterUrl:          process.env.MASTER_URL           || 'https://api.frostfall.online',
  masterApiAuthToken: process.env.MASTER_API_AUTH_TOKEN || '',

  // ── Discord OAuth (launcher login) ──────────────────────────────────────────
  discordClientId:     process.env.DISCORD_CLIENT_ID     || '',
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET || '',
  // Redirect URI registered in the Discord application settings
  discordRedirectUri:  process.env.DISCORD_REDIRECT_URI  || 'http://localhost:4000/api/users/login-discord/callback',

  // ── Metrics HTTP auth (Basic auth for the game server's /metrics endpoint) ──
  metricsUser:     process.env.METRICS_USER     || '',
  metricsPassword: process.env.METRICS_PASSWORD || '',

  // ── Admin service ───────────────────────────────────────────────────────────
  adminUrl:   process.env.ADMIN_URL   || 'http://localhost:5001',
  adminToken: process.env.ADMIN_TOKEN || '',

  // ── Dashboard auth ──────────────────────────────────────────────────────────
  // Comma-separated Discord user IDs allowed to access the admin dashboard.
  dashboardDiscordIds: (process.env.DASHBOARD_DISCORD_IDS || '')
    .split(',').map(s => s.trim()).filter(Boolean),
  // OAuth redirect URI registered in the Discord application for the dashboard.
  discordDashboardRedirectUri: process.env.DISCORD_DASHBOARD_REDIRECT_URI
    || 'http://localhost:4000/auth/dashboard/callback',
  // Public URL of the website (used to redirect back after OAuth).
  websiteUrl: process.env.WEBSITE_URL || 'http://localhost:4001',

  // ── Server lockdown ─────────────────────────────────────────────────────────
  // When true, only Discord users whose IDs appear in serverLockedAllowList
  // can connect.  Everyone else receives loginFailedServerLocked from the TS
  // server and the launcher shows a "Server locked" indicator.
  serverLocked:          process.env.SERVER_LOCKED === 'true',
  // Comma-separated list of Discord snowflake IDs that may still connect.
  serverLockedAllowList: (process.env.SERVER_LOCKED_ALLOW || '')
    .split(',').map(s => s.trim()).filter(Boolean),
}
