// ─── AI 生成反思快选标签 ───
function loadReflectionTags(retry = 0) {
  const subject = document.getElementById('themeTodayTitle')?.textContent || '';
  // 实时流程反馈层是 .stream-layer（.layer-text 仅回放模式），取不到会兜底默认标签
  const layers = document.querySelectorAll('#fbLayersContainer .stream-layer');
  // 反馈层还没渲染完（SSE 流式进行中）→ 延迟重试，避免兜底标签
  if (layers.length === 0 && retry < 4) {
    setTimeout(() => loadReflectionTags(retry + 1), 600);
    return;
  }
  let snippet = '';
  layers.forEach((el, i) => {
    if (i < 3) snippet += el.textContent.slice(0, 80) + ' ';
  });
  snippet = snippet.trim().slice(0, 200);
  console.log(`[reflection-tags] 请求 subject='${subject}' layers=${layers.length} snippet_len=${snippet.length}`);

  fetch(`${API_BASE}/api/reflection-tags`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({subject, feedback_snippet: snippet}),
    signal: AbortSignal.timeout(15000),
  })
    .then(r => r.json())
    .then(data => {
      if (!data.tags || data.tags.length === 0) return;
      console.log(`[reflection-tags] 收到 ${data.tags.length} 个 AI 标签`, data.tags);
      const container = document.getElementById('fbReflectionTags');
      if (!container) return;
      container.innerHTML = data.tags.map(t =>
        `<button class="reflection-tag-btn">${t.emoji || '🏷️'} ${escapeHtml(t.text)}</button>`
      ).join('') + '<button class="reflection-tag-btn is-custom">✍️ 自己写</button>';
    })
    .catch(() => {
      console.warn('[reflection-tags] API 超时/失败，保留硬编码标签');
    });
}

// ─── 流式完成后的收尾 ───
// ═══ flowfb-b 对话流组件（design B 样式 · 真实数据） ═══
async function botComponent(html, afterShow) {
  const wrap = document.createElement('div');
  wrap.className = 'typing';
  wrap.innerHTML = '<span></span><span></span><span></span>';
  const box = document.getElementById('fbLayersContainer');
  if (!box) return;
  box.appendChild(wrap);
  scrollChatBottom();
  await new Promise(r => setTimeout(r, 900));
  wrap.outerHTML = html;
  scrollChatBottom();
  if (afterShow) afterShow();
  await new Promise(r => setTimeout(r, 300));
}
function explorationHTML(data) {
  const n = Math.min((data && data.explored_area_count) || 0, 6);
  return `<div class="exploration-bar">
    <div class="eb-header"><span class="eb-title">🧭 探索进度</span><span class="eb-value" id="fbEbValue">已探索 ${Math.max(0,n-1)} 个方向</span></div>
    <div class="eb-track"><div class="eb-fill" id="fbEbFill" style="width:${Math.max(2,(n-1)/6*100)}%"></div></div>
    <div class="eb-labels"><span>0</span><span>2</span><span>4</span><span>6</span></div>
  </div>`;
}
function animateExploration(data) {
  const n = Math.min((data && data.explored_area_count) || 0, 6);
  const fill = document.getElementById('fbEbFill');
  const val = document.getElementById('fbEbValue');
  if (fill) { fill.classList.add('flash-up'); fill.style.width = Math.round(n/6*100) + '%'; }
  if (val) val.innerHTML = `已探索 ${n} 个方向<span class="delta"> +1</span>`;
}
function radarCardHTML(perception) {
  const p = perception || {edge:5, space:4, proportion:5, light:4, whole:5};
  const r = { edge:p.edge/10, space:p.space/10, proportion:p.proportion/10, light:p.light/10, overall:p.whole/10 };
  const rows = [['边缘感知',r.edge],['空间感知',r.space],['比例关系',r.proportion],['光影意识',r.light],['整体关系',r.overall]];
  const maxV = Math.max.apply(null, rows.map(x=>x[1]));
  const rowHtml = rows.map(([name,v])=>{
    const hl = (v === maxV) ? ' highlight' : '';
    return `<div class="radar-label-row${hl}"><span class="name">${name}${v===maxV?' ★':''}</span><span class="val">${v.toFixed(2)}</span></div>`;
  }).join('');
  return `<div class="radar-card">
    <div class="radar-header"><span class="radar-tag">五维感知评估</span><span class="radar-subtitle">AI 观察到了什么（非评分）</span></div>
    <div class="radar-wrap">
      <svg class="radar-svg" viewBox="0 0 200 200">${radarSvgB(radarPtsB(r))}</svg>
      <div class="radar-labels">${rowHtml}</div>
    </div>
  </div>`;
}
function radarPtsB(r) {
  const vals = [r.edge, r.space, r.proportion, r.light, r.overall];
  const cx = 100, cy = 100, R = 62;
  return vals.map((v,i)=>{
    const ang = (Math.PI/2) - i*(2*Math.PI/5);
    return [cx + R*v*Math.cos(ang), cy - R*v*Math.sin(ang)];
  }).map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
}
function radarSvgB(pts) {
  return `
    <polygon class="radar-grid" points="100,38 160,81 137,141 63,141 40,81"/>
    <polygon class="radar-grid" points="100,62 139,90 126,124 74,124 61,90"/>
    <polygon class="radar-grid" points="100,86 118,99 113,114 87,114 82,99"/>
    <line class="radar-axis" x1="100" y1="100" x2="100" y2="38"/><line class="radar-axis" x1="100" y1="100" x2="160" y2="81"/>
    <line class="radar-axis" x1="100" y1="100" x2="137" y2="141"/><line class="radar-axis" x1="100" y1="100" x2="63" y2="141"/><line class="radar-axis" x1="100" y1="100" x2="40" y2="81"/>
    <polygon class="radar-data" points="${pts}"/>
    <text class="radar-label-text" x="100" y="18" text-anchor="middle">边缘</text>
    <text class="radar-label-text" x="178" y="86" text-anchor="start">空间</text>
    <text class="radar-label-text" x="140" y="160" text-anchor="middle">比例</text>
    <text class="radar-label-text" x="48" y="160" text-anchor="middle">光影</text>
    <text class="radar-label-text" x="12" y="86" text-anchor="end">整体</text>`;
}
function milestoneChatHTML(m) {
  if (!m) return '';
  return `<div class="milestone-card">
    <div class="milestone-icon">${m.icon || '🏅'}</div>
    <div class="milestone-text">
      <div class="milestone-title">${escapeHtml(m.title || '')}</div>
      <div class="milestone-msg">${escapeHtml(m.message || '')}</div>
    </div>
  </div>`;
}
function reflectionChatHTML() {
  return `<div class="reflection-area show" id="fbReflectionArea">
    <div class="reflection-title">💭 画完想说点什么？</div>
    <div class="reflection-tags" id="fbReflectionTags">
      <button class="reflection-tag-btn">【测试标签1】</button>
      <button class="reflection-tag-btn">【测试标签2】</button>
      <button class="reflection-tag-btn">【测试标签3】</button>
      <button class="reflection-tag-btn is-custom">✍️ 自己写</button>
    </div>
    <div class="reflection-confirm" id="fbReflectionConfirm" style="display:none">
      <span class="reflection-confirm-text" id="fbRConfirmText"></span>
      <button class="reflection-confirm-btn" type="button">确认发送</button>
    </div>
    <div class="reflection-write" id="fbReflectionCustomRow" style="display:none">
      <input class="reflection-input" id="fbReflectionInput" maxlength="60" placeholder="写几句此刻的感受…">
      <button class="reflection-send" type="button">发送</button>
    </div>
    <div class="reflection-response" id="fbReflectionResponse">
      <div id="fbReflectionReply"></div>
    </div>
    <div class="reflection-hint">选择一个标签，或自己写几句感受</div>
  </div>`;
}
// ─── flowfb-b 反思交互：选标签 → 确认条；自己写 → 输入框 ───
// 复用 feedback-reflection.js 的 selectQuickReflection/confirmReflection/showCustomReflection/sendReflection
function bindReflectionFlow() {
  const area = document.getElementById('fbReflectionArea');
  if (!area || area.dataset.fbBound) return;
  area.dataset.fbBound = '1';
  // 事件委托：AI 标签异步替换后仍可点击
  area.addEventListener('click', e => {
    if (area.dataset.locked) return;  // 已发送锁定，忽略（双保险，配合 CSS pointer-events）
    const btn = e.target.closest('.reflection-tag-btn');
    if (!btn) return;
    if (btn.classList.contains('is-custom')) { showCustomReflection(); return; }
    // 先清理其他选中，再选当前
    area.querySelectorAll('.reflection-tag-btn:not(.is-custom)').forEach(b => b.classList.remove('selected'));
    const text = btn.textContent.replace(/^[^\s]+\s*/, '').trim();
    selectQuickReflection(btn, text);
  });
  const confirmBtn = document.getElementById('fbReflectionConfirm');
  if (confirmBtn) confirmBtn.addEventListener('click', () => { lockReflectionAfterSend(); confirmReflection(); });
  const row = document.getElementById('fbReflectionCustomRow');
  if (row) {
    const send = row.querySelector('.reflection-send');
    // 必须无参调用：直接传 sendReflection 会把 MouseEvent 当 presetText，导致 trim 报错
    if (send) send.addEventListener('click', () => {
      const input = document.getElementById('fbReflectionInput');
      const v = input ? input.value.trim() : '';
      if (!v) { sendReflection(); return; }  // 空输入走提示，不锁定
      lockReflectionAfterSend();
      sendReflection();
    });
  }
  const input = document.getElementById('fbReflectionInput');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') { lockReflectionAfterSend(); sendReflection(); } });
}
// 反思发送后锁定：只允许发送 1 次（旧 confirmReflection 只锁 .r-quick-btn，需对 reflection-tag-btn 补锁）
function lockReflectionAfterSend() {
  const area = document.getElementById('fbReflectionArea');
  if (!area || area.dataset.locked) return;
  area.dataset.locked = '1';
  const tags = area.querySelector('.reflection-tags');
  if (tags) tags.classList.add('locked');
  const write = area.querySelector('.reflection-write');
  if (write) write.classList.add('locked');
}
function archiveChatHTML(record) {
  return `<div class="archive-flow">
    <div class="archive-pill filing"><span class="pill-icon">📋</span><span class="pill-text">已存入画者档案</span></div>
    <div class="archive-pill flow-bank">
      <div class="flow-bank-mini"><svg viewBox="0 0 28 32"><rect x="4" y="4" width="20" height="24" rx="3" fill="none" stroke="var(--raw-ochre-500)" stroke-width="1.5"/><rect class="flow-bank-liquid" id="fbFlowLiquid" x="6" y="22" width="16" height="4" rx="1"/></svg></div>
      <span class="pill-text">心流余额</span><span class="pill-val" id="fbFlowVal">+1</span>
    </div>
  </div>`;
}
function animateFlowBank() {
  setTimeout(() => {
    const l = document.getElementById('fbFlowLiquid');
    if (l) { l.setAttribute('y', '14'); l.setAttribute('height', '12'); }
  }, 200);
}

function finalizeStreamingFeedback(completeData, receivedLayers) {
  const record = completeData.record || {id: 'fallback_' + Date.now()};

  // 补全可能遗漏的层
  if (record.feedback_json && record.feedback_json.layers) {
    const fullLayers = record.feedback_json.layers;
    if (fullLayers.length > receivedLayers.length) {
      for (let i = receivedLayers.length; i < fullLayers.length; i++) {
        renderStreamingLayer(fullLayers[i], i + 1);
      }
    }
  }

  currentTotalDrawings = completeData.total_drawings || (window.records ? records.length : 0) || 1;
  currentRecordId = record.id;
  document.getElementById('fbHeadStatus').innerHTML = '<span class="dot"></span>看完了你的画';

  const perception = completeData.perception_analysis ||
    (record.feedback_json && record.feedback_json.perception_analysis);
  const exploration = completeData.exploration ||
    record.exploration ||
    (record.feedback_json && record.feedback_json.exploration);
  const m = completeData.milestone || record.milestone;

  // ═══ flowfb-b 组件顺序：探索 → 雷达 → 里程碑 → 反思 → 归档 ═══
  (async () => {
    try { await botComponent(explorationHTML(exploration), () => animateExploration(exploration)); } catch (e) { console.error('flow explore:', e); }
    try { await botComponent(radarCardHTML(perception), null); } catch (e) { console.error('flow radar:', e); }
    if (m) {
      // 里程碑统一用对话流内卡片展示（不再弹顶部恭喜弹窗，避免与反馈信息样式不同步）
      try { await botComponent(milestoneChatHTML(m), null); } catch (e) { console.error('flow milestone:', e); }
    }
    try { await botComponent(reflectionChatHTML(), () => { bindReflectionFlow(); setTimeout(() => loadReflectionTags(), 300); }); } catch (e) { console.error('flow reflection:', e); }
    try { await botComponent(archiveChatHTML(record), () => animateFlowBank()); } catch (e) { console.error('flow archive:', e); }
    // 操作按钮 + ← 回到首页（归档后显示）
    const acts = document.getElementById('fbChatActions');
    if (acts) acts.style.display = 'flex';
    scrollChatBottom();
    setTimeout(() => stopFeedbackAutoScroll(), 2000);
  })();

  track('ai_feedback_viewed', {record_id: record.id});
}

// ─── Show Feedback ───
function showFeedback(record) {
  track('ai_feedback_viewed', {record_id: record.id});
  currentRecordId = record.id;  // 保存当前记录 ID 用于反思保存

  // 用户名标签保持隐藏

  // 有 feedback_json → 渲染陪伴模式流式反馈
  if (record.feedback_json && record.feedback_json.layers && record.feedback_json.layers.length >= 4) {
    renderEnhancedFeedback(record);
    return;
  }

  // 无 feedback_json → 渲染旧版文本（向后兼容）
  const container = document.getElementById('feedback');
  const content = document.getElementById('feedbackContent');
  const badge = document.getElementById('elapsedBadge');
  container.classList.add('visible');

  // 里程碑卡片（普通反馈也显示）
  const milestoneSlot = document.getElementById('milestoneSlotLegacy');
  if (milestoneSlot) {
    milestoneSlot.innerHTML = '';
    if (record.milestone) {
      const m = record.milestone;
      const mClass = `milestone-icon ${m.number <= 50 ? 'm' + m.number : 'm50'}`;
      const cardClass = `milestone-card ${m.number <= 50 ? 'm' + m.number : 'm50'}`;
      milestoneSlot.innerHTML = `
        <div class="${cardClass}">
          <div class="${mClass}">${m.icon}</div>
          <div class="milestone-body">
            <div class="milestone-title">${escapeHtml(m.title)}</div>
            <div class="milestone-desc">${escapeHtml(m.message)}</div>
          </div>
        </div>`;
    }
  }

  if (record.elapsed_s) {
    const s = record.elapsed_s;
    badge.textContent = s < 10 ? `${s}s` : `${Math.round(s)}s`;
  }

  const lines = record.feedback.split('\n').filter(l => l.trim());
  let html = '';
  lines.forEach(line => {
    const cleanLine = line.trim().replace(/^[\d]+[)）.、:：]?\s*/, '');
    if (!cleanLine) return;
    html += `<p style="margin-bottom:6px;">${enrichText(cleanLine)}</p>`;
  });
  content.innerHTML = html;

  // 滚动到反馈区顶部
  setTimeout(() => {
    const rect = container.getBoundingClientRect();
    const scrollTop = window.pageYOffset + rect.top - 12;
    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
  }, 100);

  // 延迟显示操作按钮

  // 显示反思交互区
  setTimeout(() => {
    document.getElementById('reflectionArea').classList.add('visible');
    resetReflectionUI();
    const input = document.getElementById('reflectionInput');
    if (input) input.placeholder = `比如：${currentDrawingSubject}的形状这次画准了`;
  }, 1000);
}


// ═══ 反馈增强 v3.1 新功能 ═══════════════════════════════

// ─── 简洁等待提示（流式反馈逐步替代） ───
function showSimpleWaiting() {
  // loading 态直接放在反馈容器中，不单独占区域
  const container = document.getElementById('feedbackEnhanced');
  container.classList.add('visible');
  document.getElementById('milestoneSlot').innerHTML = '';
  document.getElementById('fbLayersContainer').innerHTML = `
    <div class="simple-waiting">
      <div class="simple-waiting-dots">
        <span></span><span></span><span></span>
      </div>
    </div>`;
}

function stopSimpleWaiting() {
  // loading 内容由 SSE first_impression / layer 事件自然替换，
  // 这里不做任何 DOM 清理。避免 finally 块误清已渲染的反馈层。
}

// ─── 5层增强反馈渲染 ───
function renderEnhancedFeedback(record) {
  const fbJson = record.feedback_json;
  const userName = document.getElementById('greetingName').textContent || '小伙伴';

  // 更新全局术语上下文（用于弹窗增强）
  currentGlossaryContext = (fbJson && fbJson.glossary_context) || {};

  // 显示增强容器
  const container = document.getElementById('feedbackEnhanced');
  container.classList.add('visible');

  // 设置头部
  if (record.elapsed_s) {
    const s = record.elapsed_s;
    const eb = document.getElementById('elapsedBadgeEnhanced');
    if (eb) eb.textContent = s < 10 ? `${s}s` : `${Math.round(s)}s`;
  }

  // 里程碑卡片
  document.getElementById('milestoneSlot').innerHTML = '';
  if (record.milestone) {
    const m = record.milestone;
    const mClass = `milestone-icon ${m.number <= 50 ? 'm' + m.number : 'm50'}`;
    const cardClass = `milestone-card ${m.number <= 50 ? 'm' + m.number : 'm50'}`;
    document.getElementById('milestoneSlot').innerHTML = `
      <div class="${cardClass}">
        <div class="${mClass}">${m.icon}</div>
        <div class="milestone-body">
          <div class="milestone-title">${escapeHtml(m.title)}</div>
          <div class="milestone-desc">${escapeHtml(m.message)}</div>
        </div>
      </div>`;
  }

  // 渲染 5 层
  const layersEl = document.getElementById('fbLayersContainer');
  layersEl.innerHTML = '';

  // 提取绘画主题（用于反思提示文案）
  const identifyLayer = layers.find(l => l.type === 'identify');
  if (identifyLayer && identifyLayer.content) {
    // 尝试从识别层内容中提取主题词
    const match = identifyLayer.content.match(/画的是(?:一个|一只|一幅)?(.+?)[对吧呢？\?]/);
    if (match && match[1]) {
      currentDrawingSubject = match[1].trim();
    }
  }
  // 如果没提取到，用今日主题
  if (currentDrawingSubject === '这次') {
    const themeTitle = document.getElementById('themeTitle')?.textContent || '';
    if (themeTitle && themeTitle !== '画你想画的') {
      currentDrawingSubject = themeTitle.replace(/^画一个?/, '');
    }
  }

  const LAYER_TAGS   = {identify: 'l-identify', observe: 'l-observe', progress: 'l-progress', suggestion: 'l-suggest', encourage: 'l-encourage'};
  const LAYER_LABELS = {identify: '识别', observe: '观察', progress: '进步', suggestion: '建议', encourage: '鼓励'};

  layers.forEach(layer => {
    const type = layer.type;
    const tagClass = LAYER_TAGS[type] || '';
    const label = LAYER_LABELS[type] || type;
    const div = document.createElement('div');
    div.className = 'fb-layer';

    // 统一层级结构
    let html = `<span class="layer-tag ${tagClass}">${label}</span>
      <div class="layer-text">${enrichText(layer.content)}</div>`;
    if ((type === 'observe' || type === 'suggestion') && layer.tip && layer.tip.trim()) {
      html += `<div class="fb-tip-box"><strong>小技巧</strong>：${enrichText(layer.tip)}</div>`;
    }
    div.innerHTML = html;
    // 身份确认语并入 identify 卡片（与流式路径一致）
    if (type === 'identify' && layer.identity_statement) {
      div.innerHTML = html;
    }
    layersEl.appendChild(div);
  });

  // 2.0 回放模式：渲染雷达图和探索进度
  const perceptionData = record.feedback_json?.perception_analysis || record.perception_analysis;
  const breakthroughDim = record.feedback_json?.breakthrough_dim || record.breakthrough_dim;
  if (perceptionData && typeof renderRadarChart === 'function') {
    const radarContainer = document.getElementById('radarChartContainer');
    if (radarContainer) {
      setTimeout(() => renderRadarChart(perceptionData, breakthroughDim, radarContainer), 300);
    }
  }
  const explorationData = record.exploration || record.feedback_json?.exploration;
  if (explorationData && typeof renderExplorationBar === 'function') {
    const explorationContainer = document.getElementById('explorationBarContainer');
    if (explorationContainer) {
      setTimeout(() => renderExplorationBar(explorationData, explorationContainer), 600);
    }
  }

  // 2.0 回放模式：心流银行 + 档案归档
  const replayData = record.feedback_json || record;
  setTimeout(() => renderFlowBank(replayData), 900);
  setTimeout(() => renderArchivePill(replayData), 1200);

  // 滚动到反馈区顶部（延迟等 DOM 渲染完成）
  setTimeout(() => {
    const rect = container.getBoundingClientRect();
    const scrollTop = window.pageYOffset + rect.top - 12;
    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
    // 回放模式也启动锚点跟随
    startFeedbackAutoScroll();
  }, 200);

  // 延迟 2 秒显示操作按钮

  // 显示反思交互区
  setTimeout(() => {
    document.getElementById('reflectionArea').classList.add('visible');
    resetReflectionUI();
    const input = document.getElementById('reflectionInput');
    if (input) input.placeholder = `比如：${currentDrawingSubject}的形状这次画准了`;
  }, 1000);
}

