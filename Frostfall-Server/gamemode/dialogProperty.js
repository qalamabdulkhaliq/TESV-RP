'use strict'

const fi = require('./functionInfo')
const rw = require('./refreshWidgets')

let _mp
const _openDialogIds = new Map()

class DialogProperty {
  static init(mp) {
    _mp = mp
    mp.makeProperty('dialog', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(DialogProperty._clientsideUpdateOwner()).getText({ refreshWidgets: rw.refreshWidgetsJs }),
      updateNeighbor: '',
    })
    mp.makeEventSource('_onDialogResponse', new fi.FunctionInfo(DialogProperty._clientsideInitDialogResponse()).getText())
    mp['_onDialogResponse'] = DialogProperty._onDialogResponse
  }

  static showMessageBox(actorId, dialogId, caption, text, buttons) {
    _openDialogIds.set(actorId, dialogId)
    _mp.set(actorId, 'dialog', ['messageBox', caption, text, buttons])
  }

  static clearDialog(actorId) {
    _openDialogIds.delete(actorId)
    _mp.set(actorId, 'dialog', null)
  }

  static setResponseHandler(handler) {
    DialogProperty._handler = handler
  }

  static _onDialogResponse(actorId, ...args) {
    if (args[0] !== 'buttonClick' || typeof args[1] !== 'number') return
    const dialogId = _openDialogIds.get(actorId)
    if (dialogId == null) return
    const buttonIndex = args[1]
    if (DialogProperty._handler) {
      DialogProperty._handler({ actorId, dialogId, buttonIndex })
    }
  }

  static _clientsideInitDialogResponse() {
    return () => {
      ctx.sp.on('browserMessage', function (event) {
        if (event.arguments[0] === 'buttonClick') {
          ctx.sendEvent(...event.arguments)
        }
      })
    }
  }

  static _clientsideUpdateOwner() {
    return () => {
      var newJ = JSON.stringify(ctx.value)
      if (newJ === ctx.state._dlgPrev) return
      ctx.state._dlgPrev = newJ

      if (!ctx.value) {
        ctx.sp.browser.executeJavaScript('window.dialog=[];' + refreshWidgets)
        return
      }

      if (ctx.value[0] === 'messageBox') {
        var caption = ctx.value[1]
        var text = ctx.value[2]
        var buttons = ctx.value[3]
        var src = 'var _t={type:"form",caption:' + JSON.stringify(caption) + ',elements:[]};'
        src += '_t.elements.push({type:"text",text:' + JSON.stringify(text) + '});'
        for (var i = 0; i < buttons.length; i++) {
          src += '_t.elements.push({type:"button",text:' + JSON.stringify(buttons[i]) + ',tags:["BUTTON_STYLE_FRAME"],click:(function(n){return function(){window.skyrimPlatform.sendMessage("buttonClick",n);};})('+i+')});'
        }
        src += 'window.dialog=[_t];' + refreshWidgets
        ctx.sp.browser.executeJavaScript(src)
      }
    }
  }
}

DialogProperty._handler = null

module.exports = { DialogProperty }
