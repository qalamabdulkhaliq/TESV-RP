import type { Mp } from './skymp';
import type { EventBus } from './events';
import type { PlayerStore } from './store';
import type { PlayerId } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHAT_MSG_KEY = 'ff_chatMsg';

// Sequence counter — ensures repeated identical text still triggers updateOwner
let _msgSeq = 0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a single chat message to a player's browser window.
 * Triggers makeProperty updateOwner on the client, which pushes the text
 * into window.chatMessages and re-renders the chat widget.
 */
export function sendChatMessage(mp: Mp, playerId: PlayerId, text: string): void {
  mp.set(playerId, CHAT_MSG_KEY, { text, seq: ++_msgSeq });
}

/**
 * Broadcast a message to all players in the sender's hold.
 * If sender has no hold, broadcasts to all online players.
 */
export function broadcastToHold(
  mp: Mp,
  store: PlayerStore,
  senderId: PlayerId,
  text: string,
): void {
  const sender = store.get(senderId);
  const holdId = sender?.holdId;
  for (const p of store.getAll()) {
    if (!holdId || p.holdId === holdId) {
      sendChatMessage(mp, p.id, text);
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initChat(mp: Mp, _store: PlayerStore, _bus: EventBus): void {
  console.log('[Chat] Initializing');

  // Property carries one message at a time (with seq to make each set unique).
  // updateOwner runs in Skyrim Platform context on the client; pushes text
  // into window.chatMessages and re-renders the chat widget.
  mp.makeProperty(CHAT_MSG_KEY, {
    isVisibleByOwner: true,
    isVisibleByNeighbors: false,
    updateOwner: `
      var v = ctx.value;
      var text = (v && typeof v.text === 'string') ? v.text : (typeof v === 'string' ? v : '');
      if (!text) return;
      var escaped = JSON.stringify(text);
      ctx.sp.browser.executeJavaScript(
        'if(!window.chatMessages)window.chatMessages=[];' +
        'window.chatMessages=window.chatMessages.concat([{text:[{text:' + escaped + ',color:"#ffffff",opacity:1,type:[]}],opacity:1,category:"rp"}]);' +
        'if(window.chatMessages.length>200)window.chatMessages=window.chatMessages.slice(-200);' +
        'if(window._ffChatSend)window.skyrimPlatform.widgets.set([{type:"chat",send:window._ffChatSend,messages:window.chatMessages,placeholder:"Type /command or message...",isInputHidden:false}]);'
      );
    `,
    updateNeighbor: '',
  });

  // Event source: runs once per player session in the Skyrim Platform context.
  // Initialises the chat widget in the browser and bridges browser input to
  // the server via ctx.sendEvent (which fires mp['_ff_chat'] on the server).
  //
  // Name MUST start with '_' — ActionListener::OnCustomEvent checks eventName[0].
  mp.makeEventSource('_ff_chat', `
    ctx.sp.browser.executeJavaScript(
      'if(!window.chatMessages)window.chatMessages=[];' +
      'window._ffChatSend=function(t){if(window.mp&&window.mp.send)window.mp.send("chatSend",t);};' +
      'window.scrollToLastMessage=function(){var c=document.querySelector(".chat-list");if(c)c.scrollTop=c.scrollHeight;};' +
      'window.skyrimPlatform.widgets.set([{' +
      '  type:"chat",' +
      '  send:window._ffChatSend,' +
      '  messages:window.chatMessages,' +
      '  placeholder:"Type /command or message...",' +
      '  isInputHidden:false' +
      '}]);'
    );
    ctx.sp.on('browserMessage', function(e) {
      var args = e.arguments;
      if (args && args[0] === 'chatSend' && typeof args[1] === 'string' && args[1].trim()) {
        ctx.sendEvent(args[1].trim());
      }
    });
  `);

  console.log('[Chat] Ready');
}
