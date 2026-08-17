// ─── onboarding.js · 引导 / 画像 / 统计 / 欢迎回来 + 应用初始化 ───
// 依赖：state.js（showToast / escapeHtml / track）
// ─── Onboarding Data ───
// v3.1：引导增强 — 情感化文案 + 实时预览 + 按钮状态联动

// ─── Onboarding State ───
let obStep = 0;
let obData = {name: ''};

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  // 首次进入强制滚动到顶部
  window.scrollTo(0, 0);
  loadProfile();
  loadStats(true);   // 初始化时显示欢迎回来
  loadTimeline();
  loadTodayTheme();
  loadThemeLibrary();
  // 安全兜底：3 秒后强制移除 booting 状态，避免 API 异常时卡在空白页
  setTimeout(() => document.body.classList.remove('booting'), 3000);
  // 注册 Service Worker（PWA）+ 监听更新
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`${API_BASE}/sw.js`).then(reg => {
      // 监听 SW 更新消息（由 SW postMessage 触发，非 controllerchange）
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SW_UPDATED') {
          console.log('[SW] 新版本已激活:', event.data.version);
          // 延迟刷新，避免打断当前交互
          setTimeout(() => window.location.reload(), 300);
        }
      });
    }).catch(() => {});
  }
});

// ─── Onboarding ───
function startOnboarding() {
  obStep = 0;
  obData = {name: ''};
  document.getElementById('onboardingOverlay').classList.add('visible');
  // 禁止 onboarding 期间一切触摸滚动（含 input 聚焦后）
  const _obEl = document.getElementById('onboardingOverlay');
  window._obPreventTouch = e => e.preventDefault();
  if (_obEl) _obEl.addEventListener('touchmove', window._obPreventTouch, { passive: false });
  // 锁定背景滚动（body 锁 fixed 防 iOS 键盘弹出/input 聚焦时滚动穿透）
  const _sy = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_sy}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.style.height = '100vh';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  window._obScrollY = _sy;
  renderObStep();
}

function renderObStep() {
  const step = OB_STEPS[obStep];
  document.getElementById('obContent').innerHTML = step.render(obData);
  if (step.onMount) setTimeout(step.onMount, 50);
}

// 微信对话式发送名字：用户绿泡泡上屏 → AI 确认 → 自动进入
async function obSendName() {
  const nickEl = document.getElementById('obName');
  const pinEl = document.getElementById('obPin');
  if (!nickEl) return;
  const nickname = nickEl.value.trim();
  if (!nickname) return;
  // 本地免 PIN 模式（window._pinRequired === false）：PIN 可空
  const pin = (pinEl && window._pinRequired !== false) ? pinEl.value.trim() : '';
  if (window._pinRequired !== false && pin.length !== 4) return;

  // 先注册，昵称已存在则登录
  let res = await fetch(`${API_BASE}/api/account`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({nickname, pin, action: 'register'})
  });
  let data = await res.json();
  if (!data.ok) {
    res = await fetch(`${API_BASE}/api/account`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({nickname, pin, action: 'login'})
    });
    data = await res.json();
  }
  if (!data.ok) {
    if (typeof showToast === 'function') showToast(data.error || '昵称或 PIN 不对');
    return;
  }
  localStorage.setItem('hx_nickname', nickname);
  userName = nickname;
  const _g = document.getElementById('greetingName');
  if (_g) _g.textContent = nickname;

  const chat = document.getElementById('obChat');
  const wrap = document.getElementById('obInputWrap');
  const me = document.createElement('div');
  me.className = 'ob-msg ob-msg-me ob-msg-pop';
  me.innerHTML = `<div class="ob-msg-bubble">${escapeHtml(nickname)}</div>`;
  if (chat) chat.appendChild(me);
  // 隐藏整个输入区（含头像），避免头像单独留在消息流下方
  if (wrap) wrap.style.display = 'none';

  setTimeout(() => {
    const ai = document.createElement('div');
    ai.className = 'ob-msg ob-msg-ai ob-msg-pop';
    ai.innerHTML = `<div class="ob-msg-avatar">✏️</div><div class="ob-msg-bubble">${escapeHtml(nickname)}，准备好开始了吗？✨</div>`;
    if (chat) chat.appendChild(ai);
    setTimeout(obComplete, 3000);
  }, 700);
}

function obSelect(el, field) {
  el.parentElement.querySelectorAll('.ob-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  obData[field] = el.dataset.value;

  const btn = el.closest('.onboarding').querySelector('.ob-btn');
  if (btn) btn.disabled = false;
}

function obNext() {
  const step = OB_STEPS[obStep];
  const result = step.validate(obData);
  if (!result) return;
  obData = {...obData, ...result};

  // 名字页提前存一下（step 0 是场景说明屏，名字屏在 step 1）
  if (obStep === 1 && result.name) {
    fetch(`${API_BASE}/api/onboarding`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: result.name})
    }).catch(() => {});
  }

  obStep++;
  if (obStep >= OB_STEPS.length) {
    obComplete();
    return;
  }
  renderObStep();
}

async function obComplete() {
  // 账号已通过 /api/account 注册/登录，无需再调 onboarding
  // 关闭 onboarding
  document.getElementById('onboardingOverlay').classList.remove('visible');
  // 移除 booting 状态
  document.body.classList.remove('booting');

  // 显示过渡仪式
  const ritual = document.getElementById('ritualOverlay');
  const ritualIcon = document.getElementById('ritualIcon');
  const ritualTitle = document.getElementById('ritualTitle');
  const ritualDesc = document.getElementById('ritualDesc');

  const nick = localStorage.getItem('hx_nickname') || obData.nickname || '';
  if (nick) {
    userName = nick;
    // 同步 greetingName：首页名字 fallback 链会读它，避免 stats 时序稍慢时显示"小伙伴"
    const _g = document.getElementById('greetingName');
    if (_g) _g.textContent = nick;
  }
  ritualTitle.textContent = `${userName}，准备好了！`;
  ritualDesc.textContent = '小绘正在为你准备今日主题...';
  ritualIcon.textContent = '🎨';
  ritual.classList.add('visible');

  // 预加载今日主题
  loadTodayTheme();

  // 1.5 秒后关闭仪式，播放创作前奏，进入首页
  setTimeout(() => {
    ritual.classList.remove('visible');
    const _obEl2 = document.getElementById('onboardingOverlay');
    if (_obEl2 && window._obPreventTouch) {
      _obEl2.removeEventListener('touchmove', window._obPreventTouch);
      window._obPreventTouch = null;
    }
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.style.height = '';
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
    window.scrollTo(0, window._obScrollY || 0);

    updateGreeting();

    // 重新加载首页数据（X-User 已生效，显示新用户昵称/数据）
    if (typeof initHomePage === 'function') initHomePage();

    // 确保页面从顶部开始
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.getElementById('page-home').scrollTop = 0;
    });

    // 播放创作前奏（2秒静默入口仪式），完成后显示首页迎接动画
    if (typeof playCreativePrelude === 'function') {
      playCreativePrelude().then(() => {
        document.body.classList.add('welcome-animate');
        setTimeout(() => document.body.classList.remove('welcome-animate'), 1200);
      });
    } else {
      document.body.classList.add('welcome-animate');
      setTimeout(() => document.body.classList.remove('welcome-animate'), 1200);
    }
  }, 1500);
}

// ─── Greeting ───
function updateGreeting() {
  const hour = new Date().getHours();
  let greet;
  if (hour < 6) greet = '夜深了';
  else if (hour < 12) greet = '早上好';
  else if (hour < 14) greet = '中午好';
  else if (hour < 18) greet = '下午好';
  else greet = '晚上好';

  document.getElementById('greetingText').textContent = greet;
  document.getElementById('greetingName').textContent = userName;
}

// ─── Profile ───
let userName = '小伙伴';
let onboardingDone = false;

// ─── 点击用户名修改昵称（自定义弹窗） ───
async function setName() {
  // 构建自定义输入弹窗
  const overlay = document.getElementById('confirmOverlay');
  const dialog = overlay.querySelector('.confirm-dialog');
  dialog.innerHTML = `
    <div class="confirm-icon">✏️</div>
    <div class="confirm-title">修改名字</div>
    <div class="confirm-desc">小绘该怎么称呼你呢？</div>
    <input class="ob-input" id="setNameInput" type="text" placeholder="输入你的名字" value="${userName}" style="margin-bottom:20px;text-align:center;">
    <div class="confirm-actions">
      <button class="btn btn-md btn-cancel" onclick="closeConfirm()">取消</button>
      <button class="btn btn-md btn-primary" id="setNameOkBtn">保存</button>
    </div>
  `;
  overlay.classList.add('visible');

  const input = document.getElementById('setNameInput');
  input.focus();
  input.select();

  const okBtn = document.getElementById('setNameOkBtn');
  // 输入时检测超长（IME 拼音组词中跳过，避免拼音字母被误判超长）
  input.addEventListener('input', (e) => {
    if (e.isComposing) return;
    if (input.value.trim().length > 8) {
      input.classList.add('shake');
      showToast('姓名不能超过 8 个字 😅');
      setTimeout(() => input.classList.remove('shake'), 600);
    }
  });
  okBtn.onclick = async () => {
    const newName = input.value.trim();
    if (newName.length > 8) {
      input.classList.add('shake');
      showToast('姓名不能超过 8 个字 😅');
      setTimeout(() => input.classList.remove('shake'), 600);
      return;
    }
    if (!newName || newName === userName) {
      closeConfirm();
      // 恢复弹窗结构
      restoreConfirmDialog();
      return;
    }
    try {
      await fetch(`${API_BASE}/api/profile`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({name: newName.slice(0, 8)}),
      });
      userName = newName.slice(0, 8);
      updateGreeting();
      loadStats(false);
      closeConfirm();
      restoreConfirmDialog();
    } catch (e) {
      // 显示错误
      dialog.innerHTML = `
        <div class="confirm-icon">❌</div>
        <div class="confirm-title">改名失败</div>
        <div class="confirm-desc">请检查网络后重试</div>
        <div class="confirm-actions">
          <button class="btn btn-md btn-primary" onclick="closeConfirm();restoreConfirmDialog();">知道了</button>
        </div>
      `;
    }
  };
}

// 恢复确认弹窗的默认结构
function restoreConfirmDialog() {
  const overlay = document.getElementById('confirmOverlay');
  const dialog = overlay.querySelector('.confirm-dialog');
  dialog.innerHTML = `
    <div class="confirm-icon" id="confirmIcon">⚠️</div>
    <div class="confirm-title" id="confirmTitle">确认操作</div>
    <div class="confirm-desc" id="confirmDesc"></div>
    <div class="confirm-actions">
      <button class="btn btn-md btn-cancel" onclick="closeConfirm()">取消</button>
      <button class="btn btn-md btn-danger" id="confirmOkBtn">确定</button>
    </div>
  `;
  // 重新绑定确认按钮事件
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    const cb = confirmCallback;
    closeConfirm();
    if (cb) cb();
  });
}

async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/api/profile`);
    const data = await res.json();
    if (data.profile && data.profile.name) {
      userName = data.profile.name;
    }
    const nameEl = document.getElementById('aiName');
    if (nameEl) nameEl.textContent = '小绘';
  } catch(e) {}
  // 移除自动弹出 setName 的定时器 — onboarding 已处理命名
  // 如果是老用户（没做 onboarding 但名字不是默认值），也不用弹
}

// ─── Stats & Onboarding Check ───
// 标记：是否已显示过欢迎回来（页面生命周期内只显示一次）
let welcomeBackShown = false;

async function loadStats(showWelcome = false) {
  let data = null;
  try {
    const res = await fetch(`${API_BASE}/api/stats`);
    data = await res.json();
    const el = document.getElementById('streakBadge');

    if (data.profile && data.profile.onboarding_done) {
      onboardingDone = true;
    }

    // 保存 streak 到全局，供分享卡使用
    currentStreak = data.streak || 0;

    // 徽章逻辑（确保总是有值，不会消失）
    if (data.streak >= 3) {
      el.textContent = '🔥 坚持了 ' + data.streak + ' 天';
      el.className = 'streak-badge streak-active';
    } else if (data.streak === 2) {
      el.textContent = '🌱 第 2 天';
      el.className = 'streak-badge streak-new';
    } else if (data.streak === 1) {
      el.textContent = '✨ 好的开始！';
      el.className = 'streak-badge streak-new';
    } else if (data.total >= 1) {
      el.textContent = '🎨 已画 ' + data.total + ' 张';
      el.className = 'streak-badge streak-new';
    } else {
      // 没有画作时也显示一个友好的提示，而不是隐藏
      el.textContent = '🌟 开始第一张画';
      el.className = 'streak-badge streak-new';
    }

    // 刷新首页探索进度条（反馈完成后 loadStats 被调用，实时更新方向数，无需刷新页面）
    if (typeof renderHomeExplorationBarFromStats === 'function') {
      renderHomeExplorationBarFromStats(data);
    }
    // 刷新首页骨架（画者档案 / 心流余额 / 探索方向 / 天数）——画完反馈后返回首页数据实时更新
    if (typeof renderHomeTopInfo === 'function') {
      renderHomeTopInfo(data);
    }

    updateGreeting();
  } catch (e) {
    console.error('loadStats error:', e);
    // 即使失败也要移除 booting 状态，避免卡在空白页
  }

  // 移除 booting 状态（首页可见）
  document.body.classList.remove('booting');

  // 未完成 onboarding → 立即弹出引导（不延迟）
  if (!onboardingDone) {
    startOnboarding();
    return;
  }

  // 已完成 onboarding → 老用户：先播放创作前奏，再显示欢迎回来
  if (showWelcome && !welcomeBackShown && onboardingDone) {
    welcomeBackShown = true;

    // 播放创作前奏（2秒静默入口仪式），完成后显示欢迎回来
    if (typeof playCreativePrelude === 'function') {
      playCreativePrelude().then(() => {
        document.body.classList.add('welcome-animate');
        setTimeout(() => document.body.classList.remove('welcome-animate'), 1200);
        const statsData = data || { total: records.length, streak: 0 };
        showWelcomeBack(statsData);
      });
    } else {
      document.body.classList.add('welcome-animate');
      setTimeout(() => document.body.classList.remove('welcome-animate'), 1200);
      const statsData = data || { total: records.length, streak: 0 };
      showWelcomeBack(statsData);
    }
  }
}

// ─── 欢迎回来独立页面 ───
function showWelcomeBack(statsData) {
  const page = document.getElementById('welcomeBackPage');
  if (!page) return;

  const total = statsData.total || 0;
  const streak = statsData.streak || 0;

  // 根据用户状态选择欢迎语
  let title = `欢迎回来，${userName}`;
  let icon = '🎨';
  if (streak >= 3) {
    title = `${userName}，你已经坚持 ${streak} 天了`;
    icon = '🔥';
  } else if (total >= 10) {
    title = `${userName}，又来画了`;
    icon = '✏️';
  } else if (total >= 1) {
    title = `欢迎回来，${userName}`;
    icon = '🎨';
  } else {
    title = `${userName}，开始你的第一张画吧`;
    icon = '🌟';
  }

  // 鼓励语 / 名人名言池
  const quotes = [
    '「画画不是画所见，而是画所感。」 — 克里姆特',
    '「每一笔都是一次冒险。」 — 毕加索',
    '「我画我所知道的，不是我所看到的。」 — 大卫·霍克尼',
    '「线条是行走的点。」 — 保罗·克利',
    '「画画让人学会真正地看。」 — 金姆·诺布尔',
    '「艺术是谎言，但这谎言让我们认识真理。」 — 毕加索',
    '「先学会规则，然后打破它们。」 — 鲍勃·罗斯',
    '「不需要画得完美，只需要画得真实。」',
    '「每一张画都是和自己的一次对话。」',
    '「画100张烂画，第101张就是好画。」',
    '「今天多画一笔，明天少一分遗憾。」',
    '「手在动，心就静了。」',
  ];
  const quote = quotes[Math.floor(Math.random() * quotes.length)];

  document.getElementById('wbpTitle').textContent = title;
  document.getElementById('wbpQuote').textContent = quote;
  document.getElementById('wbpIcon').textContent = icon;

  // 移除 booting 状态，确保欢迎回来页面可见（它在 #page-home 内部，booting 会隐藏父元素）
  document.body.classList.remove('booting');

  page.classList.add('visible');
  document.body.style.overflow = 'hidden';

  // 3 秒后自动消失（无需点击）
  if (page._autoDismissTimer) clearTimeout(page._autoDismissTimer);
  page._autoDismissTimer = setTimeout(() => {
    dismissWelcomeBack();
  }, 3000);
}

function dismissWelcomeBack() {
  const page = document.getElementById('welcomeBackPage');
  if (!page) return;
  if (page._autoDismissTimer) {
    clearTimeout(page._autoDismissTimer);
    page._autoDismissTimer = null;
  }
  page.classList.add('exiting');
  setTimeout(() => {
    page.classList.remove('visible');
    page.classList.remove('exiting');
    document.body.style.overflow = '';
    // 滚动到顶部
    window.scrollTo(0, 0);
  }, 400);
}

// ─── 今日主题 ───


