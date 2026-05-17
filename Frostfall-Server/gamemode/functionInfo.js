'use strict'

function FunctionInfo(f) {
  this.f = f
}

Object.defineProperty(FunctionInfo.prototype, 'text', {
  get: function () {
    return 'try{' + this.getTextWithoutErrorHandling() + '}catch(e){' +
      "ctx.sp.printConsole('[CTX ERROR]', e, '\\n', " + this.f + ')}'
  }
})

FunctionInfo.prototype.getText = function (args) {
  if (!args) return this.text
  return 'const {' + Object.keys(args).join(',') + '} = ' + JSON.stringify(args) + ';' + this.text
}

FunctionInfo.prototype.getTextWithoutErrorHandling = function () {
  var s = this.f.toString().substring(0, this.f.toString().length - 1)
  return s.replace(new RegExp('^.+?{', 'm'), '').trim()
}

module.exports = { FunctionInfo: FunctionInfo }
