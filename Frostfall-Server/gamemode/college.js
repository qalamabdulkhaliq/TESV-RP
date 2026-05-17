'use strict'

var XP_THRESHOLDS = {
  novice: 0,
  apprentice: 100,
  adept: 300,
  expert: 600,
  master: 1000,
}

var LECTURE_ATTENDEE_XP = 50
var LECTURE_TEACHER_XP = 25
var TOME_XP = {
  novice: 15,
  apprentice: 30,
  adept: 50,
  expert: 75,
  master: 100,
}
var LECTURE_BOOST_MS = 24 * 60 * 60 * 1000

var TOME_REGISTRY = {
  '0x0a26e6': 'novice',
  '0x0a26e7': 'novice',
  '0x0a26e8': 'apprentice',
  '0x0a26e9': 'apprentice',
  '0x0a26ea': 'adept',
  '0x0a26eb': 'adept',
  '0x0a26ec': 'expert',
  '0x0a26ed': 'expert',
  '0x0a26ee': 'master',
  '0x0a26ef': 'master',
}

var activeLectures = new Map()
var XP_KEY = 'ff_study_xp'
var BOOST_KEY = 'ff_lecture_boost'

function getCollegeRank(xp) {
  var tiers = ['master', 'expert', 'adept', 'apprentice', 'novice']
  for (var i = 0; i < tiers.length; i++) {
    if (xp >= XP_THRESHOLDS[tiers[i]]) return tiers[i]
  }
  return 'novice'
}

function getTomeRank(tomeBaseId) {
  return TOME_REGISTRY[tomeBaseId] || null
}

function getStudyXp(mp, store, playerId) {
  var player = store.get(playerId)
  if (!player) return 0
  var val = mp.get(player.actorId, XP_KEY)
  return (val !== null && val !== undefined) ? val : 0
}

function getCollegeRankForPlayer(mp, store, playerId) {
  return getCollegeRank(getStudyXp(mp, store, playerId))
}

function addStudyXp(mp, store, playerId, amount) {
  var player = store.get(playerId)
  var current = getStudyXp(mp, store, playerId)
  var next = current + amount
  mp.set(player.actorId, XP_KEY, next)
  return next
}

function studyTome(mp, store, bus, playerId, tomeBaseId) {
  var player = store.get(playerId)
  if (!player) return false

  var tomeRank = getTomeRank(tomeBaseId)
  if (tomeRank === null) return false

  var xpGain = TOME_XP[tomeRank]
  var newXp = addStudyXp(mp, store, playerId, xpGain)
  var newRank = getCollegeRank(newXp)

  mp.sendCustomPacket(player.actorId, 'studyXpUpdate', { xp: newXp, rank: newRank, xpGain: xpGain })
  console.log('[College] ' + player.name + ' studied ' + tomeRank + ' tome +' + xpGain + ' XP (total: ' + newXp + ', rank: ' + newRank + ')')
  return true
}

function startLecture(mp, store, bus, lecturerId) {
  var lecturer = store.get(lecturerId)
  if (!lecturer) return false
  if (activeLectures.has(lecturerId)) return false

  activeLectures.set(lecturerId, {
    lecturerId: lecturerId,
    startedAt: Date.now(),
    attendees: [],
  })

  bus.dispatch({ type: 'lectureStarted', lecturerId: lecturerId })
  mp.sendCustomPacket(lecturer.actorId, 'lectureStarted', { lecturerId: lecturerId })
  console.log('[College] ' + lecturer.name + ' started a lecture')
  return true
}

function joinLecture(mp, store, bus, playerId, lecturerId) {
  var session = activeLectures.get(lecturerId)
  if (!session) return false
  if (playerId === lecturerId) return false
  if (session.attendees.indexOf(playerId) !== -1) return false

  session.attendees.push(playerId)

  var player = store.get(playerId)
  if (player) mp.sendCustomPacket(player.actorId, 'lectureJoined', { lecturerId: lecturerId })
  console.log('[College] Player ' + playerId + ' joined lecture by ' + lecturerId)
  return true
}

function endLecture(mp, store, bus, lecturerId, now) {
  if (now === undefined) now = Date.now()
  var session = activeLectures.get(lecturerId)
  if (!session) return false

  var boostUntil = now + LECTURE_BOOST_MS

  for (var i = 0; i < session.attendees.length; i++) {
    var attendeeId = session.attendees[i]
    var attendee = store.get(attendeeId)
    if (!attendee) continue

    addStudyXp(mp, store, attendeeId, LECTURE_ATTENDEE_XP)
    mp.set(attendee.actorId, BOOST_KEY, boostUntil)

    mp.sendCustomPacket(attendee.actorId, 'lectureEnded', {
      lecturerId: lecturerId,
      xpGain: LECTURE_ATTENDEE_XP,
      boostUntil: boostUntil,
    })
  }

  var lecturer = store.get(lecturerId)
  if (lecturer) {
    addStudyXp(mp, store, lecturerId, LECTURE_TEACHER_XP)
    mp.sendCustomPacket(lecturer.actorId, 'lectureEnded', {
      lecturerId: lecturerId,
      xpGain: LECTURE_TEACHER_XP,
      attendeeCount: session.attendees.length,
    })
  }

  activeLectures.delete(lecturerId)
  bus.dispatch({ type: 'lectureEnded', lecturerId: lecturerId, attendeeCount: session.attendees.length })
  console.log('[College] Lecture by ' + lecturerId + ' ended - ' + session.attendees.length + ' attendee(s) rewarded')
  return true
}

function getActiveLecture(lecturerId) {
  return activeLectures.get(lecturerId) || null
}

function hasLectureBoost(mp, store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player) return false
  var boostUntil = mp.get(player.actorId, BOOST_KEY) || 0
  return boostUntil > now
}

function getLectureBoostRemainingMs(mp, store, playerId, now) {
  if (now === undefined) now = Date.now()
  var player = store.get(playerId)
  if (!player) return 0
  var boostUntil = mp.get(player.actorId, BOOST_KEY) || 0
  return Math.max(0, boostUntil - now)
}

function init(mp, store, bus) {
  console.log('[college] Initializing')

  mp.makeProperty(XP_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  mp.makeProperty(BOOST_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: '',
    updateNeighbor: '',
  })

  bus.on('playerJoined', function (event) {
    var playerId = event.playerId
    var actorId = event.actorId
    var player = store.get(playerId)
    if (!player) return

    var xp = mp.get(actorId, XP_KEY) || 0
    var rank = getCollegeRank(xp)

    mp.sendCustomPacket(actorId, 'studyXpUpdate', { xp: xp, rank: rank })

    var boostUntil = mp.get(actorId, BOOST_KEY) || 0
    if (boostUntil > Date.now()) {
      mp.sendCustomPacket(actorId, 'lectureBoostActive', {
        boostUntil: boostUntil,
        remainingMs: boostUntil - Date.now(),
      })
    }
  })

  console.log('[college] Started')
}

function onConnect(mp, store, bus, userId) {
  var player = store.get(userId)
  if (!player) return
  var xp = mp.get(player.actorId, XP_KEY) || 0
  var rank = getCollegeRank(xp)
  mp.sendCustomPacket(player.actorId, 'studyXpUpdate', { xp: xp, rank: rank })
}

module.exports = {
  getCollegeRank, getTomeRank, getStudyXp, getCollegeRankForPlayer,
  studyTome, startLecture, joinLecture, endLecture,
  getActiveLecture, hasLectureBoost, getLectureBoostRemainingMs,
  init, onConnect,
}
