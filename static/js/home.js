// ─── home.js · 2.0 首页方案A「画者之问」逻辑 ───
// 依赖：state.js, exploration-bar.js
// 功能：折叠灵感区、探索进度弹窗、信息聚合、最近作品缩略图、创作前奏

// ─── 创作前奏 · 静默入口仪式 ───
// 2秒暖色调渐变淡入，无文字，为创作设定温暖基调
// 调用时机：新用户 onboarding 完成后 / 老用户页面加载后
function playCreativePrelude() {
  const prelude = document.getElementById('creativePrelude');
  if (!prelude) return Promise.resolve();

  return new Promise((resolve) => {
    // 隐藏首页内容，让前奏成为唯一的视觉焦点
    document.body.classList.add('in-prelude');

    // 触发前奏动画
    prelude.classList.remove('done');
    requestAnimationFrame(() => {
      prelude.classList.add('active');
    });

    // 2秒后结束前奏，揭示首页
    setTimeout(() => {
      prelude.classList.remove('active');
      prelude.classList.add('done');
      document.body.classList.remove('in-prelude');
      resolve();
    }, 2000);
  });
}

// ─── 折叠/展开灵感区 ───
function toggleInspiration() {
  const area = document.getElementById('inspirationArea');
  const toggle = document.getElementById('inspirationToggle');
  if (!area) return;
  const isExpanded = area.classList.toggle('expanded');
  if (toggle) {
    toggle.textContent = isExpanded ? '收起灵感' : '想不出画什么？展开灵感';
    toggle.classList.toggle('expanded', isExpanded);
  }
}

// ─── 渲染首页顶部信息聚合 ───
function renderHomeTopInfo(stats) {
  const nameEl = document.getElementById('homeUserName');
  const stageEl = document.getElementById('homeStage');
  const flowEl = document.getElementById('homeFlowValue');
  const dateEl = document.getElementById('homeDate');

  // 日期
  if (dateEl) {
    const now = new Date();
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    dateEl.textContent = `${months[now.getMonth()]} ${now.getDate()}日`;
  }

  if (!stats) {
    // 无 stats 时尝试从全局或 DOM 获取用户名
    const fallbackName = (window.profile && window.profile.name) ||
                         document.getElementById('greetingName')?.textContent || '画者';
    if (nameEl) nameEl.textContent = fallbackName;
    return;
  }

  // 设置全局 profile 供其他模块使用
  if (stats.profile) {
    window.profile = stats.profile;
  }

  // 用户名（优先从 stats.profile 获取）
  const userName = (stats.profile && stats.profile.name) ||
                   (window.profile && window.profile.name) ||
                   document.getElementById('greetingName')?.textContent || '画者';
  if (nameEl) nameEl.textContent = userName;

  // 等级标签（直接使用 API 返回的 level.title，更准确）
  const stageLabel = (stats.level && stats.level.title) || '探索者';
  if (stageEl) stageEl.textContent = `· ${stageLabel}`;

  // 心流值（用 total 作为心流值，后续 Phase 2 改为心流银行余额）
  const flowValue = stats.total || 0;
  if (flowEl) flowEl.textContent = `心流 ${flowValue}`;
}

// ─── 渲染最近作品缩略图 ───
function renderRecentWorks() {
  const container = document.getElementById('recentWorks');
  if (!container) return;

  // 取最近 3 张
  const recent = (window.records || []).slice(-3).reverse();
  if (recent.length === 0) {
    container.innerHTML = '<div class="recent-works-empty">还没有作品，画第一张吧</div>';
    return;
  }

  container.innerHTML = recent.map(r => `
    <div class="recent-work-thumb" onclick="openRecordDetail('${r.id}')">
      <img src="${API_BASE}/data/${r.image || ''}" alt="作品" loading="lazy" onerror="this.style.display='none'">
    </div>
  `).join('');
}

// ─── 渲染首页探索进度 ───
function renderHomeExplorationBarFromStats(stats) {
  const container = document.getElementById('homeExplorationBarContainer');
  if (!container) return;

  // 从 stats.profile.exploration 读取探索方向数（后端权威数据，不依赖 records 加载时序）
  let areaCount = 0;
  const exploration = (stats && stats.profile && stats.profile.exploration) || {};
  const areas = exploration.explored_areas || {};
  areaCount = exploration.explored_area_count !== undefined
    ? exploration.explored_area_count
    : Object.keys(areas).length;

  renderHomeExplorationBar(areaCount, container);
}

// ─── 初始化首页 ───
async function initHomePage() {
  // 加载统计数据
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    const stats = await res.json();
    renderHomeTopInfo(stats);
    renderHomeExplorationBarFromStats(stats);
  } catch (e) {
    console.warn('[home] stats 加载失败', e);
    renderHomeTopInfo(null);
  }

  // 渲染最近作品
  try {
    const res = await fetch(`${API_BASE}/api/timeline`);
    const data = await res.json();
    window.records = data.records || [];
    renderRecentWorks();
  } catch (e) {
    console.warn('[home] timeline 加载失败', e);
    renderRecentWorks();
  }
}

// ─── 打开记录详情（从缩略图点击） ───
function openRecordDetail(recordId) {
  if (typeof switchTab === 'function') {
    switchTab('timeline');
    setTimeout(() => {
      const rec = (typeof records !== 'undefined' ? records : []).find(r => r.id === recordId);
      if (rec && typeof openModal === 'function') {
        openModal(rec);
      }
    }, 300);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  // 延迟执行，等 onboarding 逻辑先跑
  // 无论 onboarding 状态如何，都加载首页数据（欢迎回来页会覆盖在上方）
  setTimeout(() => {
    initHomePage();
  }, 800);
});
