const display   = document.getElementById('timer-display');
const input     = document.getElementById('duration-input');
const btnStart  = document.getElementById('btn-start');
const btnPause  = document.getElementById('btn-pause');
const btnResume = document.getElementById('btn-resume');
const btnReset  = document.getElementById('btn-reset');
const statsLink = document.getElementById('stats-link');

// ------------------ 计时器 UI 更新 ------------------
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function updateUI(state) {
  const remaining = state.remaining != null ? state.remaining :
    (state.isRunning && state.endTime ? Math.max(0, Math.floor((state.endTime - Date.now())/1000)) : 0);

  display.textContent = formatTime(remaining);
  display.className = '';

  if (state.isRunning) {
    display.classList.add('running');
    btnStart.classList.add('hidden');
    btnPause.classList.remove('hidden');
    btnResume.classList.add('hidden');
    input.disabled = true;
  } else if (state.pausedRemaining) {
    display.classList.add('paused');
    display.textContent = formatTime(state.pausedRemaining);
    btnStart.classList.add('hidden');
    btnPause.classList.add('hidden');
    btnResume.classList.remove('hidden');
    input.disabled = true;
  } else {
    display.classList.add('stopped');
    const mins = parseInt(input.value) || 25;
    display.textContent = formatTime(mins * 60);
    btnStart.classList.remove('hidden');
    btnPause.classList.add('hidden');
    btnResume.classList.add('hidden');
    input.disabled = false;
  }
}

function fetchState() {
  chrome.runtime.sendMessage({ action: 'getState' }, (resp) => {
    if (resp) updateUI(resp.timerState);
  });
}

// ------------------ 按钮事件 ------------------
btnStart.addEventListener('click', () => {
  const mins = parseInt(input.value) || 25;
  chrome.runtime.sendMessage({ action: 'start', duration: mins * 60 }, (resp) => {
    if (resp) updateUI(resp.timerState);
  });
});

btnPause.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'pause' }, (resp) => {
    if (resp) updateUI(resp.timerState);
  });
});

btnResume.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'resume' }, (resp) => {
    if (resp) updateUI(resp.timerState);
  });
});

btnReset.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'reset' }, (resp) => {
    if (resp) updateUI(resp.timerState);
  });
});

// 跳转统计页面
statsLink.addEventListener('click', () => {
  const url = chrome.runtime.getURL('stats.html');
  chrome.tabs.create({ url });
});

// ------------------ 实时倒计时 ------------------
let tickInterval = null;
function startTick() {
  stopTick();
  tickInterval = setInterval(fetchState, 1000);
}
function stopTick() {
  if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
}

// 初始化
fetchState();
startTick();
window.addEventListener('unload', stopTick);
