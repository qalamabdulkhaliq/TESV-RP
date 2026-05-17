'use strict'

const fi = require('./functionInfo')

let _mp

class BrowserProperty {
  static init(mp) {
    _mp = mp
    mp.makeProperty('browserFocused', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(function () {
        if (ctx.value === undefined) return
        if (ctx.state._bfLast === ctx.value) return
        ctx.state._bfLast = ctx.value
        ctx.sp.browser.setFocused(ctx.value)
      }).getText(),
      updateNeighbor: '',
    })
  }

  static setFocused(actorId, focused) {
    if (focused === undefined) focused = true
    _mp.set(actorId, 'browserFocused', focused)
  }
}

module.exports = { BrowserProperty }
