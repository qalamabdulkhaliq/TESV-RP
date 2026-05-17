'use strict'

const fi = require('./functionInfo')

class EvalProperty {
  static init() {
    mp.makeProperty('eval', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(this.clientsideUpdateOwner()).getText(),
      updateNeighbor: '',
    });
    mp.makeEventSource('_onEvalFinish', new fi.FunctionInfo(this.clientsideInitEvalFinish()).getText());
    mp['_onEvalFinish'] = this.onEvalFinish;
  }

  static eval(actorId, f, args) {
    const baseDesc = mp.get(actorId, 'baseDesc');
    const baseId = mp.getIdFromDesc(baseDesc);
    if (baseId !== 0x7 && baseId !== 0) return;

    const code = new fi.FunctionInfo(f).getText(args);
    const value = mp.get(actorId, 'eval') || { commands: [], nextId: 0 };
    value.commands.push({ code, id: value.nextId });
    value.nextId++;
    mp.set(actorId, 'eval', value);
  }

  static onEvalFinish(actorId, ...args) {
    if (typeof args[0] === 'number') {
      const greatestExecutedId = args[0];
      const value = mp.get(actorId, 'eval') || { commands: [], nextId: 0 };
      value.commands = value.commands.filter((command) => command.id > greatestExecutedId);
      mp.set(actorId, 'eval', value);
    }
  }

  static clientsideUpdateOwner() {
    return () => {
      if (!ctx.value) {
        return;
      }

      if (typeof ctx.state.evalGreatestId !== 'number') {
        ctx.state.evalGreatestId = -1;
      }

      for (const command of ctx.value.commands) {
        if (command.id > ctx.state.evalGreatestId) {
          ctx.state.evalGreatestId = command.id;

          ctx.sp.browser.executeJavaScript(
            `window.skyrimPlatform.sendMessage('evalFinish', ${ctx.state.evalGreatestId})`
          );
          eval(command.code);
        }
      }
    };
  }

  static clientsideInitEvalFinish() {
    return () => {
      ctx.sp.on('browserMessage', (event) => {
        if (event.arguments[0] === 'evalFinish') {
          const evalGreatestId = event.arguments[1];
          ctx.sendEvent(evalGreatestId);
        }
      });
    };
  }
}

module.exports = { EvalProperty };
