'use strict'

function sqr(x) { return x * x }

function squareDist(pos1, pos2) {
  return sqr(pos1[0] - pos2[0]) + sqr(pos1[1] - pos2[1]) + sqr(pos1[2] - pos2[2])
}

module.exports = { sqr: sqr, squareDist: squareDist }
