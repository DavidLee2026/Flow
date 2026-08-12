// ─── 精简模式反馈 ───

// ─── 操作按钮 ───
function renderActionButtons(record) {
  const container = document.getElementById('actionBtnsContainer');
  const rid = (record && record.id) || currentRecordId || '';
  const btns = [
    {icon: '📸', cls: 'i-primary', title: '拍一张', desc: '拿起画笔再画一张，拍下来', action: 'openCamera()'},
    {icon: '📖', cls: 'i-green', title: '查看记录', desc: '回顾一下绘画旅程', action: "switchTab('timeline')"},
    {icon: '🎨', cls: 'i-orange', title: '分享我的画', desc: '生成分享图，发朋友圈', action: `shareMyPainting('${rid}')`},
  ];
  container.innerHTML = btns.map(b =>
    `<button class="action-btn" onclick="${b.action}">
      <span class="ab-icon ${b.cls}">${b.icon}</span>
      <div class="ab-body">
        <div class="ab-title">${b.title}</div>
        <div class="ab-desc">${b.desc}</div>
      </div>
    </button>`
  ).join('');
}

function startActionButtonsDelay(record) {
  const actions = document.getElementById('fbActions');
  actions.classList.remove('visible');
  renderActionButtons(record);
  setTimeout(() => { actions.classList.add('visible'); }, 2000);
}

// ─── 反思交互 ───
let selectedReflectionText = '';

function selectQuickReflection(btn, text) {
  // 切换选中（允许改选其他标签）
  document.querySelectorAll('.r-quick-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedReflectionText = text;
  // 显示确认发送条
  document.getElementById('rConfirmText').textContent = `已选：${btn.textContent.replace(/^[^\s]+\s/, '')}`;
  document.getElementById('reflectionConfirm').style.display = 'flex';
}

function confirmReflection() {
  if (!selectedReflectionText) return;
  // 锁定所有标签，不可再点
  document.querySelectorAll('.r-quick-btn').forEach(b => b.style.pointerEvents = 'none');
  document.getElementById('reflectionConfirm').style.display = 'none';
  sendReflection(selectedReflectionText);
}

function showCustomReflection() {
  // 隐藏标签确认条（切换到文字输入模式）
  document.getElementById('reflectionConfirm').style.display = 'none';
  document.querySelectorAll('.r-quick-btn').forEach(b => b.classList.remove('selected'));
  selectedReflectionText = '';
  // 显示自定义输入
  const row = document.getElementById('reflectionCustomRow');
  if (row) {
    row.style.display = 'flex';
    const input = document.getElementById('reflectionInput');
    if (input) setTimeout(() => input.focus(), 100);
  }
}

// 重置反思区 UI（每次新反馈前调用）
function resetReflectionUI() {
  const input = document.getElementById('reflectionInput');
  if (input) {
    input.value = '';
    input.style.borderColor = '';
  }
  const customRow = document.getElementById('reflectionCustomRow');
  if (customRow) customRow.style.display = 'none';
  document.querySelectorAll('.r-quick-btn').forEach(b => {
    b.classList.remove('selected');
    b.style.pointerEvents = '';
  });
  const confirmBar = document.getElementById('reflectionConfirm');
  if (confirmBar) confirmBar.style.display = 'none';
  selectedReflectionText = '';
  const responseEl = document.getElementById('reflectionResponse');
  if (responseEl) responseEl.classList.remove('visible');
}

function sendReflection(presetText) {
  const input = document.getElementById('reflectionInput');
  const text = (presetText || input.value || '').trim();
  if (!text) {
    if (input) {
      input.placeholder = '随便说说也行～';
      input.style.borderColor = 'var(--color-primary-light)';
    }
    return;
  }

  // 保存反思文字到 localStorage（用于弹窗时空穿梭展示）
  if (currentRecordId) {
    try {
      const key = `reflection_${currentRecordId}`;
      localStorage.setItem(key, JSON.stringify({
        text: text,
        timestamp: Date.now()
      }));
    } catch(e) {}
  }

  // ═══ SSE 流式获取反思回复（逐字显示，不干等）═══
  const replyEl = document.getElementById('reflectionReply');
  const responseEl = document.getElementById('reflectionResponse');
  responseEl.classList.add('visible');
  replyEl.innerHTML = `
    <div class="chat-meta user">你</div>
    <div class="chat-bubble chat-user">${escapeHtml(text)}</div>
    <div class="chat-meta ai">小绘</div>
    <div class="chat-bubble chat-ai"></div>
  `;
  const bubble = replyEl.querySelector('.chat-bubble.chat-ai');
  bubble.textContent = '…';

  fetch('/api/reflection', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({text: text, subject: currentDrawingSubject}),
  })
    .then(r => {
      if (!r.ok) throw new Error('reflection SSE failed');
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      function readStream() {
        reader.read().then(({ done, value }) => {
          if (done) {
            if (bubble.textContent === '…') bubble.textContent = '每次进步都值得记下来 ☺️';
            return;
          }
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop();
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue;
            let data;
            try { data = JSON.parse(part.slice(6)); } catch (e) { continue; }
            if (data.type === 'done') {
              if (data.elapsed_s) {
                const meta = replyEl.querySelector('.chat-meta.ai');
                if (meta) meta.textContent += `  ${data.elapsed_s}s`;
                console.log(`[reflection] SSE 完成，耗时 ${data.elapsed_s}s`);
              }
              return;
            }
            if (data.type === 'fallback') {
              bubble.textContent = data.text;
              return;
            }
            if (data.token) {
              if (bubble.textContent === '…') bubble.textContent = '';
              bubble.textContent += data.token;
            }
          }
          readStream();
        }).catch(() => {
          if (bubble.textContent === '…') bubble.textContent = '每次进步都值得记下来 ☺️';
        });
      }
      readStream();
    })
    .catch(() => {
      if (bubble.textContent === '…') bubble.textContent = '每次进步都值得记下来 ☺️';
    });

  // 平滑滚动到回应区域
  setTimeout(() => {
    responseEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);

  // 重置输入区（但保留回应）
  if (input) {
    input.value = '';
    input.style.borderColor = '';
  }
  const customRow = document.getElementById('reflectionCustomRow');
  if (customRow) customRow.style.display = 'none';
}

// ─── 读取反思文字（用于弹窗展示） ───
function getReflection(recordId) {
  try {
    const key = `reflection_${recordId}`;
    const data = localStorage.getItem(key);
    if (data) {
      return JSON.parse(data);
    }
  } catch(e) {}
  return null;
}

// ─── 计算时间差描述 ───
function getTimeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  if (days < 100) return `${Math.floor(days / 30)} 个月前`;
  return '很久以前';
}

// ─── 记录感受（简易版） ───
function recordFeeling() {
  const input = document.getElementById('reflectionInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) {
    input.focus();
    input.placeholder = '写下此刻的想法...';
    return;
  }
  // 简单确认
  input.value = '';
  input.placeholder = '已记录 ✅';
  setTimeout(() => { input.placeholder = `比如：${currentDrawingSubject}的形状这次画准了`; }, 2000);
}

// ─── 2.0 心流银行储蓄罐 ───
// 属性驱动：首次创建结构，后续仅更新液面属性触发 CSS transition
function renderFlowBank(data, container) {
  const slot = container || document.getElementById('flowBankSlot');
  if (!slot) return;

  // 数据来源：exploration.progress 作为本次心流值，records 总数作为累计
  const exploration = data.exploration || {};
  const flowValue = exploration.progress || 0;
  const flowChange = 1;  // 每次完成画作 +1 心流值

  // 累计心流值（从 localStorage 读取或用记录数估算）
  let totalFlow = 0;
  try {
    const stored = localStorage.getItem('totalFlowPoints');
    totalFlow = stored ? parseInt(stored) : 0;
  } catch(e) {}
  // 加上本次变化
  if (flowChange > 0) {
    totalFlow += flowChange;
    try { localStorage.setItem('totalFlowPoints', String(totalFlow)); } catch(e) {}
  }

  // 液位高度（0-100 对应 jar 内 0-60px）
  const liquidHeight = Math.min(60, Math.max(0, (flowValue / 100) * 60));
  const liquidY = 80 - liquidHeight; // jar 高度 100，底部留 20px

  // 状态文案
  let statusText = '心流正在积累';
  let statusClass = '';
  if (flowValue >= 70) {
    statusText = '心流充盈，画者状态极佳';
  } else if (flowValue >= 40) {
    statusText = '心流稳定，继续保持';
  } else {
    statusText = '心流偏低，下次试试深呼吸';
    statusClass = 'low';
  }

  // 检查是否已有结构（属性驱动更新 vs 首次创建）
  const existingLiquid = slot.querySelector('.jar-liquid');
  if (existingLiquid) {
    // ── 属性驱动更新：仅改液面属性，CSS transition 自动过渡 ──
    existingLiquid.setAttribute('y', liquidY);
    existingLiquid.setAttribute('height', liquidHeight);
    const waveEl = slot.querySelector('.jar-liquid-wave');
    if (waveEl) {
      waveEl.setAttribute('d', `M 18 ${liquidY} Q 28 ${liquidY - 2}, 40 ${liquidY} T 62 ${liquidY} L 62 ${liquidY + 3} L 18 ${liquidY + 3} Z`);
    }
    const amountEl = slot.querySelector('.jar-amount');
    if (amountEl) amountEl.textContent = totalFlow;
    const statusEl = slot.querySelector('.flow-bank-status');
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = `flow-bank-status ${statusClass}`;
    }
    const historyEl = slot.querySelector('.flow-bank-history');
    if (historyEl) historyEl.textContent = flowChange > 0 ? `本次 +${flowChange}` : '本次无变化';
    const bankEl = slot.querySelector('.flow-bank');
    if (bankEl && flowChange > 0) bankEl.classList.add('depositing');
    return;
  }

  // ── 首次创建：构建完整结构 ──
  slot.innerHTML = `
    <div class="flow-bank ${flowChange > 0 ? 'depositing' : ''}">
      <div class="flow-bank-jar-wrap">
        <svg class="flow-bank-svg" viewBox="0 0 80 100" xmlns="http://www.w3.org/2000/svg">
          <!-- 储蓄罐轮廓 -->
          <path class="jar-outline" d="M 15 25 Q 15 15, 25 15 L 55 15 Q 65 15, 65 25 L 65 85 Q 65 90, 60 90 L 20 90 Q 15 90, 15 85 Z" />
          <!-- 液体 -->
          <rect class="jar-liquid" x="18" y="${liquidY}" width="44" height="${liquidHeight}" fill="rgba(217,164,65,0.35)" rx="3" />
          <path class="jar-liquid-wave" d="M 18 ${liquidY} Q 28 ${liquidY - 2}, 40 ${liquidY} T 62 ${liquidY} L 62 ${liquidY + 3} L 18 ${liquidY + 3} Z" fill="rgba(217,164,65,0.5)" />
          <!-- 数量 -->
          <text class="jar-amount" x="40" y="55" text-anchor="middle">${totalFlow}</text>
          <text class="jar-unit" x="40" y="68" text-anchor="middle">心流值</text>
        </svg>
      </div>
      <div class="flow-bank-info">
        <div class="flow-bank-label">心流储蓄</div>
        <div class="flow-bank-status ${statusClass}">${statusText}</div>
        <div class="flow-bank-history">${flowChange > 0 ? `本次 +${flowChange}` : '本次无变化'}</div>
      </div>
    </div>`;
}

// ─── 2.0 档案归档 pill ───
function renderArchivePill(data, container) {
  const slot = container || document.getElementById('archivePillSlot');
  if (!slot) return;

  // 记录数
  let recordCount = 0;
  try {
    const stored = localStorage.getItem('totalRecordCount');
    recordCount = stored ? parseInt(stored) : 0;
  } catch(e) {}
  recordCount = Math.max(1, recordCount);

  // 心流变化
  const exploration = data.exploration || {};
  const flowChange = 1;  // 每次完成画作 +1 心流值

  const pills = [
    { icon: '📂', text: `已归档 第<span class="num">${recordCount}</span>张`, cls: 'filing' },
  ];
  if (flowChange > 0) {
    pills.push({ icon: '💧', text: `心流 <span class="num">+${flowChange}</span>`, cls: 'flow-bank-pill' });
  }

  slot.innerHTML = `
    <div class="archive-filing">
      ${pills.map((p, i) => `
        <div class="archive-pill ${p.cls}" style="animation-delay: ${i * 120}ms;">
          <span class="archive-pill-icon">${p.icon}</span>
          <span class="archive-pill-text">${p.text}</span>
        </div>
      `).join('')}
    </div>`;
}



