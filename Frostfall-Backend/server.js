require('dotenv').config()

// Start WS relay alongside Express (independent port, see WS_PORT in .env)
require('./sources/wsRelay')

const express  = require('express')
const cors     = require('cors')
const path     = require('path')

const newsRoute        = require('./routes/news')
const statusRoute      = require('./routes/status')
const manifestRoute    = require('./routes/manifest')
const versionRoute     = require('./routes/version')
const serverinfoRoute  = require('./routes/serverinfo')
const metricsRoute     = require('./routes/metrics')
const masterApiRoute   = require('./routes/master-api')
const filesRoute       = require('./routes/files')
const modlistRoute     = require('./routes/modlist')
const serversRoute     = require('./routes/servers')
const webhookRoute     = require('./routes/webhook')
const adminRoute       = require('./routes/admin')
const dashAuthRoute    = require('./routes/dashboard-auth')
const skympCompatRoute = require('./routes/skymp-compat')

const app  = express()
const PORT = process.env.PORT || 4000

app.use(cors())

// Capture the raw request body so the webhook route can verify the
// GitHub HMAC-SHA256 signature without a separate body-parser step.
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf },
}))

// Static file serving — root/ is installed into Skyrim/ (Data/ sub-dir)
app.use('/files/root', express.static(path.join(__dirname, 'public', 'files', 'root')))

// News images — served at /images/<filename>
app.use('/images', express.static(path.join(__dirname, 'public', 'images')))

app.use('/api/news',       newsRoute)
app.use('/api/status',     statusRoute)
app.use('/api/manifest',   manifestRoute)
app.use('/api/version',    versionRoute)
app.use('/api/serverinfo', serverinfoRoute)
app.use('/api/metrics',    metricsRoute)
app.use('/api/files',      filesRoute)
app.use('/api/modlist',    modlistRoute)
app.use('/api/servers',    serversRoute)
// SkyMP client Master-API compatibility — must be mounted before /api/servers
// so /api/users/login-discord/status is not swallowed by a shorter prefix.
app.use('/api/users',      skympCompatRoute)
app.use('/auth',           masterApiRoute)   // POST /auth/session
app.use('/api/servers',    masterApiRoute)   // GET  /api/servers/:key/sessions/:session
app.use('/webhooks',       webhookRoute)
app.use('/api/admin',      adminRoute)
app.use('/auth/dashboard', dashAuthRoute)

app.listen(PORT, () => {
  console.log(`Frostfall backend running on http://localhost:${PORT}`)
})
