'use strict'

const fi = require('./functionInfo')
const pcm = require('./parseChatMessage')
const rw = require('./refreshWidgets')
const loc = require('./locationUtils')
const commandSuggestions = require('./commandSuggestions')

const colorsArray = [
  '#5DAD60',
  '#62C985',
  '#7175D6',
  '#71D0D6',
  '#93AD5D',
  '#A062C9',
  '#BDBD7D',
  '#D76464',
  '#F78C8C',
  '#F78CD9',
]

const filterMessages = {
  shout: [
    {
      type: 'action',
      status: 'disabled',
    },
    {
      type: 'nonrp',
      status: 'distanceOnly',
      color: '#91916D',
    },
    {
      type: 'whisper',
      status: 'disabled',
    },
  ],
  whisper: [
    {
      type: 'action',
      status: 'enabled',
    },
    {
      type: 'nonrp',
      status: 'distanceOnly',
      color: '#91916D',
    },
  ],
  nonrp: [
    {
      type: 'action',
      status: 'inherit',
      color: '#91916D',
    },
    {
      type: 'shout',
      status: 'inherit',
      color: '#91916D',
    },
    {
      type: 'whisper',
      status: 'inherit',
      color: '#91916D',
    },
  ],
}

const getColorByNickname = (name) => {
  let result = 0;
  for (let i = 0; i < name.length; i++) {
    result += name.charCodeAt(i);
  }
  return colorsArray[result % colorsArray.length];
}

const calculateOpacity = (distance, max, minDistance, coeff) => {
  if (distance <= minDistance * coeff) {
    return '1';
  }
  return Math.max(0, ((max * coeff - distance + minDistance * coeff) / (max * coeff))).toFixed(5);
}

class ChatMessage {
  constructor(actorId, masterApiId, text, category = 'plain', controller) {
    this.sender = {
      masterApiId,
      gameId: actorId,
    };
    this.category = category;
    if (controller) {
      this.controller = controller;
    }
    if (typeof text === 'string') {
      if (['plain', 'nonrp'].includes(category) && controller) {
        this.sender.name = controller.getName(actorId);
      }
      this.text = pcm.parseChatMessage(text);
    } else {
      this.text = text;
    }
  }

  static system(text, controller) {
    return new this(0, 0, text, 'system', controller ?? undefined);
  }

  toUser(actorId) {
    let texts = this.text;

    if (['plain', 'nonrp', 'dice'].includes(this.category) && this.controller) {
      const chatSettings = this.controller.getServerSetting('sweetpieChatSettings') ?? {};
      const hearingRadius =
        chatSettings['hearingRadiusNormal'] !== undefined ? loc.sqr(chatSettings['hearingRadiusNormal']) : loc.sqr(1900);
      const whisperDistanceCoeff =
        chatSettings['whisperDistance'] !== undefined ? chatSettings['whisperDistance'] : 0.1;
      const shoutDistanceCoeff =
        chatSettings['shoutDistance'] !== undefined ? chatSettings['shoutDistance'] : 2.45;
      const minDistanceToChange =
        chatSettings['minDistanceToChange'] !== undefined ? loc.sqr(chatSettings['minDistanceToChange']) : loc.sqr(500);

      const distance = this.controller.getActorDistanceSquared(actorId, this.sender.gameId);
      texts = texts.reduce((filtered, text) => {
        const current = { ...text };
        if (text.type.length > 0) {
          for (let i = 0; i < text.type.length; i++) {
            const category = text.type[i];
            if (category in filterMessages) {
              const filter = filterMessages[category];
              for (let j = i; j < text.type.length; j++) {
                if (!filter[j]) {
                  continue;
                }
                if (text.type.includes(filter[j].type)) {
                  if (filter[j].status === 'disabled') {
                    return filtered;
                  }
                  if (filter[j].color !== undefined) {
                    current.color = filter[j].color;
                  }
                  if (filter[j].status === 'enabled') {
                    current.type = current.type.filter((e) => e !== category);
                  }
                  if (filter[j].status === 'inherit') {
                    current.type = current.type.filter((e) => e !== filter[j].type);
                  }
                }
              }
            }
          }
        }

        if (
          (current.type.includes('shout') || current.type.includes('nonrp')) &&
          distance < hearingRadius * shoutDistanceCoeff
        ) {
          filtered.push({
            opacity: calculateOpacity(distance, hearingRadius, minDistanceToChange, shoutDistanceCoeff),
            ...current,
          });
          return filtered;
        } else if (current.type.includes('whisper')) {
          if (distance < hearingRadius * whisperDistanceCoeff) filtered.push({ opacity: '1', ...current });
          return filtered;
        } else if (distance < hearingRadius) {
          filtered.push({ opacity: calculateOpacity(distance, hearingRadius, minDistanceToChange, 1), ...current });
          return filtered;
        }
        return filtered;
      }, []);
    }

    if (texts.length === 0) {
      return false;
    }

    if (this.sender.name) {
      texts = [
        {
          type: ['plain'],
          text: `${this.sender.name}: `,
          color: getColorByNickname(this.sender.name),
        },
        ...texts,
      ];
    }

    return {
      opacity: 1,
      sender: {
        gameId: this.sender.gameId,
        masterApiId: this.sender.masterApiId,
      },
      text: texts,
      category: this.category,
    };
  }
}

const createSystemMessage = (text, controller) => {
  return ChatMessage.system(text, controller);
};

class ChatProperty {
  static init() {
    mp.makeProperty('chat', {
      isVisibleByOwner: true,
      isVisibleByNeighbors: false,
      updateOwner: new fi.FunctionInfo(this.clientsideUpdateOwner()).getText({
        refreshWidgets: rw.refreshWidgetsJs,
        commandSuggestionsJson: JSON.stringify(commandSuggestions.COMMANDS),
      }),
      updateNeighbor: '',
    });
    mp.makeEventSource('_onChatInput', new fi.FunctionInfo(this.clientsideInitChatInput()).getText());
    mp['_onChatInput'] = this.onChatInput;
  }

  static onChatInput(actorId, ...args) {
    if (args[0] !== 'chatInput' || typeof args[1] !== 'string') {
      return;
    }
    const [, inputText] = args;
    ChatProperty.chatInputHandler({ actorId, inputText });
  }

  static showChat(actorId, show = true) {
    var value = mp.get(actorId, 'chat') || {};
    value.show = show;
    value.pendingMessages = [];
    value.pendingClear = false;
    mp.set(actorId, 'chat', value);
  }

  static sendChatMessage(actorId, message) {
    var messageToUser = message.toUser(actorId);
    if (!messageToUser) return;
    var value = mp.get(actorId, 'chat') || {};
    value.pendingMessages = value.pendingMessages || [];
    value.pendingMessages.push(messageToUser);
    mp.set(actorId, 'chat', value);
  }

  static setChatInputHandler(handler) {
    this.chatInputHandler = handler;
  }

  static clientsideUpdateOwner() {
    return () => {
      // Handle /clear command
      if (ctx.value && ctx.value.pendingClear) {
        ctx.value.pendingClear = false;
        var clearSrc = '';
        clearSrc += 'window.chatMessages = [];';
        clearSrc += refreshWidgets;
        ctx.sp.browser.executeJavaScript(clearSrc);
      }

      // One-time browser patches (fixes scrollToLastMessage, Widgets listener leak,
      // and adds messagesUpdated listener as fallback re-render trigger)
      if (!ctx.state._chatPatched) {
        ctx.state._chatPatched = true;
        var initSrc = '';
        initSrc += 'if (!window.__skympChatPatched) {';
        initSrc += 'window.__skympChatPatched = true;';
        initSrc += 'window.scrollToLastMessage = function(){';
        initSrc += 'var l=document.querySelector("#chat>.chat-main>.list>.chat-list");';
        initSrc += 'if(l!=null&&window.needToScroll)l.scrollTop=l.scrollHeight;';
        initSrc += '};';
        initSrc += 'var _rl=window.skyrimPlatform.widgets.removeListener;';
        initSrc += 'window.skyrimPlatform.widgets.removeListener=function(l){';
        initSrc += 'var s=l.toString();this.listeners=this.listeners.filter(function(e){return e.toString()!==s});';
        initSrc += '};';
        initSrc += 'window.addEventListener("skymp:ui:chat:messagesUpdated",function(){';
        initSrc += 'window.skyrimPlatform.widgets.set((window.chat||[]).concat(window.dialog||[]));';
        initSrc += '});';
        initSrc += '}';
        ctx.sp.browser.executeJavaScript(initSrc);
      }

      if (!ctx.state._commandSuggestionsPatched) {
        ctx.state._commandSuggestionsPatched = true;
        var suggestSrc = '';
        suggestSrc += '(function(){';
        suggestSrc += 'if(window.__ffCommandSuggestPatched)return;';
        suggestSrc += 'window.__ffCommandSuggestPatched=true;';
        suggestSrc += 'window.__ffCommandSuggestions=' + commandSuggestionsJson + ';';
        suggestSrc += 'var style=document.createElement("style");';
        suggestSrc += 'style.textContent="#ff-command-suggestions{position:fixed;left:22px;bottom:86px;max-width:520px;background:rgba(0,0,0,.72);border:1px solid rgba(200,166,70,.35);color:#d6c07a;font:12px sans-serif;z-index:9200;padding:6px 8px;display:none;pointer-events:none}.ff-cs-row{white-space:nowrap;margin:2px 0}.ff-cs-name{color:#f0d890;font-weight:bold;margin-right:8px}";';
        suggestSrc += 'document.head.appendChild(style);';
        suggestSrc += 'var box=document.createElement("div");box.id="ff-command-suggestions";document.body.appendChild(box);';
        suggestSrc += 'function findInput(){return document.querySelector("#chat input,#chat textarea,input[type=text],textarea");}';
        suggestSrc += 'function render(value){';
        suggestSrc += 'if(!value||value.charAt(0)!=="/"){box.style.display="none";return;}';
        suggestSrc += 'var q=value.toLowerCase();';
        suggestSrc += 'var rows=(window.__ffCommandSuggestions||[]).filter(function(c){return c.name.indexOf(q)===0;}).slice(0,8);';
        suggestSrc += 'if(rows.length===0){box.style.display="none";return;}';
        suggestSrc += 'box.innerHTML=rows.map(function(c){return "<div class=\\"ff-cs-row\\"><span class=\\"ff-cs-name\\">"+c.name+"</span>"+c.usage+"</div>";}).join("");';
        suggestSrc += 'box.style.display="block";';
        suggestSrc += '}';
        suggestSrc += 'function attach(){var input=findInput();if(!input||input.__ffSuggestAttached)return;input.__ffSuggestAttached=true;input.addEventListener("input",function(){render(input.value||"");});input.addEventListener("blur",function(){setTimeout(function(){box.style.display="none";},100);});}';
        suggestSrc += 'setInterval(attach,500);attach();';
        suggestSrc += '})();';
        ctx.sp.browser.executeJavaScript(suggestSrc);
      }

      // Flush pending messages into window.chatMessages (per spec: updateOwner
      // flushes pendingMessages into window.chatMessages and dispatches refresh)
      if (ctx.value && ctx.value.pendingMessages && ctx.value.pendingMessages.length > 0) {
        var msgs = ctx.value.pendingMessages;
        ctx.value.pendingMessages = [];
        var src = '';
        for (var i = 0; i < msgs.length; i++) {
          src += 'window.chatMessages = window.chatMessages || [];';
          src += 'window.chatMessages.push(' + JSON.stringify(msgs[i]) + ');';
        }
        src += 'window.chatMessages = window.chatMessages.slice(-50);';
        src += 'window.dispatchEvent(new CustomEvent("skymp:ui:chat:messagesUpdated"));';
        src += refreshWidgets;
        src += 'if (window.scrollToLastMessage) { window.scrollToLastMessage(); }';
        ctx.sp.browser.executeJavaScript(src);
      }

      var isInputHidden = !ctx.sp.browser.isFocused() || (ctx.get && ctx.get('dialog'));

      var isConnected = ctx.sp.mpClientPlugin.isConnected();
      var wasConnected = ctx.state.isConnected;
      if (isConnected !== wasConnected) {
        ctx.state.isConnected = isConnected;
        var messageToUser;
        if (isConnected === false) {
          messageToUser = {
            actorId: 0,
            masterApiId: 0,
            text: [{
              type: ['plain'],
              color: '#FFFFFF',
              text: 'Lost connection to the server'
            }],
            category: 'system'
          };
        }
        else if (wasConnected === false && isConnected === true) {
          messageToUser = {
            actorId: 0,
            masterApiId: 0,
            text: [{
              type: ['plain'],
              color: '#FFFFFF',
              text: 'Reconnected'
            }],
            category: 'system'
          };
        }
        if (messageToUser) {
          var msgString = JSON.stringify(messageToUser);
          var src2 = '';
          src2 += 'window.chatMessages = window.chatMessages || [];';
          src2 += 'window.chatMessages.push(' + msgString + ');';
          src2 += 'window.chatMessages = window.chatMessages.slice(-50);';
          src2 += refreshWidgets;
          src2 += 'if (window.scrollToLastMessage) { window.scrollToLastMessage(); }';
          ctx.sp.browser.executeJavaScript(src2);
        }
      }

      if (ctx.value === ctx.state.chatPrevValue && isInputHidden === ctx.state.chatIsInputHidden) {
        return;
      }
      ctx.state.chatPrevValue = ctx.value;
      ctx.state.chatIsInputHidden = isInputHidden;

      if (!ctx.value || !ctx.value.show) {
        var src3 = '';
        src3 += 'window.chat = [];';
        src3 += refreshWidgets;
        return ctx.sp.browser.executeJavaScript(src3);
      }

      var src4 = '';
      src4 += 'window.chatMessages = window.chatMessages || [];';
      src4 += 'window.chat = [{}];';
      src4 += 'window.chat[0].type = "chat";';
      src4 += 'window.chat[0].messages = window.chatMessages;';
      src4 += 'window.chat[0].send = (text) => window.skyrimPlatform.sendMessage("chatInput", text);';
      src4 += 'window.chat[0].isInputHidden = ' + isInputHidden + ';';
      src4 += refreshWidgets;
      ctx.sp.browser.executeJavaScript(src4);
    };
  }

  static clientsideInitChatInput() {
    return () => {
      ctx.sp.on('browserMessage', (event) => {
        if (event.arguments[0] === 'chatInput') {
          ctx.sendEvent(...event.arguments);
        }
      });
    };
  }
}

ChatProperty.chatInputHandler = () => {};

module.exports = {
  ChatMessage,
  createSystemMessage,
  ChatProperty,
  getColorByNickname,
};
