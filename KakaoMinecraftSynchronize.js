const scriptName="KakaoMinecraftSynchronize.js";

const config = {
  // 채팅 공유를 사용할 채팅방 이름
  targetChatRoom: '채팅방 이름 예제',
  // 서버로 부터 새로 추가된 메시지를 확인할 간격
  updateInterval: 1000,
  // 업데이트를 받을 서버의 주소
  updateServer: 'http://example.com:3000'
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
  ready: false,
  updateIntervalUid: null,
  serverConnected: false,
  isTimeoutMessageSend: true,
  isErrorOccur: true,
};

function handleError(err) {
  if (!local.isErrorOccur) {
    local.isErrorOccur = true;
    Api.replyRoom(config.targetChatRoom, '[KMS] 카카오쪽 스크립트에 알 수 없는 오류 발생. 이후 오류 메시지는 로그창에만 기록됩니다.' 
      + '\n[KMS ERROR LINE: ' + err.lineNumber + '] ' + err.message);
  }
  Log.error('[KMS ERROR LINE: ' + err.lineNumber + '] ' + err.message, true);
}

function startUpdate() {
  if (local.ready) return;
  local.ready = true;
  local.updateIntervalUid = setInterval(function() {
    try {
      if (!Api.isOn(scriptName)) {
        Log.info('[KMS] 스크립트 종료로 인한 Interval 해제');
        stopUpdate();
      }

      if (!local.serverConnected) {
        Utils.getWebText(config.updateServer + '/k/c');
        local.serverConnected = true;
      }

      var res = '' + Utils.getWebText(config.updateServer + '/k/u');
      if (!res) return Log.debug('[KMS] 빈 응답1');
      Log.debug(res);
      if (res.length > 5 && res.substring(0, 5) === '<html') {
        const isMatch = res.match(/<body>\n?((?:.|\n)*)\n?<\/body>/);
        if (!isMatch) return Log.debug('[KMS] 빈 응답2');
        if (!isMatch[1]) return Log.debug('[KMS] 받은 업데이트 없음');
        res = isMatch[1];
      }

      var data = {};
      try {
        data = JSON.parse(res);
      } catch (err) {
        return Log.error('[KMS] 응답 JSON 파싱 실패: ' + err.message);
      }
      if (!data || !data.m || data.m.length === 0) {
        return Log.error('[KMS] 파상한 데이터가 비어있습니다. 이 일은 일어날 수 없습니다');
      }

      for (var i in data.m) {
        Api.replyRoom(config.targetChatRoom, data.m[i]);
      }
    } catch (err) {
      if (err && err.class && err.class === java.net.SocketTimeoutException) {
        if (!local.isTimeoutMessageSend) {
          local.isTimeoutMessageSend = true;
          Api.replyRoom(config.targetChatRoom, '[KMS] 중계서버로부터 응답이 없습니다. 연결이 복구되면 메시지를 다시 전송합니다. 이 메시지는 한번만 표시됩니다.');
        }
        return Log.debug('[KMS] 중계서버 타임아웃');
      }
      handleError(err);
      stopUpdate();
    }
  }, config.updateInterval);
}

function stopUpdate() {
  if (!local.ready) return;
  local.ready = false;
  clearInterval(local.updateIntervalUid);
  local.updateIntervalUid = null;
}

function response(room, msg, sender, isGroupChat, replier, ImageDB, packageName, threadId){
  if (room === config.targetChatRoom) {
    if (!local.isReady) startUpdate();
  }
}

function onStartCompile() {
  if (local.ready) local.stopUpdate();
}

function onCreate(savedInstanceState,activity) {}
function onResume(activity) {}
function onPause(activity) {}
function onStop(activity) {}
