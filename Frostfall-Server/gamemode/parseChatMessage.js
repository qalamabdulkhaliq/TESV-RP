'use strict'

var map = {
  '(': { double: true, close: ')', type: 'nonrp', color: '#91916D' },
  '*': { close: '*', type: 'action', color: '#CFAA6E' },
  '%': { close: '%', type: 'whisper', color: '#A062C9' },
  '\u2116': { close: '\u2116', type: 'shout', color: '#F78C8C', canBeNested: false },
}

function parseChatMessage(text) {
  var stack = []
  var texts = []
  var lastIndex = 0
  var currentType = []

  for (var i = 0; i < text.length; i++) {
    var char = text[i]
    if (char in map) {
      if (char === stack[stack.length - 1]) {
        stack.pop()
        texts.push({ text: text.slice(lastIndex, i), color: map[char].color, type: currentType.slice() })
        lastIndex = i
        currentType.pop()
      } else {
        if (map[char].double) {
          if (char !== text[i + 1]) continue
          i += 1
        }
        if (
          (map[char].canBeNested === false && (stack.length !== 0 || currentType.length !== 0)) ||
          text.lastIndexOf(map[char].close) === i
        ) continue

        var prevColor = currentType.length > 0 ? map[stack[0]].color : '#FFFFFF'
        stack.push(char)

        var tThis = 0
        var tPrev = 0
        if (stack[0] && map[stack[stack.length - 1]].double) tThis += 1
        if (stack[1] && map[stack[stack.length - 2]].double) tPrev += 1

        texts.push({
          text: text.slice(lastIndex + tThis + tPrev, i - tThis),
          color: prevColor,
          type: currentType.length > 0 ? currentType.slice() : ['plain'],
        })
        currentType.push(map[char].type)
        lastIndex = i
      }
    } else {
      var closing = Object.keys(map).find(function (k) { return map[k].close === char })
      if (closing && closing === stack[stack.length - 1]) {
        if (map[closing].double) {
          if (map[closing].close !== text[i + 1]) continue
          i += 1
        }
        stack.pop()
        texts.push({
          text: text.slice(lastIndex + 1, i - (map[closing].double ? 1 : 0)),
          color: map[closing].color,
          type: currentType.slice(),
        })
        currentType.pop()
        lastIndex = i + 1
      }
    }
  }

  texts.push({ type: ['plain'], text: text.slice(lastIndex), color: '#FFFFFF' })

  texts.forEach(function (msg) {
    msg.text = msg.text.replace(/\%|\№|\*|(\(\()|(\)\))/gi, '')
  })
  texts = texts.filter(function (msg) { return msg.text !== '' })

  var isNonRpOpened = false
  texts.forEach(function (msg, idx) {
    if (msg.type.indexOf('nonrp') !== -1) {
      var nextHasNonrp = texts[idx + 1] && texts[idx + 1].type.indexOf('nonrp') !== -1
      if (isNonRpOpened && (!nextHasNonrp || idx + 1 === texts.length)) {
        msg.text += '))'
        isNonRpOpened = false
      } else if (!isNonRpOpened && (idx + 1 === texts.length || !nextHasNonrp)) {
        msg.text = '((' + msg.text + '))'
      } else if (!isNonRpOpened) {
        msg.text = '((' + msg.text
        isNonRpOpened = true
      }
    }
  })

  return texts
}

module.exports = { parseChatMessage: parseChatMessage }
