// 页面内弹窗提醒
(function() {
  'use strict';

  // 防止重复注入
  if (document.getElementById('pomodoro-overlay')) return;

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pomodoro-overlay';
    overlay.innerHTML = `
      <div id="pomodoro-modal">
        <div class="pomodoro-icon">🍅</div>
        <div class="pomodoro-title">番茄钟结束</div>
        <div class="pomodoro-message">休息一下吧！</div>
        <button class="pomodoro-btn">我知道了</button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #pomodoro-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2147483647;
        animation: pomodoroFadeIn 0.3s ease;
      }
      #pomodoro-modal {
        background: #1a1a2e;
        border-radius: 16px;
        padding: 32px 40px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        animation: pomodoroSlideIn 0.3s ease;
        min-width: 260px;
      }
      .pomodoro-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .pomodoro-title {
        font-size: 22px;
        font-weight: bold;
        color: #e94560;
        margin-bottom: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .pomodoro-message {
        font-size: 15px;
        color: #ccc;
        margin-bottom: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .pomodoro-btn {
        background: #e94560;
        color: white;
        border: none;
        padding: 10px 28px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        transition: opacity 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }
      .pomodoro-btn:hover {
        opacity: 0.85;
      }
      @keyframes pomodoroFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes pomodoroSlideIn {
        from { transform: translateY(-20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    // 点击关闭
    overlay.querySelector('.pomodoro-btn').addEventListener('click', () => {
      overlay.remove();
      style.remove();
    });

    // 点击背景也可关闭
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        style.remove();
      }
    });

    // ESC 关闭
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        style.remove();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // 监听 background 消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'timerComplete') {
      createOverlay();
      sendResponse({ received: true });
    }
  });
})();
