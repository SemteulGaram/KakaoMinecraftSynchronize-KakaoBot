const scriptName="KakaoMinecraftSynchronize.js";
const VERSION = 'v1.0.3';

const config = {
  // 채팅 공유를 사용할 채팅방 이름
  targetChatRoom: '채팅방 이름 예제',
  // 에러를 통보할 채팅방 이름 (추천은 하지 않지만 위 채팅방과 같은 채팅방을 써도 됨)
  errorTargetChatRoom: '에러 메시지를 받을 채팅방 이름 예제',
  // 업데이트를 받을 서버의 주소
  updateServer: 'http://example.com:7110',
  // 서버로 부터 새로 추가된 메시지를 확인할 간격 (밀리초)
  updateInterval: 500,
  // 서버와 연결되지 않은 상태에서 임시로 보관할 메시지의 수
  maxSendQueue: 4
};

// setInterval in Rhino: https://stackoverflow.com/a/22337881
(function(global) {
  var timer = new java.util.Timer();
  var counter = 1;
  var ids = {};

  global.setTimeout = function(fn, delay) {
      var id = counter;
      counter += 1;
      ids[id] = new JavaAdapter(java.util.TimerTask, { run : fn });
      timer.schedule(ids[id], delay);
      return id;
  };

  global.clearTimeout = function(id) {
      ids[id].cancel();
      timer.purge();
      delete ids[id];
  };

  global.setInterval = function(fn, delay) {
      var id = counter;
      counter += 1;
      ids[id] = new JavaAdapter(java.util.TimerTask, { run : fn });
      timer.schedule(ids[id], delay, delay);
      return id;
  };

  global.clearInterval = global.clearTimeout;

  // exports object in case of "isCommonJS"
  global.exports = {};

})(this);

const local = {
  updateIntervalUid: null,
  serverConnected: false,
  firstErrorOccur: false,
  firstTimeoutMessageSend: false,
  status: 'DISCONNECT',
  sendQueue: [],
  cUrl: config.updateServer + '/k/c',
  uUrl: config.updateServer + '/k/u',
  mUrl: config.updateServer + '/k/m'
};

function sendChat (msg) {
  Api.replyRoom(config.targetChatRoom, '' + msg);
}

function sendErrorChat (msg) {
  Api.replyRoom(config.errorTargetChatRoom, '' + msg);
}

function handleError (err) {
  this.serverConnected = false;

  if (err === null || err === undefined) err = new Error('Blank error');
  const errMsg = '' + err;

  if (errMsg.match('ENETUNREACH')) {
    if (local.status !== 'ENETUNREACH') {
      local.status = 'ENETUNREACH';
      Log.error('KMS> 네트워크 연결끊김\n업데이트가 중지됩니다.', true);
    }
    return;
  }
  if (errMsg.match('EHOSTUNREACH')) {
    if (local.status !== 'EHOSTUNREACH') {
      local.status = 'EHOSTUNREACH';
      Log.error('KMS> 호스트 못 찾음\n중간서버의 주소를 잘못 입력했을 수 있습니다\n컨피그를 수정해주세요');
      sendErrorChat('KMS> 호스트 못 찾음\n중간서버의 주소를 잘못 입력했을 수 있습니다\n컨피그를 수정해주세요');
    }
    return;
  }
  if (errMsg.match('java.net.SocketTimeoutException')) {
    if (local.status !== 'ETIMEOUT') {
      local.status = 'ETIMEOUT';
      Log.error('KMS> 중간서버 연결끊김\n연결이 복구되면 메시지 전송이 재개됩니다', true);
      sendErrorChat('KMS> 중간서버 연결끊김\n연결이 복구되면 메시지 전송이 재개됩니다');
    }
    return;
  }
  // Unexpected Error
  if (!local.firstErrorOccur) {
    local.firstErrorOccur = true;
    sendErrorChat('KMS> 스크립트에 예상 못 한 오류 발생\n이후 예상 못 한 오류 메시지는 로그창에만 기록됩니다'
      + '\n[KMS ERROR LINE: ' + err.lineNumber + '] ' + err);
  }
  if (local.status !== errMsg) {
    local.status = errMsg;
    Log.error('[KMS ERROR LINE: ' + err.lineNumber + '] ' + err, true);
    Api.makeNoti('KMS> 예상 못 한 오류 알림', '' + err, 7200);
  }
}

// base64 character set, plus padding character (=)
var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
// Regular expression to check formal correctness of base64 encoded strings
b64re = /^(?:[A-Za-z\d+\/]{4})*?(?:[A-Za-z\d+\/]{2}(?:==)?|[A-Za-z\d+\/]{3}=?)?$/;

function btoa (string) {
  string = String(string);
  var bitmap, a, b, c,
    result = "", i = 0,
    rest = string.length % 3; // To determine the final padding

  for (; i < string.length;) {
    if ((a = string.charCodeAt(i++)) > 255
      || (b = string.charCodeAt(i++)) > 255
      || (c = string.charCodeAt(i++)) > 255)
      throw new TypeError("Failed to execute 'btoa' on 'Window': The string to be encoded contains characters outside of the Latin1 range.");

    bitmap = (a << 16) | (b << 8) | c;
    result += b64.charAt(bitmap >> 18 & 63) + b64.charAt(bitmap >> 12 & 63)
      + b64.charAt(bitmap >> 6 & 63) + b64.charAt(bitmap & 63);
  }

  // If there's need of padding, replace the last 'A's with equal signs
  return rest ? result.slice(0, rest - 3) + "===".substring(rest) : result;
};

function atob (string) {
  // atob can work with strings with whitespaces, even inside the encoded part,
  // but only \t, \n, \f, \r and ' ', which can be stripped.
  string = String(string).replace(/[\t\n\f\r ]+/g, "");
  if (!b64re.test(string))
    throw new TypeError("Failed to execute 'atob' on 'Window': The string to be decoded is not correctly encoded.");

  // Adding the padding if missing, for semplicity
  string += "==".slice(2 - (string.length & 3));
  var bitmap, result = "", r1, r2, i = 0;
  for (; i < string.length;) {
    bitmap = b64.indexOf(string.charAt(i++)) << 18 | b64.indexOf(string.charAt(i++)) << 12
      | (r1 = b64.indexOf(string.charAt(i++))) << 6 | (r2 = b64.indexOf(string.charAt(i++)));

    result += r1 === 64 ? String.fromCharCode(bitmap >> 16 & 255)
      : r2 === 64 ? String.fromCharCode(bitmap >> 16 & 255, bitmap >> 8 & 255)
      : String.fromCharCode(bitmap >> 16 & 255, bitmap >> 8 & 255, bitmap & 255);
  }
  return result;
};

function extractResponse(response) {
  const matched = response.match(/^<html(?:.|\n)*<body>\n?((?:.|\n)*?)\n?<\/body>(?:.|\n)*html>$/);
  if (matched) {
    var json = (matched[1] || '').replace(/^[ \n\0]+/, '').replace(/[ \n\0]+$/, '');
    if (json) {
      return json
    }
  };
  return false;
}

function startUpdate () {
  if (local.updateIntervalUid) return;
  local.updateIntervalUid = setInterval(function() {
    try {
      if (!Api.isOn(scriptName)) {
        Log.info('KMS> 스크립트 종료로 인한 Interval 해제');
        return stopUpdate();
      }

      if (!Api.canReply(config.targetChatRoom)) {
        if (local.status !== 'WAITFIRSTCHAT') {
          local.status = 'WAITFIRSTCHAT';
          Log.info('KMS> 첫 메시지 알림을 "' + config.targetChatRoom + '"으로부터 받아야 서비스 시작이 가능합니다');
          Api.showToast('KMS> 첫 메시지 알림을 "' + config.targetChatRoom + '"으로부터 받아야 서비스 시작이 가능합니다', '');
        }
        return;
      }

      if (!Api.canReply(config.errorTargetChatRoom)) {
        if (local.status !== 'WAITFIRSTERRORCHAT') {
          local.status = 'WAITFIRSTERRORCHAT';
          Log.info('KMS> 첫 메시지 알림을 "' + config.errorTargetChatRoom + '"으로부터 받아야 서비스 시작이 가능합니다.');
          Api.showToast('KMS> 첫 메시지 알림을 "' + config.errorTargetChatRoom + '"으로부터 받아야 서비스 시작이 가능합니다.', '');
        }
        return;
      }

      if (!local.serverConnected) {
        // TODO: check response
        Utils.getWebText(local.cUrl)
        local.serverConnected = true;
        Log.info('KMS> 중간서버와 연결됨');
        sendErrorChat('KMS> 중간서버와 연결됨');

        if (local.sendQueue.length !== 0) sendQueueData();
      }

      var res = Utils.getWebText(local.uUrl);
      res = extractResponse(res);

      if (!res) {
        if (local.status !== 'EEMPTYRESPONSE') {
          //local.status = 'EEMPTYRESPONSE';
          //Log.error('KMS> 중간서버의 빈 응답\n받은 응답: ' + res, true);
          //sendErrorChat('KMS> 중간서버의 빈 응답\n받은 응답: ' + res);
        }

        if (local.status !== 'READY') {
          local.status = 'READY';
        }
        return;
      }

      // Server didn't have update
      if (res === 'N') {
        if (local.status !== 'READY') {
          local.status = 'READY';
        }
        return;
      }
      
      var data = null;
      try {
        data = JSON.parse(res);
      } catch (err) {
        if (local.status !== 'EJSONPARSE') {
          local.status = 'EJSONPARSE';
          Log.error('KMS> 중간서버의 잘못된 JSON응답\n받은 응답: ' + res + '\n' + err, true);
          sendErrorChat('KMS> 중간서버의 잘못된 JSON응답\n받은 응답: ' + btoa(res) + '\n' + err);
        }
        return;
      }

      if (!data || !data.m || !data.m.length) {
        if (local.status !== 'EINVALIDRESPONSE') {
          local.status = 'EINVALIDRESPONSE';
          Log.error('KMS> 중간서버의 잘못된 응답2\n받은 응답: ' + res, true);
          sendErrorChat('KMS> 중간서버의 잘못된 응답2\n받은 응답: ' + res);
        }
        return;
      }

      const msgs = data.m.join('\n')
        .replace('&amp;', '&')
        .replace('&lt;', '<')
        .replace('&qt;', '>');
      Log.debug('KMS>Server>' + msgs);
      sendChat(msgs);

      if (local.status !== 'READY') {
        local.status = 'READY';
      }
    } catch (err) {
      handleError(err);
    }
  }, config.updateInterval);
}

function sendQueueData () {
  if (local.sendQueue.length === 0) return;

  try {
    const jsonObject = {
      m: local.sendQueue
    }
    local.sendQueue = [];

    const payload = encodeURIComponent(JSON.stringify(jsonObject));
    Log.debug('KMS>Kakao>' + jsonObject.m.join('\n'));
    Utils.getWebText(local.mUrl + '?v=' + payload);
  } catch (err) {
    handleError(err);
  }
}

function stopUpdate () {
  if (!local.updateIntervalUid) return;
  clearInterval(local.updateIntervalUid);
  local.updateIntervalUid = null;
}

function response (room, msg, sender, isGroupChat, replier, ImageDB, packageName, threadId){
  if (!local.updateIntervalUid) startUpdate();
  if (room !== config.targetChatRoom) return;
  const msg2 = '<' + sender + '> ' + msg;
  if (local.serverConnected) {
    if (local.sendQueue.length !== 0) sendQueueData();
    try {
      Log.debug('KMS>Kakao>' + msg2);
      Utils.getWebText(local.mUrl + '?v='
        + encodeURIComponent(JSON.stringify({ m: [msg2] })));
    } catch (err) {
      handleError(err);
    }
  } else {
    local.sendQueue.push(msg2);
    if (local.sendQueue.length >= config.maxSendQueue) {
      Log.error('KMS> 오프라인 메시지 큐가 가득찼습니다\n오래된 메시지부터 삭제됩니다', true);
      local.sendQueue.splice(0, local.sendQueue.length - config.maxSendQueue);
    }
  }
}

function onStartCompile () {
  stopUpdate();
}

function onCreate (savedInstanceState,activity) {
  startUpdate();
}
function onResume (activity) {}
function onPause (activity) {}
function onStop (activity) {}
