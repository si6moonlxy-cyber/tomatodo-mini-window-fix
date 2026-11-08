'use strict';
// tomatodo-mini-window-patch · renderer-side fixes
// Injected into the renderer after page load via webContents.executeJavaScript.
// Fixes:
//   1) saveRecordOnly crashes on a broken obfuscated Date[...]() call → record is lost.
//      Fallback: build the record manually, save via db:addRecord, then trigger cloud/phone sync.
//   2) doStopTimer aborts mid-way when any step throws → UI stays in "focusing" state.
//      Safety net: force reset timer state + UI in a finally block.
(function () {
  'use strict';

  // 1) saveRecordOnly fallback
  if (!window.__TOMATODO_RECORD_FALLBACK__) {
    window.__TOMATODO_RECORD_FALLBACK__ = true;
    var origSave = window.saveRecordOnly;
    if (typeof origSave === 'function') {
      window.saveRecordOnly = function (todo, minutes, isComplete) {
        try {
          return origSave.apply(this, arguments);
        } catch (e) {
          console.warn('[tomatodo-patch] saveRecordOnly failed, fallback:', e && e.message);
          try {
            var now = Date.now();
            var rec = {
              name: (todo && todo.name) || '',
              startDate: (typeof timerStartTime !== 'undefined' && timerStartTime) || now,
              createDate: now,
              time: minutes || 0,
              isComplete: isComplete ? 1 : 0,
              isSynced: 0,
              i1: isComplete ? 0 : 1,
              i2: 1,
              i3: 0,
              i4: 0,
              i5: 0,
              i6: 0,
              s1: '',
              s2: '',
              s3: '',
              s4: '',
              s5: ''
            };
            window.electronAPI.addRecord(rec).then(function (r) {
              try {
                if (typeof uploadRecentRecordsToCloud === 'function') uploadRecentRecordsToCloud();
              } catch (e3) {
                console.warn('[tomatodo-patch] cloud upload skipped:', e3);
              }
              try {
                if (typeof syncRecordToPhoneAsync === 'function') {
                  syncRecordToPhoneAsync(rec).then(function () {
                    rec.isSynced = 1;
                    if (window.electronAPI.updateRecord) window.electronAPI.updateRecord(rec);
                  }).catch(function (e4) {
                    console.warn('[tomatodo-patch] phone sync failed:', e4 && e4.message);
                  });
                }
              } catch (e5) {
                console.warn('[tomatodo-patch] phone sync skipped:', e5);
              }
            }).catch(function (e6) {
              console.warn('[tomatodo-patch] fallback addRecord failed:', e6);
            });
          } catch (e7) {
            console.warn('[tomatodo-patch] fallback failed:', e7);
          }
        }
      };
    }
  }

  // 2) doStopTimer safety net
  if (!window.__TOMATODO_STOP_FALLBACK__) {
    window.__TOMATODO_STOP_FALLBACK__ = true;
    var origStop = window.doStopTimer;
    if (typeof origStop === 'function') {
      window.doStopTimer = function (isComplete) {
        var ok = false;
        try {
          var r = origStop.apply(this, arguments);
          ok = true;
          return r;
        } catch (e) {
          console.warn('[tomatodo-patch] doStopTimer failed:', e && e.stack);
        } finally {
          if (!ok) {
            try {
              if (typeof TimerCoreState !== 'undefined') {
                TimerCoreState.isRunning = false;
                TimerCoreState.isPauseTimer = false;
                TimerCoreState.elapsedPauseTime = 0;
              }
              if (typeof currentTodo !== 'undefined') currentTodo = null;
              if (typeof timerStartTime !== 'undefined') timerStartTime = 0;
              if (typeof isPaused !== 'undefined') isPaused = false;
              if (typeof clearSavedTimerState === 'function') clearSavedTimerState();
              if (window.electronAPI && window.electronAPI.setTimerRunning) window.electronAPI.setTimerRunning(false);
              if (typeof updateTrayIcon === 'function') updateTrayIcon('idle', '');
              if (typeof showPage === 'function') showPage('timer');
              if (typeof updateView === 'function') updateView();
            } catch (e2) {
              console.warn('[tomatodo-patch] force reset failed:', e2 && e2.stack);
            }
          }
        }
      };
    }
  }
})();
