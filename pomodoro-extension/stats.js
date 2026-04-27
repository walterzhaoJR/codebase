let currentYear = new Date().getFullYear();
let statsData = { daily: {}, monthly: {}, yearly: {}, sessions: [] };

// 返回按钮
document.getElementById('back-link').addEventListener('click', () => {
  window.close();
});

// 年份导航
document.getElementById('prev-year').addEventListener('click', () => {
  currentYear--;
  renderAll();
});
document.getElementById('next-year').addEventListener('click', () => {
  if (currentYear < new Date().getFullYear()) {
    currentYear++;
    renderAll();
  }
});

// 加载数据
function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (resp) => {
    statsData = resp.stats || { daily: {}, monthly: {}, yearly: {}, sessions: [] };
    renderAll();
  });
}

function renderAll() {
  document.getElementById('year-label').textContent = currentYear;
  document.getElementById('next-year').disabled = currentYear >= new Date().getFullYear();

  renderSummary();
  renderContributionGraph();
  renderMonthlyChart();
  renderWeekdayChart();
  renderTodayDetail();
}

// ------------------ 汇总卡片 ------------------
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderSummary() {
  const sessions = statsData.sessions || [];
  const daily = statsData.daily || {};
  const today = formatLocalDate(new Date());

  const totalSessions = sessions.length;

  let totalMinutes = 0;
  Object.values(daily).forEach(s => totalMinutes += Math.floor(s / 60));

  const todaySessions = sessions.filter(s => s.date === today).length;

  document.getElementById('total-sessions').textContent = totalSessions;
  document.getElementById('total-hours').textContent = (totalMinutes / 60).toFixed(1);
  document.getElementById('today-sessions').textContent = todaySessions;
  document.getElementById('streak-days').textContent = calculateStreak(sessions);
}

function calculateStreak(sessions) {
  // 用 sessions 数组计算连续天数，更准确
  const dateSet = new Set(sessions.map(s => s.date));
  const dates = Array.from(dateSet).sort();
  if (dates.length === 0) return 0;

  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 365; i++) {
    const check = new Date(today);
    check.setDate(check.getDate() - i);
    const key = formatLocalDate(check);
    if (dateSet.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

// ------------------ GitHub Contribution 图 ------------------
function renderContributionGraph() {
  const container = document.getElementById('contribution-body');
  container.innerHTML = '';

  const sessions = statsData.sessions || [];

  const dayCounts = {};
  sessions.forEach(s => {
    if (s.date.startsWith(String(currentYear))) {
      dayCounts[s.date] = (dayCounts[s.date] || 0) + 1;
    }
  });

  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31);

  const firstDay = new Date(yearStart);
  while (firstDay.getDay() !== 0) {
    firstDay.setDate(firstDay.getDate() - 1);
  }

  const lastDay = new Date(yearEnd);
  while (lastDay.getDay() !== 6) {
    lastDay.setDate(lastDay.getDate() + 1);
  }

  const maxCount = Math.max(...Object.values(dayCounts), 1);

  let current = new Date(firstDay);
  while (current <= lastDay) {
    const weekCol = document.createElement('div');
    weekCol.className = 'week-col';

    for (let day = 0; day < 7; day++) {
      const cellDate = new Date(current);
      const dateKey = formatLocalDate(cellDate);
      const count = dayCounts[dateKey] || 0;
      const minutes = Math.floor((statsData.daily[dateKey] || 0) / 60);

      const cell = document.createElement('div');
      cell.className = 'day-cell';

      let level = 0;
      if (count > 0) {
        if (maxCount <= 4) {
          level = count >= 4 ? 4 : count >= 3 ? 3 : count >= 2 ? 2 : 1;
        } else {
          level = count >= maxCount * 0.75 ? 4 :
                  count >= maxCount * 0.5 ? 3 :
                  count >= maxCount * 0.25 ? 2 : 1;
        }
      }
      cell.classList.add(`level-${level}`);

      const month = cellDate.getMonth() + 1;
      const dayNum = cellDate.getDate();
      const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
      const hours = (minutes / 60).toFixed(1);
      cell.setAttribute('data-tip', `${month}月${dayNum}日 ${weekDays[day]} · ${count} 个番茄 · ${hours} 小时`);

      if (cellDate.getFullYear() !== currentYear) {
        cell.style.opacity = '0.2';
      }

      weekCol.appendChild(cell);
      current.setDate(current.getDate() + 1);
    }

    container.appendChild(weekCol);
  }
}

// ------------------ 周分布柱状图 ------------------
function renderWeekdayChart() {
  const container = document.getElementById('weekday-chart');
  container.innerHTML = '';

  const sessions = statsData.sessions || [];
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // 统计每周各天：番茄数 + 总时长
  const weekdayData = weekdays.map(() => ({ count: 0, minutes: 0 }));
  sessions.forEach(s => {
    if (s.date && s.date.startsWith(String(currentYear))) {
      const d = new Date(s.date + 'T00:00:00');
      const dayIndex = d.getDay(); // 0=周日, 1=周一...
      weekdayData[dayIndex].count += 1;
      weekdayData[dayIndex].minutes += Math.floor(s.duration / 60);
    }
  });

  const maxCount = Math.max(...weekdayData.map(d => d.count), 1);
  const maxMinutes = Math.max(...weekdayData.map(d => d.minutes), 1);

  weekdayData.forEach((data, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'weekday-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'weekday-bar';
    // 以最高分钟数为基准，统一按时长比例计算高度，留 20px 顶部空间
    const height = Math.max(2, Math.floor((data.minutes / maxMinutes) * 110));
    bar.style.height = height + 'px';
    const weekdayHours = (data.minutes / 60).toFixed(1);
    bar.setAttribute('data-tip', `${weekdays[i]}: ${data.count} 个番茄 · ${weekdayHours} 小时`);

    const lbl = document.createElement('div');
    lbl.className = 'weekday-label';
    lbl.textContent = weekdays[i];

    const stats = document.createElement('div');
    stats.className = 'weekday-stats';
    stats.innerHTML = `<span class="count">${data.count}</span> 🍅<br>${weekdayHours} 小时`;

    wrapper.appendChild(bar);
    wrapper.appendChild(lbl);
    wrapper.appendChild(stats);
    container.appendChild(wrapper);
  });
}

// ------------------ 月度柱状图（含个数+时长） ------------------
function renderMonthlyChart() {
  const container = document.getElementById('monthly-chart');
  container.innerHTML = '';

  const sessions = statsData.sessions || [];

  // 统计每月：番茄数 + 总时长
  const monthData = {};
  sessions.forEach(s => {
    if (s.month && s.month.startsWith(String(currentYear))) {
      if (!monthData[s.month]) {
        monthData[s.month] = { count: 0, minutes: 0 };
      }
      monthData[s.month].count += 1;
      monthData[s.month].minutes += Math.floor(s.duration / 60);
    }
  });

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${currentYear}-${String(m).padStart(2, '0')}`;
    months.push({
      label: `${m}月`,
      ...monthData[key] || { count: 0, minutes: 0 }
    });
  }

  const maxCount = Math.max(...months.map(m => m.count), 1);
  const maxMinutes = Math.max(...months.map(m => m.minutes), 1);

  months.forEach(({ label, count, minutes }) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'month-bar-wrapper';

    const bar = document.createElement('div');
    bar.className = 'month-bar';
    // 以最高分钟数为基准，统一按时长比例计算高度，留 20px 顶部空间
    const height = Math.max(2, Math.floor((minutes / maxMinutes) * 110));
    bar.style.height = height + 'px';
    const monthHours = (minutes / 60).toFixed(1);
    bar.setAttribute('data-tip', `${label}: ${count} 个番茄 · ${monthHours} 小时`);

    const lbl = document.createElement('div');
    lbl.className = 'month-label';
    lbl.textContent = label;

    const stats = document.createElement('div');
    stats.className = 'month-stats';
    stats.innerHTML = `<span class="count">${count}</span> 🍅<br>${monthHours} 小时`;

    wrapper.appendChild(bar);
    wrapper.appendChild(lbl);
    wrapper.appendChild(stats);
    container.appendChild(wrapper);
  });
}

// ------------------ 今日详情 ------------------
function renderTodayDetail() {
  const container = document.getElementById('today-detail');
  container.innerHTML = '';

  const today = formatLocalDate(new Date());
  const sessions = (statsData.sessions || []).filter(s => s.date === today);

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-state-icon">📭</div>
        <div>今天还没有完成番茄钟</div>
      </div>
    `;
    return;
  }

  const totalMinutes = sessions.reduce((sum, s) => sum + Math.floor(s.duration / 60), 0);

  // 汇总
  const summary = document.createElement('div');
  summary.className = 'today-summary';
  summary.innerHTML = `
    <div class="today-summary-item">
      <div class="value">${sessions.length}</div>
      <div class="label">完成番茄</div>
    </div>
    <div class="today-summary-item">
      <div class="value">${(totalMinutes / 60).toFixed(1)}</div>
      <div class="label">专注小时</div>
    </div>
  `;
  container.appendChild(summary);

  // 时间线
  const timeline = document.createElement('div');
  timeline.className = 'today-timeline';

  sessions.forEach((s, i) => {
    const time = new Date(s.completedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const minutes = Math.floor(s.duration / 60);

    const item = document.createElement('div');
    item.className = 'today-item';
    item.innerHTML = `
      <span class="time">${time}</span>
      <span>第 ${i + 1} 个番茄</span>
      <span class="duration">${(minutes / 60).toFixed(1)} 小时</span>
    `;
    timeline.appendChild(item);
  });

  container.appendChild(timeline);
}

// ------------------ 导出/导入 ------------------
document.getElementById('btn-export').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'exportStats' }, (resp) => {
    if (resp && resp.data) {
      const blob = new Blob([resp.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pomodoro-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  });
});

document.getElementById('file-import').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const json = event.target.result;
    chrome.runtime.sendMessage({ action: 'importStats', json }, (resp) => {
      if (resp && resp.success) {
        alert(`导入成功！共 ${resp.count} 条记录`);
        loadStats();
      } else {
        alert('导入失败：' + (resp?.error || '未知错误'));
      }
    });
  };
  reader.readAsText(file);
  e.target.value = '';
});

// 初始化
loadStats();
