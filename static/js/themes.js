// ─── themes.js · 今日主题 + 主题库 ───────────────
// 依赖：state.js（track / showToast）
let currentThemeId = '';

async function loadTodayTheme() {
  try {
    const res = await fetch(`${API_BASE}/api/today-theme`);
    const data = await res.json();
    if (data.theme) {
      updateThemeCard(data.theme);
      currentThemeId = data.theme.id || '';
    }
    // 引导文字始终显示（方便新用户查看拍摄提示）
    const guide = document.getElementById('guideText');
    if (guide) {
      guide.classList.remove('hidden');
    }
  } catch(e) {
    // 静默失败
  }
}

function updateThemeCard(theme) {
  const diffMap = {beginner: 'easy', intermediate: 'mid', advanced: 'hard'};
  const diffLabel = theme.difficulty_label || (theme.difficulty === 'beginner' ? '入门' : theme.difficulty === 'intermediate' ? '进阶' : '挑战');
  const diffClass = diffMap[theme.difficulty] || 'easy';

  const iconEl = document.getElementById('themeTodayIcon');
  const titleEl = document.getElementById('themeTodayTitle');
  const hintEl = document.getElementById('themeTodayHint');
  const tagsEl = document.getElementById('themeTodayTags');

  if (iconEl) iconEl.textContent = theme.icon || '🎨';
  if (titleEl) titleEl.textContent = theme.title || '画你想画的';
  if (hintEl) hintEl.textContent = theme.hint || '随便画就好，小绘不评价好坏';
  if (tagsEl) {
    tagsEl.innerHTML = `<span class="theme-tag ${diffClass}">${diffLabel}</span><span class="theme-tag cat">${theme.category || ''}</span>`;
  }
}

// ─── 主题库（难度分级 + 选择）───
let themeLibrary = [];
let currentThemeTab = 'beginner';

async function loadThemeLibrary() {
  try {
    const res = await fetch(`${API_BASE}/api/themes`);
    const data = await res.json();
    themeLibrary = data.themes || [];
    renderThemeTab('beginner');
  } catch(e) {
    // 静默失败，不影响主流程
  }
}

function switchThemeTab(difficulty) {
  currentThemeTab = difficulty;
  renderThemeTab(difficulty);
  // 更新 Tab 高亮
  document.querySelectorAll('.theme-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.diff === difficulty);
  });
}

function renderThemeTab(difficulty) {
  const themes = themeLibrary.filter(t => t.difficulty === difficulty);
  const container = document.getElementById('themeGrid');
  if (!container) return;

  if (themes.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--color-text-tertiary);padding:20px;font-size:14px;">暂无主题</div>';
    return;
  }

  container.innerHTML = themes.map(t => `
    <div class="theme-pick-card ${t.difficulty}" onclick="selectTheme('${t.id}')">
      <div class="theme-pick-title">${escapeHtml(t.title)}</div>
      <div class="theme-pick-tags">
        <span class="theme-diff-tag ${t.difficulty}">${t.difficulty_label || ''}</span>
        <span class="theme-cat-tag">${escapeHtml(t.category || '')}</span>
      </div>
      <div class="theme-pick-hint">${escapeHtml(t.hint || '')}</div>
    </div>
  `).join('');
}

function selectTheme(themeId) {
  const theme = themeLibrary.find(t => t.id === themeId);
  if (!theme) return;
  updateThemeCard(theme);
  currentThemeId = theme.id || '';

  // 卡片淡入动画
  const card = document.getElementById('themeToday');
  if (card) {
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = 'fadeUp .4s var(--ease-out)';
  }

  // 滚动到顶部今日推荐卡片
  setTimeout(() => {
    const targetY = card ? card.getBoundingClientRect().top + window.pageYOffset - 60 : 0;
    smoothScrollTo(targetY, 500);
  }, 100);

  // 显示轻提示
  showToast(`已切换到「${theme.title}」，点击上方开始画吧`);
}

async function changeTodayTheme() {
  const btn = document.getElementById('themeChangeBtn');
  if (btn) {
    btn.classList.add('spinning');
    setTimeout(() => btn.classList.remove('spinning'), 400);
  }
  try {
    const res = await fetch(`${API_BASE}/api/today-theme?random=true&exclude=${currentThemeId}`);
    const data = await res.json();
    if (data.theme) {
      updateThemeCard(data.theme);
      currentThemeId = data.theme.id || '';
      // 卡片淡入动画
      const card = document.getElementById('themeToday');
      if (card) {
        card.style.animation = 'none';
        void card.offsetWidth;
        card.style.animation = 'fadeUp .4s var(--ease-out)';
      }
    }
  } catch(e) {}
}

// Growth path module removed in v3.0 (Phase 2, hidden for MVP)

// switchPath / masterDetail removed in v3.0 (Phase 2)

// ─── Tab switching ───
function switchTab(tab) {
  // 若反馈全屏 view 开着，先关闭（防御）
  if (typeof closeFeedbackPage === 'function') closeFeedbackPage();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bottom-nav button').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${tab}`).classList.add('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  // 切换页面时滚动到顶部
  window.scrollTo(0, 0);
  if (tab === 'timeline') {
    track('timeline_viewed', {});
    // 修复档案空态竞态：新会话首次进档案时全局 records 可能未加载
    //（loadTimeline 是异步的，只 renderTimeline 会渲染空态"还没有画作"）。
    // 这里强制触发 loadTimeline，完成后 active 页是 timeline 会自动重渲染。
    if (typeof loadTimeline === 'function') loadTimeline();
    renderTimeline();
  } else if (tab === 'ach') {
    track('ach_viewed', {});
    renderAchievements();
  } else if (tab === 'community') {
    track('community_viewed', {});
    renderCommunityFeed();
  }
}

// ─── 小成就页数据（对齐原型 V6-C 空状态） ───
function renderAchievements() {
  fetch(`${API_BASE}/api/stats`)
    .then(r => r.json())
    .then(stats => {
      const total = stats.total || 0;
      const streak = stats.streak || 0;
      const maxStreak = stats.max_streak || 0;
      const levelTitle = (stats.level && stats.level.title) || '探索者';
      const exploration = (stats.profile && stats.profile.exploration) || {};
      const areaCount = exploration.explored_area_count || Object.keys(exploration.explored_areas || {}).length || 0;
      const el = id => document.getElementById(id);
      if (el('achName')) el('achName').textContent = total === 0 ? '画者 · 预备' : `画者 · ${levelTitle}`;
      if (el('achDay')) el('achDay').textContent = total === 0 ? '新画者 · 第 1 天' : `画者 · 第 ${total} 天`;
      // 已点亮成就数 + 下一枚
      const lit = (areaCount >= 1 ? 1 : 0) + (total >= 1 ? 1 : 0) + (streak >= 3 ? 1 : 0);
      if (el('achLit')) el('achLit').textContent = lit;
      let next = '第 1 张画';
      if (total >= 1 && areaCount < 1) next = '点亮第一个方向';
      else if (total >= 1 && streak < 3) next = '连续画 3 天';
      else if (total >= 3) next = '第 5 张画';
      if (el('achNext')) el('achNext').textContent = next;

      // 探索成就 5 项
      renderAchieveList('achExploreList', [
        {icon:'🗺️', name:'点亮第一个方向', desc:'顺着喜欢的主题画', need:1},
        {icon:'🧭', name:'点亮 2 个方向', desc:'试着画不同主题', need:2},
        {icon:'🌍', name:'点亮 3 个方向', desc:'画出不同世界的感觉', need:3},
        {icon:'🗾', name:'点亮 4 个方向', desc:'观察力在扩展', need:4},
        {icon:'🏔️', name:'点亮 6 个方向', desc:'探索全图 · 终极徽章', need:6},
      ], areaCount);
      // 画作里程碑 5 项（早期用户友好：10 张内解锁 4 项）
      renderAchieveList('achMilestoneList', [
        {icon:'🏅', name:'第 1 张画作', desc:'画下第一笔就开启「画者档案」', need:1},
        {icon:'✏️', name:'第 3 张画作', desc:'手感开始建立', need:3},
        {icon:'🖌️', name:'第 5 张画作', desc:'解锁「比例大师」', need:5},
        {icon:'🎨', name:'第 10 张画作', desc:'解锁「心流充值」', need:10},
        {icon:'🏆', name:'第 20 张画作', desc:'坚持就是胜利', need:20},
      ], total);
      // 坚持成就 5 项（连续天数）
      renderAchieveList('achStreakList', [
        {icon:'🔥', name:'连续 3 天', desc:'开始养成习惯', need:3},
        {icon:'🌱', name:'连续 7 天', desc:'稳定的节奏', need:7},
        {icon:'🌿', name:'连续 14 天', desc:'两周的坚持', need:14},
        {icon:'🌟', name:'连续 30 天', desc:'一个月画者', need:30},
        {icon:'👑', name:'连续 60 天', desc:'真正的热爱', need:60},
      ], maxStreak);
    })
    .catch(() => {});
}
// 渲染一组成就列表：done（已解锁）/ now（当前进行）/ lock（未解锁）
function renderAchieveList(containerId, items, current) {
  const c = document.getElementById(containerId);
  if (!c) return;
  let nowSet = false;
  c.innerHTML = items.map(it => {
    const done = current >= it.need;
    let cls = 'lock';
    if (done) cls = 'done';
    // 只有当前有进度（>0）才标记为「进行中」显示 cur/need；0 进度保持「需 N」（未开始）
    else if (!nowSet && current > 0) { cls = 'now'; nowSet = true; }
    const val = done ? '已解锁 ✓' : (cls === 'now' ? `${Math.min(current, it.need)} / ${it.need}` : `需 ${it.need}`);
    return `<div class="mile-item ${cls}"><span class="mi">${it.icon}</span><span class="t"><div class="n">${it.name}</div><div class="s">${it.desc}</div></span><span class="v">${val}</span></div>`;
  }).join('');
}


