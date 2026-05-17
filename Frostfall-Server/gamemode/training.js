'use strict'

var TRAINING_BOOST_MULTIPLIER = 2.0
var TRAINING_BOOST_ONLINE_MS = 24 * 60 * 60 * 1000
var TRAINING_LOCATION_RADIUS = 500

var activeSessions = new Map()

function distance(a, b) {
  return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y) + (a.z - b.z) * (a.z - b.z))
}

function startTraining(mp, store, bus, trainerId, skillId) {
  if (!store.get(trainerId)) return false
  if (activeSessions.has(trainerId)) return false

  activeSessions.set(trainerId, {
    trainerId: trainerId,
    skillId: skillId,
    startedAt: Date.now(),
    attendees: [],
  })

  bus.dispatch({ type: 'trainingStarted', trainerId: trainerId, skillId: skillId })
  return true
}

function joinTraining(mp, store, bus, playerId, trainerId) {
  if (!store.get(playerId)) return false
  var session = activeSessions.get(trainerId)
  if (!session) return false
  if (playerId === trainerId) return false
  if (session.attendees.indexOf(playerId) !== -1) return false

  var trainer = store.get(trainerId)
  var player = store.get(playerId)
  if (!trainer || !player) return false

  var trainerPos = mp.get(trainer.actorId, 'pos')
  var attendeePos = mp.get(player.actorId, 'pos')
  if (!trainerPos || !attendeePos) return false
  if (distance(trainerPos, attendeePos) > TRAINING_LOCATION_RADIUS) return false

  session.attendees.push(playerId)
  return true
}

function endTraining(mp, store, bus, trainerId) {
  var session = activeSessions.get(trainerId)
  if (!session) return false

  var skills = require('./skills')

  for (var i = 0; i < session.attendees.length; i++) {
    var attendeeId = session.attendees[i]
    skills.grantStudyBoost(mp, attendeeId, session.skillId, TRAINING_BOOST_MULTIPLIER, TRAINING_BOOST_ONLINE_MS)
  }

  bus.dispatch({
    type: 'trainingEnded',
    trainerId: trainerId,
    skillId: session.skillId,
    attendeeCount: session.attendees.length,
  })

  activeSessions.delete(trainerId)
  return true
}

function getActiveTraining(trainerId) {
  return activeSessions.get(trainerId) || null
}

function init(mp, store, bus) {
  // Sessions are in-memory only
}

function onConnect(mp, store, bus, userId) {
  // nothing to restore
}

module.exports = {
  startTraining, joinTraining, endTraining, getActiveTraining,
  init, onConnect,
}
