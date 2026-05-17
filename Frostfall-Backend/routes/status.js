const router = require('express').Router()
const net    = require('net')
const http   = require('http')
const config = require('../config')

// TCP reachability check for the game port
function tcpCheck(host, port) {
  return new Promise(resolve => {
    const socket = new net.Socket()
    socket.setTimeout(3000)
    socket.connect(port, host, () => { socket.destroy(); resolve(true) })
    socket.on('error',   () => resolve(false))
    socket.on('timeout', () => { socket.destroy(); resolve(false) })
  })
}

// Fetch Prometheus metrics from SkyMP HTTP UI and derive online player count.
// Online players ≈ skymp_connects_total − skymp_disconnects_total
function fetchPlayerCount(host, uiPort) {
  return new Promise(resolve => {
    const req = http.get(
      { hostname: host, port: uiPort, path: '/metrics', timeout: 3000 },
      res => {
        let raw = ''
        res.on('data', c => { raw += c })
        res.on('end', () => {
          const val = name => {
            const m = raw.match(new RegExp(`^${name}\\s+(\\d+)`, 'm'))
            return m ? parseInt(m[1], 10) : null
          }
          const connects    = val('skymp_connects_total')
          const disconnects = val('skymp_disconnects_total')
          if (connects !== null && disconnects !== null) {
            resolve(Math.max(0, connects - disconnects))
          } else {
            resolve(null)
          }
        })
      }
    )
    req.on('error',   () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}

router.get('/', async (_req, res) => {
  const { skyrimServerHost: host, skyrimServerPort: gamePort, skympUiPort: uiPort } = config
  const online  = await tcpCheck(host, gamePort)
  const players = online ? await fetchPlayerCount(host, uiPort) : null
  res.json({ status: online ? 'online' : 'offline', players })
})

module.exports = router
