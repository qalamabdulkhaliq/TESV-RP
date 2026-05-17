'use strict'

const worldStore = require('./worldStore')

const REPORTS_KEY = 'ff_staff_reports'

function loadReports() {
  const saved = worldStore.get(REPORTS_KEY)
  return Array.isArray(saved) ? saved : []
}

function saveReports(reports) {
  worldStore.set(REPORTS_KEY, reports)
}

function createReport(player, text, staffRecipients) {
  const reports = loadReports()
  const report = {
    id: `report_${Date.now()}_${player.id}`,
    at: Date.now(),
    playerId: player.id,
    actorId: player.actorId,
    name: player.name,
    text,
    status: 'open',
    staffRecipients: staffRecipients || [],
  }
  reports.push(report)
  saveReports(reports.slice(-100))
  return report
}

function listOpenReports(limit) {
  const reports = loadReports().filter(report => report.status === 'open')
  return reports.slice(-(limit || 10)).reverse()
}

module.exports = { createReport, listOpenReports }
