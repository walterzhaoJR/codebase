const STORAGE_KEY = 'things3-web-data-v1';

let state = {
  tasks: [],
  projects: [],
  currentView: 'today',
  currentProjectId: null,
  editingTaskId: null
};

const elements = {
  viewTitle: document.getElementById('view-title'),
  tasksContainer: document.getElementById('tasks-container'),
  emptyState: document.getElementById('empty-state'),
  projectsList: document.getElementById('projects-list'),
  todayCount: document.getElementById('today-count'),
  upcomingCount: document.getElementById('upcoming-count'),
  taskModal: document.getElementById('task-modal'),
  projectModal: document.getElementById('project-modal'),
  taskDetailModal: document.getElementById('task-detail-modal'),
  taskForm: document.getElementById('task-form'),
  projectForm: document.getElementById('project-form'),
  taskProjectSelect: document.getElementById('task-project'),
  iconPicker: document.getElementById('icon-picker')
};

// ===== Storage =====
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      state.tasks = (data.tasks || []).map(task => {
        // 兼容旧版数据：补全 completedAt 字段
        if (task.completed && !task.completedAt) {
          task.completedAt = task.notifiedAt || Date.now();
        }
        // 兼容旧版的“稍后提醒”数据。
        if (!task.nextReminderAt && task.snoozeUntil) {
          task.nextReminderAt = task.snoozeUntil;
        }
        delete task.snoozeUntil;
        return task;
      });
      state.projects = data.projects || [];
    }
  } catch (e) {
    console.error('加载数据失败', e);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tasks: state.tasks,
      projects: state.projects
    }));
  } catch (e) {
    console.error('保存数据失败', e);
  }
}

function exportData() {
  const blob = new Blob([JSON.stringify({ tasks: state.tasks, projects: state.projects }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `things3-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(text) {
  try {
    const data = JSON.parse(text);
    if (Array.isArray(data.tasks) && Array.isArray(data.projects)) {
      state.tasks = data.tasks;
      state.projects = data.projects;
      saveState();
      render();
      return true;
    }
  } catch (e) {
    console.error('导入失败', e);
  }
  return false;
}

// ===== Utilities =====
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// 统一用本地时区的日期处理，避免 toISOString()/new Date(string) 导致时区偏差
function getLocalDateParts(date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  };
}

function toDateStringLocal(date) {
  const p = getLocalDateParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = parseLocalDate(dateStr);
  if (!date) return '';
  const todayParts = getLocalDateParts(new Date());
  const dateParts = getLocalDateParts(date);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowParts = getLocalDateParts(tomorrow);

  if (dateParts.year === todayParts.year && dateParts.month === todayParts.month && dateParts.day === todayParts.day) return '今天';
  if (dateParts.year === tomorrowParts.year && dateParts.month === tomorrowParts.month && dateParts.day === tomorrowParts.day) return '明天';
  return `${dateParts.month}月${dateParts.day}日`;
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  const date = parseLocalDate(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function isToday(dateStr) {
  if (!dateStr) return false;
  const date = parseLocalDate(dateStr);
  if (!date) return false;
  const todayParts = getLocalDateParts(new Date());
  const dateParts = getLocalDateParts(date);
  return dateParts.year === todayParts.year && dateParts.month === todayParts.month && dateParts.day === todayParts.day;
}

function isUpcoming(dateStr) {
  if (!dateStr) return false;
  const date = parseLocalDate(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekLater = new Date(today);
  weekLater.setDate(weekLater.getDate() + 7);
  return date >= today && date <= weekLater;
}

function getDateForOption(option) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (option) {
    case 'today': return toDateStringLocal(today);
    case 'tomorrow':
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return toDateStringLocal(tomorrow);
    case 'week':
      const weekLater = new Date(today);
      weekLater.setDate(weekLater.getDate() + 7);
      return toDateStringLocal(weekLater);
    case 'later': return '';
    default: return '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getReminderLabel(type) {
  const labels = {
    'at-time': '准时', '5min': '提前5分钟', '15min': '提前15分钟',
    '30min': '提前30分钟', '1hour': '提前1小时', '1day': '提前1天'
  };
  return labels[type] || '';
}

// ===== Notifications / Reminders =====
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission !== 'granted') {
    Notification.requestPermission();
  }
}

let currentAlertTaskId = null;

function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'icon.png' });
  }
}

function showAlert(task) {
  currentAlertTaskId = task.id;
  const overlay = document.getElementById('alert-overlay');
  const taskTitleEl = document.getElementById('alert-task-title');
  const metaEl = document.getElementById('alert-meta');
  const project = state.projects.find(p => p.id === task.projectId);
  const dateText = task.date ? formatDate(task.date) : '未设置日期';
  const projectText = project ? `${project.icon} ${project.name}` : '无项目';

  taskTitleEl.textContent = task.title;
  metaEl.textContent = `${projectText} · ${dateText}`;

  // 设置自定义时间默认值为当前时间 + 10 分钟
  const defaultCustom = new Date(Date.now() + 10 * 60 * 1000);
  const customInput = document.getElementById('snooze-custom-time');
  customInput.value = formatDateTimeLocal(defaultCustom);

  overlay.classList.add('show');

  // 播放提示音
  playAlertSound();
}

function formatDateTimeLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatReminderDateTime(timestamp) {
  const date = new Date(timestamp);
  return `${formatDate(toDateStringLocal(date))} ${formatTimeForSnooze(timestamp)}`;
}

function hideAlert() {
  document.getElementById('alert-overlay').classList.remove('show');
  currentAlertTaskId = null;
}

function playAlertSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('无法播放提示音', e);
  }
}

let reminderInterval;
function startReminders() {
  checkDueReminders();
  reminderInterval = setInterval(checkDueReminders, 30000);
}

function checkDueReminders() {
  const now = Date.now();
  let changed = false;
  state.tasks.forEach(task => {
    if (task.completed) return;
    if (!task.reminderType || task.reminderType === 'none') return;

    const snoozeUntil = task.snoozeUntil || 0;
    if (now < snoozeUntil) return;

    const reminderTime = task.nextReminderAt ||
      getReminderDateTime(task.date, task.reminderType, task.reminderTime || '09:00');
    if (reminderTime && reminderTime <= now) {
      // 只弹一次：弹窗后清空提醒设置，避免过期任务反复触发
      task.reminderType = 'none';
      task.reminderTime = null;
      task.nextReminderAt = null;
      task.snoozeUntil = null;
      showNotification('Things 3 提醒', task.title);
      showAlert(task);
      task.notifiedAt = now;
      changed = true;
    }
  });
  if (changed) {
    saveState();
    render();
  }
}

function getReminderDateTime(taskDate, reminderType, reminderTime) {
  if (reminderType === 'none' || !taskDate) return null;
  const [y, m, d] = taskDate.split('-').map(Number);
  const [hours, minutes] = (reminderTime || '09:00').split(':').map(Number);
  const date = new Date(y, m - 1, d, hours, minutes, 0, 0);
  const offsets = { 'at-time': 0, '5min': 5 * 60 * 1000, '15min': 15 * 60 * 1000, '30min': 30 * 60 * 1000, '1hour': 60 * 60 * 1000, '1day': 24 * 60 * 60 * 1000 };
  return date.getTime() - (offsets[reminderType] || 0);
}

// ===== Rendering =====
function renderViewTitle() {
  const titles = { today: '今天', upcoming: '近日', anytime: '随时', someday: '有一天', stats: '统计' };
  if (state.currentProjectId) {
    const project = state.projects.find(p => p.id === state.currentProjectId);
    elements.viewTitle.textContent = project ? `${project.icon} ${project.name}` : '项目';
  } else {
    elements.viewTitle.textContent = titles[state.currentView] || '任务';
  }
}

// ===== Stats =====
function formatDuration(ms) {
  if (!ms || ms < 0) return '—';
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}天 ${hours % 24}小时 ${minutes % 60}分钟`;
  if (hours > 0) return `${hours}小时 ${minutes % 60}分钟`;
  return `${minutes}分钟`;
}

function getBucketLabel(bucket) {
  const labels = {
    'under-1h': '1小时内',
    '1h-1d': '1小时–1天',
    '1d-3d': '1–3天',
    '3d-7d': '3–7天',
    '7d-30d': '7–30天',
    'over-30d': '超过30天'
  };
  return labels[bucket] || bucket;
}

function computeStats() {
  const all = state.tasks || [];
  const completed = all.filter(t => t.completed);
  const total = all.length;
  const active = total - completed.length;
  const completionRate = total ? Math.round((completed.length / total) * 100) : 0;

  const durations = completed
    .filter(t => t.createdAt && t.completedAt)
    .map(t => t.completedAt - t.createdAt);
  const avgDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  const medianDuration = durations.length ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)] : null;

  const buckets = {
    'under-1h': 0,
    '1h-1d': 0,
    '1d-3d': 0,
    '3d-7d': 0,
    '7d-30d': 0,
    'over-30d': 0
  };
  durations.forEach(d => {
    if (d < 60 * 60 * 1000) buckets['under-1h']++;
    else if (d < 24 * 60 * 60 * 1000) buckets['1h-1d']++;
    else if (d < 3 * 24 * 60 * 60 * 1000) buckets['1d-3d']++;
    else if (d < 7 * 24 * 60 * 60 * 1000) buckets['3d-7d']++;
    else if (d < 30 * 24 * 60 * 60 * 1000) buckets['7d-30d']++;
    else buckets['over-30d']++;
  });

  const byProject = state.projects.map(p => {
    const projectTasks = all.filter(t => t.projectId === p.id);
    const done = projectTasks.filter(t => t.completed);
    return {
      ...p,
      total: projectTasks.length,
      completed: done.length,
      rate: projectTasks.length ? Math.round((done.length / projectTasks.length) * 100) : 0
    };
  });

  const byTag = {};
  all.forEach(t => {
    const tags = (t.tags || '').split(',').map(tag => tag.trim()).filter(Boolean);
    tags.forEach(tag => {
      if (!byTag[tag]) byTag[tag] = { total: 0, completed: 0 };
      byTag[tag].total++;
      if (t.completed) byTag[tag].completed++;
    });
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const todayCreated = all.filter(t => t.createdAt && t.createdAt >= todayStart.getTime() && t.createdAt < todayEnd.getTime()).length;
  const todayCompleted = completed.filter(t => t.completedAt && t.completedAt >= todayStart.getTime() && t.completedAt < todayEnd.getTime()).length;

  const thisWeekStart = new Date(todayStart);
  thisWeekStart.setDate(todayStart.getDate() - todayStart.getDay());
  const thisWeekCreated = all.filter(t => t.createdAt && t.createdAt >= thisWeekStart.getTime()).length;
  const thisWeekCompleted = completed.filter(t => t.completedAt && t.completedAt >= thisWeekStart.getTime()).length;

  const thisMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const thisMonthCreated = all.filter(t => t.createdAt && t.createdAt >= thisMonthStart.getTime()).length;
  const thisMonthCompleted = completed.filter(t => t.completedAt && t.completedAt >= thisMonthStart.getTime()).length;

  const overdue = all.filter(t => !t.completed && t.date && isOverdue(t.date)).length;
  const noDate = all.filter(t => !t.completed && !t.date).length;
  const withReminder = all.filter(t => !t.completed && t.reminderType && t.reminderType !== 'none').length;

  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - (29 - i));
    return d;
  });

  const dailyTrend = last30Days.map(d => {
    const dayStart = d.getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const ds = toDateStringLocal(d);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      fullDate: ds,
      created: all.filter(t => t.createdAt && t.createdAt >= dayStart && t.createdAt < dayEnd).length,
      completed: completed.filter(t => t.completedAt && t.completedAt >= dayStart && t.completedAt < dayEnd).length
    };
  });

  const weekdayStats = [0, 1, 2, 3, 4, 5, 6].map(day => {
    const dayCreated = all.filter(t => t.createdAt && new Date(t.createdAt).getDay() === day).length;
    const dayCompleted = completed.filter(t => t.completedAt && new Date(t.completedAt).getDay() === day).length;
    return { day, created: dayCreated, completed: dayCompleted };
  });

  const hourStats = Array.from({ length: 24 }, (_, h) => {
    const created = all.filter(t => t.createdAt && new Date(t.createdAt).getHours() === h).length;
    return { hour: h, created };
  });

  const streak = (() => {
    let current = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 24 * 60 * 60 * 1000;
      const done = completed.filter(t => t.completedAt && t.completedAt >= start && t.completedAt < end).length;
      if (done > 0) current++;
      else if (i === 0) continue;
      else break;
    }
    return current;
  })();

  return {
    total, completed: completed.length, active, completionRate,
    avgDuration, medianDuration, buckets, byProject, byTag,
    todayCreated, todayCompleted, thisWeekCreated, thisWeekCompleted,
    thisMonthCreated, thisMonthCompleted, overdue, noDate, withReminder,
    dailyTrend, weekdayStats, hourStats, streak
  };
}

function renderStats() {
  const stats = computeStats();
  elements.emptyState.style.display = 'none';

  const statCards = [
    { icon: '📋', cls: 'blue', value: stats.total, label: '任务总数' },
    { icon: '✅', cls: 'green', value: stats.completed, label: '已完成' },
    { icon: '📈', cls: 'purple', value: stats.completionRate + '%', label: '完成率' },
    { icon: '⏱️', cls: 'orange', value: formatDuration(stats.avgDuration), label: '平均耗时' },
    { icon: '📅', cls: 'green', value: stats.todayCreated, label: '今日创建' },
    { icon: '✨', cls: 'blue', value: stats.todayCompleted, label: '今日完成' },
    { icon: '🔥', cls: 'red', value: stats.streak, label: '连续完成天数' },
    { icon: '⏳', cls: 'orange', value: stats.overdue, label: '已逾期' }
  ];

  const cardsHtml = statCards.map(c => `
    <div class="stat-card">
      <div class="stat-icon ${c.cls}">${c.icon}</div>
      <div class="stat-info">
        <div class="stat-value">${c.value}</div>
        <div class="stat-label">${c.label}</div>
      </div>
    </div>
  `).join('');

  const bucketRows = Object.entries(stats.buckets)
    .filter(([, count]) => count > 0)
    .map(([bucket, count]) => `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${getBucketLabel(bucket)}</span>
        <div class="stat-bar-track"><div class="stat-bar-fill" style="width: ${Math.max(4, (count / Math.max(stats.completed, 1)) * 100)}%"></div></div>
        <span class="stat-bar-value">${count}</span>
      </div>
    `).join('');

  const projectRows = stats.byProject
    .filter(p => p.total > 0)
    .sort((a, b) => b.rate - a.rate)
    .map(p => `
      <div class="stat-project-row">
        <span class="stat-project-name">${p.icon} ${escapeHtml(p.name)}</span>
        <div class="stat-mini-track"><div class="stat-mini-fill" style="width: ${p.rate}%"></div></div>
        <span class="stat-project-count">${p.completed}/${p.total}</span>
      </div>
    `).join('');

  const tagRows = Object.entries(stats.byTag)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([tag, data]) => {
      const rate = data.total ? Math.round((data.completed / data.total) * 100) : 0;
      return `
        <div class="stat-tag-row">
          <span class="stat-tag-name">#${escapeHtml(tag)}</span>
          <div class="stat-mini-track"><div class="stat-mini-fill" style="width: ${rate}%"></div></div>
          <span class="stat-tag-count">${data.completed}/${data.total}</span>
        </div>
      `;
    }).join('');

  const maxDaily = Math.max(1, ...stats.dailyTrend.map(d => Math.max(d.created, d.completed)));
  const trendHtml = stats.dailyTrend.map(d => {
    const barCls = d.created > 0 && d.completed > 0 ? 'both' : (d.completed > 0 ? 'completed' : 'created');
    const height = Math.max(4, (Math.max(d.created, d.completed) / maxDaily) * 100);
    return `
      <div class="stat-trend-cell" data-tip="${d.fullDate}：创建 ${d.created}，完成 ${d.completed}">
        <div class="stat-trend-bar ${barCls}" style="height: ${height}%"></div>
      </div>
    `;
  }).join('');

  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const maxWeekday = Math.max(1, ...stats.weekdayStats.map(w => w.created + w.completed));
  const weekdayHtml = stats.weekdayStats.map(w => `
    <div class="stat-weekday-cell">
      <div class="stat-weekday-name">${weekdayNames[w.day]}</div>
      <div class="stat-weekday-value">${w.created + w.completed}</div>
    </div>
  `).join('');

  const maxHour = Math.max(1, ...stats.hourStats.map(h => h.created));
  const hourHtml = stats.hourStats.filter((_, i) => i % 2 === 0).map(h => `
    <div class="stat-hour-cell ${h.created > maxHour * 0.6 ? 'active' : ''}">
      <div class="stat-hour-label">${String(h.hour).padStart(2, '0')}:00</div>
      <div class="stat-hour-value">${h.created}</div>
    </div>
  `).join('');

  elements.tasksContainer.innerHTML = `
    <div class="stats-grid">${cardsHtml}</div>

    <div class="stat-section">
      <h3>📆 近 30 天创建/完成趋势</h3>
      <div class="stat-trend-grid">${trendHtml}</div>
    </div>

    <div class="stat-row">
      <div class="stat-section">
        <h3>📊 星期分布</h3>
        <div class="stat-weekday-grid">${weekdayHtml}</div>
      </div>
      <div class="stat-section">
        <h3>🕒 创建时间偏好</h3>
        <div class="stat-hour-grid">${hourHtml}</div>
      </div>
    </div>

    <div class="stat-section">
      <h3>⏱ 完成耗时分布</h3>
      ${stats.completed ? bucketRows : '<p class="stat-empty">暂无已完成任务数据</p>'}
    </div>

    ${projectRows ? `
    <div class="stat-section">
      <h3>📁 项目完成情况</h3>
      ${projectRows}
    </div>` : ''}

    ${tagRows ? `
    <div class="stat-section">
      <h3>🏷 标签完成情况</h3>
      ${tagRows}
    </div>` : ''}
  `;
}

function renderProjectsList() {
  elements.projectsList.innerHTML = state.projects.map(project => `
    <div class="project-item ${state.currentProjectId === project.id ? 'active' : ''}" data-project-id="${project.id}">
      <span class="project-icon">${project.icon}</span>
      <span class="project-name">${escapeHtml(project.name)}</span>
      <div class="project-actions">
        <button class="project-action-btn edit-project" data-id="${project.id}" title="编辑">✏️</button>
        <button class="project-action-btn delete-project" data-id="${project.id}" title="删除">🗑️</button>
      </div>
    </div>
  `).join('');

  elements.taskProjectSelect.innerHTML = `<option value="">无项目</option>` +
    state.projects.map(p => `<option value="${p.id}">${p.icon} ${escapeHtml(p.name)}</option>`).join('');
}

function renderTaskCard(task) {
  const project = state.projects.find(p => p.id === task.projectId);
  const tags = task.tags ? task.tags.split(',').map(t => t.trim()).filter(t => t) : [];
  let dateClass = '';
  if (task.date) {
    if (isOverdue(task.date) && !isToday(task.date)) dateClass = 'overdue';
    else if (isToday(task.date)) dateClass = 'today';
  }
  return `
    <div class="task-card ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
      <div class="task-header">
        <div class="task-checkbox ${task.completed ? 'checked' : ''}" data-action="toggle" data-id="${task.id}">${task.completed ? '✓' : ''}</div>
        <div class="task-body">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${project ? `<span class="task-project">${project.icon} ${escapeHtml(project.name)}</span>` : ''}
          <div class="task-meta">
            ${task.date ? `<span class="task-date ${dateClass}">📅 ${formatDate(task.date)}</span>` : ''}
            ${task.nextReminderAt ? `<span class="task-reminder">🔔 ${formatReminderDateTime(task.nextReminderAt)} 再次提醒</span>` : ''}
            ${!task.nextReminderAt && task.reminderType && task.reminderType !== 'none' ? `<span class="task-reminder">🔔 ${getReminderLabel(task.reminderType)}</span>` : ''}
            ${tags.length > 0 ? `<div class="task-tags">${tags.map(tag => `<span class="task-tag">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTasks() {
  let filtered = [...state.tasks];
  if (state.currentProjectId) {
    filtered = filtered.filter(t => t.projectId === state.currentProjectId);
  } else {
    switch (state.currentView) {
      case 'today': filtered = filtered.filter(t => isToday(t.date) && !t.completed); break;
      case 'upcoming': filtered = filtered.filter(t => isUpcoming(t.date) && !t.completed); break;
      case 'anytime': filtered = filtered.filter(t => !t.date && !t.completed); break;
      case 'someday': filtered = filtered.filter(t => t.someday && !t.completed); break;
    }
  }
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(a.date) - new Date(b.date);
  });

  if (filtered.length === 0) {
    elements.tasksContainer.innerHTML = '';
    elements.emptyState.style.display = 'flex';
  } else {
    elements.emptyState.style.display = 'none';
    elements.tasksContainer.innerHTML = filtered.map(renderTaskCard).join('');
  }
  elements.todayCount.textContent = state.tasks.filter(t => isToday(t.date) && !t.completed).length;
  elements.upcomingCount.textContent = state.tasks.filter(t => isUpcoming(t.date) && !t.completed).length;
}

function render() {
  renderViewTitle();
  renderProjectsList();
  if (state.currentView === 'stats') {
    renderStats();
  } else {
    renderTasks();
  }
}

// ===== Modals =====
function showModal(modal) { modal.classList.add('show'); }
function hideModal(modal) { modal.classList.remove('show'); }

function openTaskModal(taskId = null) {
  state.editingTaskId = taskId;
  elements.taskForm.reset();
  document.getElementById('task-id').value = '';
  document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('task-reminder-time').style.display = 'none';

  if (taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
      document.getElementById('task-id').value = task.id;
      document.getElementById('task-title').value = task.title;
      document.getElementById('task-project').value = task.projectId || '';
      document.getElementById('task-tags').value = task.tags || '';
      document.getElementById('task-notes').value = task.notes || '';
      document.getElementById('task-reminder-type').value = task.reminderType || 'none';
      document.getElementById('task-reminder-time').value = task.reminderTime || '09:00';
      document.getElementById('task-reminder-time').style.display = task.reminderType && task.reminderType !== 'none' ? 'block' : 'none';
      if (task.date) document.getElementById('task-date').value = task.date;
      document.getElementById('modal-title').textContent = '编辑任务';
    }
  } else {
    document.getElementById('modal-title').textContent = '新建任务';
    if (state.currentProjectId) document.getElementById('task-project').value = state.currentProjectId;
  }
  showModal(elements.taskModal);
}

function openProjectModal() {
  elements.projectForm.reset();
  elements.projectForm.dataset.editingId = '';
  document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
  document.querySelector('.icon-option[data-icon="📁"]').classList.add('selected');
  showModal(elements.projectModal);
}

function editProject(projectId) {
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return;
  document.getElementById('project-name').value = project.name;
  document.querySelectorAll('.icon-option').forEach(o => o.classList.toggle('selected', o.dataset.icon === project.icon));
  elements.projectForm.dataset.editingId = projectId;
  showModal(elements.projectModal);
}

function openTaskDetail(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;
  const project = state.projects.find(p => p.id === task.projectId);
  const tags = task.tags ? task.tags.split(',').map(t => t.trim()).filter(t => t) : [];
  document.getElementById('task-detail-body').innerHTML = `
    <div class="task-detail-section"><div class="task-detail-label">任务</div><div class="task-detail-value" style="font-size:18px;font-weight:500;">${escapeHtml(task.title)}</div></div>
    ${project ? `<div class="task-detail-section"><div class="task-detail-label">项目</div><div class="task-detail-value">${project.icon} ${escapeHtml(project.name)}</div></div>` : ''}
    ${task.date ? `<div class="task-detail-section"><div class="task-detail-label">何时</div><div class="task-detail-value">${formatDate(task.date)}</div></div>` : ''}
    ${task.nextReminderAt ? `<div class="task-detail-section"><div class="task-detail-label">再次提醒</div><div class="task-detail-value">${formatReminderDateTime(task.nextReminderAt)}</div></div>` : ''}
    ${task.reminderType && task.reminderType !== 'none' ? `<div class="task-detail-section"><div class="task-detail-label">提醒</div><div class="task-detail-value">${getReminderLabel(task.reminderType)} ${task.reminderTime || ''}</div></div>` : ''}
    ${tags.length > 0 ? `<div class="task-detail-section"><div class="task-detail-label">标签</div><div class="task-tags">${tags.map(tag => `<span class="task-tag">#${escapeHtml(tag)}</span>`).join('')}</div></div>` : ''}
    ${task.notes ? `<div class="task-detail-section"><div class="task-detail-label">备注</div><div class="task-detail-value">${escapeHtml(task.notes)}</div></div>` : ''}
    <div class="task-detail-actions">
      <button class="task-detail-btn" id="edit-task-btn" data-id="${task.id}">✏️ 编辑</button>
      <button class="task-detail-btn danger" id="delete-task-btn" data-id="${task.id}">🗑️ 删除</button>
    </div>
  `;
  showModal(elements.taskDetailModal);
}

// ===== Operations =====
function toggleTask(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    task.completed = !task.completed;
    if (task.completed) task.completedAt = Date.now();
    else delete task.completedAt;
    task.notifiedAt = null;
    task.nextReminderAt = null;
    saveState();
    render();
  }
}

function saveTask(formData) {
  const taskId = document.getElementById('task-id').value;
  const needsReminder = formData.reminderType && formData.reminderType !== 'none';
  if (needsReminder) requestNotificationPermission();

  if (taskId) {
    const idx = state.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) state.tasks[idx] = { ...state.tasks[idx], ...formData, notifiedAt: null, nextReminderAt: null, completedAt: state.tasks[idx].completed ? state.tasks[idx].completedAt : null };
  } else {
    state.tasks.push({
      id: generateId(),
      title: formData.title,
      projectId: formData.projectId || null,
      date: formData.date || null,
      reminderType: formData.reminderType || 'none',
      reminderTime: formData.reminderTime || '09:00',
      tags: formData.tags || '',
      notes: formData.notes || '',
      completed: false,
      someday: formData.someday || false,
      createdAt: Date.now(),
      completedAt: null,
      notifiedAt: null,
      nextReminderAt: null
    });
  }
  saveState();
  hideModal(elements.taskModal);
  render();
}

function deleteTask(taskId) {
  if (confirm('确定要删除这个任务吗？')) {
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    saveState();
    hideModal(elements.taskDetailModal);
    render();
  }
}

function saveProject(data) {
  const projectId = elements.projectForm.dataset.editingId;
  if (projectId) {
    const idx = state.projects.findIndex(p => p.id === projectId);
    if (idx !== -1) state.projects[idx] = { ...state.projects[idx], ...data };
  } else {
    state.projects.push({ id: generateId(), name: data.name, icon: data.icon || '📁', createdAt: Date.now() });
  }
  saveState();
  elements.projectForm.dataset.editingId = '';
  hideModal(elements.projectModal);
  render();
}

function deleteProject(projectId) {
  if (confirm('确定要删除这个项目吗？项目内的任务不会被删除。')) {
    state.projects = state.projects.filter(p => p.id !== projectId);
    state.tasks.forEach(t => { if (t.projectId === projectId) t.projectId = null; });
    saveState();
    state.currentProjectId = null;
    render();
  }
}

// ===== Event Listeners =====
function setupAlertListeners() {
  document.getElementById('alert-dismiss').addEventListener('click', hideAlert);
  document.getElementById('alert-view').addEventListener('click', () => {
    if (currentAlertTaskId) {
      hideAlert();
      openTaskDetail(currentAlertTaskId);
    }
  });
  document.getElementById('alert-complete').addEventListener('click', () => {
    if (currentAlertTaskId) {
      toggleTask(currentAlertTaskId);
      hideAlert();
    }
  });
  document.getElementById('alert-overlay').addEventListener('click', e => {
    if (e.target.id === 'alert-overlay') hideAlert();
  });

  // 稍后提醒快捷按钮
  document.querySelectorAll('.snooze-btn[data-min]').forEach(btn => {
    btn.addEventListener('click', () => {
      const minutes = parseInt(btn.dataset.min, 10);
      snoozeCurrentTask(minutes);
    });
  });

  // 自定义时间稍后提醒
  document.getElementById('snooze-custom-confirm').addEventListener('click', () => {
    const input = document.getElementById('snooze-custom-time');
    if (!input.value) return;
    snoozeCurrentTaskToTime(new Date(input.value).getTime());
  });
}

function snoozeCurrentTask(minutes) {
  if (!currentAlertTaskId) return;
  const task = state.tasks.find(t => t.id === currentAlertTaskId);
  if (!task) return;

  const nextTime = Date.now() + minutes * 60 * 1000;
  task.notifiedAt = null;
  task.nextReminderAt = nextTime;

  saveState();
  hideAlert();
  render();
}

function snoozeCurrentTaskToTime(timestamp) {
  if (!currentAlertTaskId || isNaN(timestamp)) return;
  const task = state.tasks.find(t => t.id === currentAlertTaskId);
  if (!task) return;

  task.notifiedAt = null;
  task.nextReminderAt = timestamp;

  saveState();
  hideAlert();
  render();
}

function formatTimeForSnooze(timestamp) {
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function setupEventListeners() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      state.currentView = item.dataset.view;
      state.currentProjectId = null;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.querySelectorAll('.project-item').forEach(p => p.classList.remove('active'));
      item.classList.add('active');
      render();
    });
  });

  elements.projectsList.addEventListener('click', e => {
    const projectItem = e.target.closest('.project-item');
    if (!projectItem) return;
    const editBtn = e.target.closest('.edit-project');
    const deleteBtn = e.target.closest('.delete-project');
    if (editBtn) { e.stopPropagation(); editProject(editBtn.dataset.id); return; }
    if (deleteBtn) { e.stopPropagation(); deleteProject(deleteBtn.dataset.id); return; }
    state.currentProjectId = projectItem.dataset.projectId;
    state.currentView = null;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    render();
  });

  document.getElementById('quick-add-btn').addEventListener('click', () => openTaskModal());
  document.getElementById('add-project-btn').addEventListener('click', openProjectModal);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      if (importData(ev.target.result)) alert('导入成功');
      else alert('导入失败，文件格式不正确');
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('modal-close').addEventListener('click', () => hideModal(elements.taskModal));
  document.getElementById('btn-cancel').addEventListener('click', () => hideModal(elements.taskModal));
  elements.taskModal.querySelector('.modal-backdrop').addEventListener('click', () => hideModal(elements.taskModal));
  elements.taskForm.addEventListener('submit', e => {
    e.preventDefault();
    saveTask({
      title: document.getElementById('task-title').value,
      projectId: document.getElementById('task-project').value || null,
      date: document.getElementById('task-date').value || null,
      reminderType: document.getElementById('task-reminder-type').value,
      reminderTime: document.getElementById('task-reminder-time').value,
      tags: document.getElementById('task-tags').value,
      notes: document.getElementById('task-notes').value
    });
  });

  document.querySelectorAll('.date-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('task-date').value = getDateForOption(btn.dataset.date);
      const rt = document.getElementById('task-reminder-type');
      const tm = document.getElementById('task-reminder-time');
      if (btn.dataset.date === 'today') { rt.value = '15min'; tm.style.display = 'block'; }
      else if (btn.dataset.date) { rt.value = '1day'; tm.style.display = 'block'; }
    });
  });

  document.getElementById('project-modal-close').addEventListener('click', () => hideModal(elements.projectModal));
  document.getElementById('btn-project-cancel').addEventListener('click', () => hideModal(elements.projectModal));
  elements.projectModal.querySelector('.modal-backdrop').addEventListener('click', () => hideModal(elements.projectModal));
  elements.iconPicker.addEventListener('click', e => {
    const opt = e.target.closest('.icon-option');
    if (opt) { document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); }
  });
  elements.projectForm.addEventListener('submit', e => {
    e.preventDefault();
    saveProject({
      name: document.getElementById('project-name').value,
      icon: document.querySelector('.icon-option.selected')?.dataset.icon || '📁'
    });
  });

  document.getElementById('task-detail-close').addEventListener('click', () => hideModal(elements.taskDetailModal));
  elements.taskDetailModal.querySelector('.modal-backdrop').addEventListener('click', () => hideModal(elements.taskDetailModal));
  document.getElementById('task-detail-body').addEventListener('click', e => {
    const editBtn = e.target.closest('#edit-task-btn');
    const deleteBtn = e.target.closest('#delete-task-btn');
    if (editBtn) { hideModal(elements.taskDetailModal); openTaskModal(editBtn.dataset.id); }
    if (deleteBtn) deleteTask(deleteBtn.dataset.id);
  });

  elements.tasksContainer.addEventListener('click', e => {
    const checkbox = e.target.closest('.task-checkbox[data-action="toggle"]');
    const card = e.target.closest('.task-card');
    if (checkbox) { e.stopPropagation(); toggleTask(checkbox.dataset.id); return; }
    if (card) openTaskDetail(card.dataset.taskId);
  });

  document.getElementById('task-reminder-type').addEventListener('change', e => {
    document.getElementById('task-reminder-time').style.display = e.target.value === 'none' ? 'none' : 'block';
  });
}

// ===== Init =====
function init() {
  loadState();
  render();
  setupEventListeners();
  setupAlertListeners();
  startReminders();
  if ('Notification' in window && Notification.permission === 'default') requestNotificationPermission();
}

init();
