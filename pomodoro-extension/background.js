// 后台计时逻辑
let timerState = {
  isRunning: false,
  endTime: null,      // Unix timestamp (ms)
  duration: 25 * 60, // 默认25分钟（秒）
  pausedRemaining: null
};

// 从 storage 恢复状态
chrome.runtime.onStartup.addListener(init);
chrome.runtime.onInstalled.addListener(init);

function init() {
  loadState();
  migrateStats();
}

function loadState() {
  chrome.storage.local.get(['timerState'], (result) => {
    if (result.timerState) {
      timerState = result.timerState;
      if (timerState.isRunning && timerState.endTime) {
        const remaining = Math.floor((timerState.endTime - Date.now()) / 1000);
        if (remaining <= 0) {
          onTimerComplete();
        } else {
          startAlarm(remaining);
          startBadgeUpdate(); // 恢复时启动 badge 更新
        }
      }
    }
  });
}

function saveState() {
  chrome.storage.local.set({ timerState });
}

function startAlarm(seconds) {
  chrome.alarms.create('pomodoro', { delayInMinutes: seconds / 60 });
  startBadgeUpdate();
}

function clearAlarm() {
  chrome.alarms.clear('pomodoro');
  stopBadgeUpdate();
}

// Badge 倒计时更新
let badgeInterval = null;

function startBadgeUpdate() {
  stopBadgeUpdate();
  updateBadge(); // 立即更新一次
  badgeInterval = setInterval(updateBadge, 1000);
}

function stopBadgeUpdate() {
  if (badgeInterval) {
    clearInterval(badgeInterval);
    badgeInterval = null;
  }
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
}

function updateBadge() {
  if (!timerState.isRunning || !timerState.endTime) {
    stopBadgeUpdate();
    return;
  }

  const remaining = Math.max(0, Math.floor((timerState.endTime - Date.now()) / 1000));
  if (remaining <= 0) {
    stopBadgeUpdate();
    return;
  }

  const minutes = Math.floor(remaining / 60);
  const text = minutes > 99 ? '99+' : String(minutes);
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: '#e94560' });
}

// 数据迁移：旧格式（无 sessions）→ 新格式
function migrateStats() {
  chrome.storage.local.get(['stats'], (result) => {
    if (!result.stats) return;

    const stats = result.stats;

    // 已经有 sessions，不需要迁移
    if (stats.sessions && Array.isArray(stats.sessions)) return;

    // 旧数据迁移：根据 daily 的累计时间，估算生成 sessions
    stats.sessions = [];
    const daily = stats.daily || {};

    Object.entries(daily).forEach(([date, seconds]) => {
      const minutes = Math.floor(seconds / 60);
      // 估算：每25分钟算一个番茄，不足25分钟的也算一个
      const count = Math.max(1, Math.round(minutes / 25));
      const avgDuration = Math.floor(seconds / count);

      const [y, m] = date.split('-');
      const monthKey = `${y}-${m}`;

      for (let i = 0; i < count; i++) {
        stats.sessions.push({
          date: date,
          month: monthKey,
          year: y,
          duration: avgDuration,
          completedAt: new Date(date).getTime() + i * 1000 // 区分时间戳
        });
      }
    });

    // 排序
    stats.sessions.sort((a, b) => a.completedAt - b.completedAt);

    chrome.storage.local.set({ stats }, () => {
      console.log('[Pomodoro] Stats migrated:', stats.sessions.length, 'sessions');
    });
  });
}

// 计时结束
function onTimerComplete() {
  timerState.isRunning = false;
  timerState.endTime = null;
  stopBadgeUpdate();
  saveState();

  // 通知
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '番茄钟结束',
    message: '休息一下吧！',
    priority: 2
  });

  // 页面内弹窗提醒
  notifyAllTabs();

  // 记录统计
  recordSession();
}

function notifyAllTabs() {
  // 只在当前活跃标签页提示
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.id && tab.url && !tab.url.startsWith('chrome://')) {
      chrome.tabs.sendMessage(tab.id, { action: 'timerComplete' }).catch(() => {
        // 某些页面无法注入 content script，静默忽略
      });
    }
  });
}

function recordSession() {
  const now = new Date();
  const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const yearKey = `${now.getFullYear()}`;

  chrome.storage.local.get(['stats'], (result) => {
    const stats = result.stats || {
      daily: {}, monthly: {}, yearly: {},
      sessions: []
    };

    // 累计时间（秒）
    stats.daily[dateKey] = (stats.daily[dateKey] || 0) + timerState.duration;
    stats.monthly[monthKey] = (stats.monthly[monthKey] || 0) + timerState.duration;
    stats.yearly[yearKey] = (stats.yearly[yearKey] || 0) + timerState.duration;

    // 记录每次完成的番茄钟
    if (!stats.sessions) stats.sessions = [];
    stats.sessions.push({
      date: dateKey,
      month: monthKey,
      year: yearKey,
      duration: timerState.duration,  // 秒
      completedAt: Date.now()         // 完成时间戳
    });

    // 限制记录数量，保留最近 1000 条
    if (stats.sessions.length > 1000) {
      stats.sessions = stats.sessions.slice(-1000);
    }

    chrome.storage.local.set({ stats });
  });
}

// 监听 alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoro') {
    onTimerComplete();
  }
});

// 接收来自 popup / stats 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'start') {
    const duration = request.duration || 25 * 60;
    timerState.duration = duration;
    timerState.isRunning = true;
    timerState.endTime = Date.now() + duration * 1000;
    timerState.pausedRemaining = null;
    saveState();
    startAlarm(duration);
    sendResponse({ success: true, timerState });
    return true;
  }

  if (request.action === 'pause') {
    if (timerState.isRunning && timerState.endTime) {
      timerState.pausedRemaining = Math.max(0, Math.floor((timerState.endTime - Date.now()) / 1000));
      timerState.isRunning = false;
      timerState.endTime = null;
      clearAlarm();
      stopBadgeUpdate();
      saveState();
    }
    sendResponse({ success: true, timerState });
    return true;
  }

  if (request.action === 'resume') {
    if (timerState.pausedRemaining && timerState.pausedRemaining > 0) {
      timerState.isRunning = true;
      timerState.endTime = Date.now() + timerState.pausedRemaining * 1000;
      timerState.duration = timerState.pausedRemaining;
      timerState.pausedRemaining = null;
      saveState();
      startAlarm(Math.floor((timerState.endTime - Date.now()) / 1000));
    }
    sendResponse({ success: true, timerState });
    return true;
  }

  if (request.action === 'reset') {
    timerState.isRunning = false;
    timerState.endTime = null;
    timerState.pausedRemaining = null;
    clearAlarm();
    stopBadgeUpdate();
    saveState();
    sendResponse({ success: true, timerState });
    return true;
  }

  if (request.action === 'getState') {
    if (timerState.isRunning && timerState.endTime) {
      const remaining = Math.max(0, Math.floor((timerState.endTime - Date.now()) / 1000));
      if (remaining === 0) {
        onTimerComplete();
      }
      sendResponse({ timerState: { ...timerState, remaining } });
    } else {
      sendResponse({ timerState });
    }
    return true;
  }

  if (request.action === 'getStats') {
    chrome.storage.local.get(['stats'], (result) => {
      sendResponse({ stats: result.stats || { daily: {}, monthly: {}, yearly: {}, sessions: [] } });
    });
    return true;
  }

  // 导出数据
  if (request.action === 'exportStats') {
    chrome.storage.local.get(['stats'], (result) => {
      const data = {
        version: '1.2',
        exportedAt: new Date().toISOString(),
        stats: result.stats || { daily: {}, monthly: {}, yearly: {}, sessions: [] }
      };
      sendResponse({ data: JSON.stringify(data, null, 2) });
    });
    return true;
  }

  // 导入数据
  if (request.action === 'importStats') {
    try {
      const imported = JSON.parse(request.json);
      if (imported.stats) {
        chrome.storage.local.set({ stats: imported.stats }, () => {
          sendResponse({ success: true, count: imported.stats.sessions?.length || 0 });
        });
      } else {
        sendResponse({ success: false, error: 'Invalid format' });
      }
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }
});

// 初始化
init();
