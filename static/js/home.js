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

// ─── 渲染首页骨架数据（v6c-v8d2-a 名片夹 / 信 / 旅程） ───
function renderHomeTopInfo(stats) {
  const el = id => document.getElementById(id);

  // 用户名字（信的开头 + 标题）
  const userName = (stats && stats.profile && stats.profile.name) ||
                   (window.profile && window.profile.name) ||
                   el('greetingName')?.textContent || '画者';
  if (el('homeGreetName')) el('homeGreetName').textContent = userName;
  if (el('homeLetterFrom')) el('homeLetterFrom').textContent = `${userName} · 第一封信`;

  if (!stats) return;

  // 设置全局 profile 供其他模块使用
  if (stats.profile) window.profile = stats.profile;

  const total = stats.total || 0;
  const streak = stats.streak || 0;
  const levelTitle = (stats.level && stats.level.title) || '探索者';
  const stage = stats.stage || '新手期';
  const stageLabel = stats.stage_label || '基础';

  // 信日期（WELCOME · MM.DD）
  if (el('homeLetterDate')) {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    el('homeLetterDate').textContent = `WELCOME · ${mm}.${dd}`;
  }

  // 信的内容随画作数演进（0张欢迎版 / ≥5张"五张了"版 · 对齐 v6c-v8d2-a-5zhang）
  if (el('homeLetterBody')) {
    el('homeLetterBody').innerHTML = total >= 5
      ? '五张了，<b>画者</b>。从第一笔的犹豫，到能画出自己认得出的东西——这中间每一笔，都算数。今天想画什么，还由你自己决定。'
      : '欢迎来到绘心 Flow。这里没有打分，只有看见——画得歪歪扭扭也没关系。今天<b>想画什么就画什么</b>，哪怕只是一条线，都是你的第一笔。';
  }
  if (el('homeTip')) {
    el('homeTip').innerHTML = total >= 5
      ? '💡 <b>今日邀请</b>：继续画<b>想画的</b>，方向越亮，标签越懂你。'
      : '💡 <b>今日邀请</b>：画<b>想画的任何东西</b>，这里<b>没有评判</b>，只有看见。';
  }

  // 天数（首页 / 小成就 / 记录 三页统一）
  const dayText = total === 0 ? '新画者 · 第 1 天' : `画者 · 第 ${total} 天`;
  if (el('homeDay')) el('homeDay').textContent = dayText;
  if (el('achDay')) el('achDay').textContent = dayText;
  if (el('tlDay')) el('tlDay').textContent = dayText;

  // 心流余额（初始 1 · 每完成一张 +1，断签不归零）——信印章 + 银行卡片统一
  const seedNum = 1 + total;
  if (el('homeSeedNum')) el('homeSeedNum').textContent = seedNum;
  if (el('homeFlowNum')) el('homeFlowNum').textContent = seedNum;
  if (el('homeFlowToday')) el('homeFlowToday').textContent = `今日 +${total > 0 ? 1 : 0}`;
  if (el('homeFlowWeek')) el('homeFlowWeek').textContent = `本周 +${total}`;

  // 探索进度 + 方向标签（后端权威数据，参考 v6c-v8d2-a-5zhang）
  const exploration = (stats.profile && stats.profile.exploration) || {};
  const explored = exploration.explored_areas || {};
  const areaCount = exploration.explored_area_count !== undefined
    ? exploration.explored_area_count
    : Object.keys(explored).length;
  const n = Math.max(0, Math.min(6, areaCount || 0));
  const esc = name => (typeof escapeHtml === 'function' ? escapeHtml(name) : name);
  const areaNames = Object.keys(explored).slice(0, 6);
  if (el('homeExploreNum')) el('homeExploreNum').textContent = n;
  if (el('homeExploreCount')) el('homeExploreCount').textContent = n;
  if (el('homeExploreFill')) el('homeExploreFill').style.width = (n / 6 * 100) + '%';
  if (el('homeExploreHint')) el('homeExploreHint').textContent = n === 0 ? '还没有方向' : areaNames.map(esc).join(' · ');
  // 成长旅程方向标签 chips（参考 5zhang 版 .a.on）
  const chips = el('homeAreaChips');
  if (chips) {
    chips.innerHTML = n === 0
      ? '<span class="a-empty">画一张，你的方向标签会出现在这里</span>'
      : areaNames.map(name => `<span class="a on">${esc(name)} ✓</span>`).join('');
  }
  // 名片夹引导语
  const exnext = el('homeExnext');
  if (exnext) {
    exnext.innerHTML = n === 0
      ? '画一张，我们会为你的画贴上<b>最合适的方向标签</b>'
      : `你在 <b>${areaNames.slice(0, 2).map(esc).join('</b> 和 <b>')}</b> 上已经画出了感觉——继续画，让更多方向亮起来`;
  }

  // 连续天数 + 画作数
  if (el('homeStreakNum')) el('homeStreakNum').textContent = `${streak} 天`;
  if (el('homeDrawingsNum')) el('homeDrawingsNum').textContent = `${total} 张`;

  // 画者身份（名片夹 + 旅程）
  if (el('homeArcName')) el('homeArcName').textContent = total === 0 ? '画者 · 预备' : `画者 · ${levelTitle}`;
  if (el('homeArcLevel')) el('homeArcLevel').textContent = total === 0 ? '画你所见 · 起点' : `${stageLabel} · ${stage}`;
  if (el('homeStageName')) el('homeStageName').textContent = stage;
  if (el('homeStageSub')) el('homeStageSub').textContent = total === 0
    ? '第 1 阶段 · 观察实物，画出能认出来的东西'
    : `累计 ${total} 张 · ${levelTitle}`;
}

// ─── 首页骨架入场动效（移植 v6c-v8d2-a 时序） ───
function playHomeReveal() {
  const letter = document.getElementById('homeLetter');
  if (letter) setTimeout(() => letter.classList.add('open'), 300);
  const p1 = document.querySelector('#homeLetter .p1');
  if (p1) setTimeout(() => p1.classList.add('show'), 450);
  const seal = document.getElementById('homeSeal');
  if (seal) setTimeout(() => seal.classList.add('stamp'), 700);
  const tip = document.getElementById('homeTip');
  if (tip) setTimeout(() => tip.classList.add('show'), 850);
  const cta = document.getElementById('homeCta');
  if (cta) setTimeout(() => cta.classList.add('show'), 1100);
  const bank = document.getElementById('homeBank');
  if (bank) setTimeout(() => bank.classList.add('show'), 1250);
  const arc = document.getElementById('homeArc');
  if (arc) setTimeout(() => arc.classList.add('show'), 1400);
  const journey = document.getElementById('homeJourney');
  if (journey) setTimeout(() => journey.classList.add('show'), 1600);

  // jarwave 液面波动（V6-C ambient）
  const jarwaves = document.querySelectorAll('.jarwave');
  if (jarwaves.length) {
    setInterval(() => {
      jarwaves.forEach(x => { x.style.transform = 'translateX(-2px)'; setTimeout(() => { x.style.transform = 'translateX(0)'; }, 400); });
    }, 2200);
  }
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

  // 首页骨架入场动效（移植 v6c-v8d2-a 时序）
  playHomeReveal();
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
