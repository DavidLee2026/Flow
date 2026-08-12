// feedback-ui.js · 反馈模块（从 feedback.js 拆分）

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
