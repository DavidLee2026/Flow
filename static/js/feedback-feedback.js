// ─── AI 生成反思快选标签 ───
function loadReflectionTags(retry = 0) {
  // subject 优先用实际识别主题（currentDrawingSubject），避免用今日推荐主题生成与画作无关的标签
  const subject = (currentDrawingSubject && currentDrawingSubject !== '这次')
    ? currentDrawingSubject
    : (document.getElementById('themeTodayTitle')?.textContent || '');
  // 实时流程反馈层是 .stream-layer；V2V5 融合三幕是 .fb-layer-c，两者都要取，取不到才兜底默认标签
  const layers = document.querySelectorAll('#fbLayersContainer .stream-layer, #fbLayersContainer .fb-layer-c');
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
  // ═══ 「此刻想说」重设计（Part B）：默认为一行轻量入口，点按展开标签+输入，完全可选 ═══
  return `<div class="reflection-area" id="fbReflectionArea">
    <div class="reflection-entry" id="fbReflectionEntry" role="button" tabindex="0">
      <span class="re-ico">💬</span>
      <span class="re-t">此刻想说？</span>
      <span class="re-opt">可选</span>
      <span class="re-arrow">▸</span>
    </div>
    <div class="reflection-panel" id="fbReflectionPanel" style="display:none">
      <div class="reflection-lead">画完了，此刻有什么想说的吗？说给小绘听，小绘会记进你的画者档案。</div>
      <div class="reflection-tags" id="fbReflectionTags">
        <button class="reflection-tag-btn">正在生成标签…</button>
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
    </div>
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
    // 「此刻想说」入口行 → 展开/收起面板
    if (e.target.closest('#fbReflectionEntry')) { toggleReflectionPanel(); return; }
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
// 「此刻想说」入口行展开/收起面板
function toggleReflectionPanel() {
  const entry = document.getElementById('fbReflectionEntry');
  const panel = document.getElementById('fbReflectionPanel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (entry) {
    entry.classList.toggle('open', !isOpen);
    const arrow = entry.querySelector('.re-arrow');
    if (arrow) arrow.textContent = !isOpen ? '▾' : '▸';
  }
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

// ═══ V2+V5 融合 · 三幕渲染辅助 ═══
// 句子切分：兼容句号/问号/叹号/分号（AI 反馈常用分号连接两个并列观察）
function fbSplitSentences(t) { return String(t || '').split(/[。！？；;\n]/).map(s => s.trim()).filter(Boolean); }
function fbFirstSentence(t) { const p = fbSplitSentences(t); return p.length ? p[0] : (t ? String(t).trim() : ''); }
// 观察展开区显示小绘说之外的第二句起（小绘说=第一句，避免完全重复）；单句数据兜底返回原句
function fbObserveRest(t) {
  const p = fbSplitSentences(t);
  if (p.length <= 1) return String(t || '').trim();
  return p.slice(1).join('。');
}
// 结论卡（幕1 头）
function fbConclHTML(identify, summary) {
  const identTxt = identify && identify.content ? identify.content : '';
  const line = summary ? `<div class="fb-concl-line"><span class="tag-mini">✨ 小绘说</span><span>${enrichText(summary)}</span></div>` : '';
  return `<div class="fb-concl-wrap">
    <div class="fb-concl">
      ${identTxt ? `<div class="fb-concl-identify">${enrichText(identTxt)}</div>` : ''}
      ${line}
      <button class="fb-expand-btn" id="fbExpandBtn"><span>展开完整反馈</span><span class="fb-expand-arrow">▾</span></button>
    </div>
  </div>`;
}
// 三层反馈卡（完整，用于展开区）
function fbLayerHTML(layer, side = '') {
  if (!layer) return '';
  const labelMap = {identify:'🎯 认出', observe:'🔍 观察', progress:'📈 进步', suggestion:'💡 建议', encourage:'✨ 期待'};
  const label = labelMap[layer.type] || layer.type;
  let h = `<div class="fb-layer-c ${side}" data-type="${layer.type}"><span class="s-tag">${label}</span><div class="s-text">${enrichText(layer.content)}</div>`;
  if ((layer.type === 'observe' || layer.type === 'suggestion') && layer.tip && layer.tip.trim()) {
    h += `<div class="fb-tip-box"><b>💡 小技巧</b>：${enrichText(layer.tip)} 💪</div>`;
  }
  return h + `</div>`;
}
// 幕标题行（可点击展开）
function fbActHeadHTML(cls, ico, title) {
  return `<div class="fb-act-head" data-act="${cls}"><span class="fb-act-ico">${ico}</span><span class="fb-act-title">${title}</span><span class="fb-act-arrow">▸</span></div>`;
}
// 我的成长折叠入口（强提示：露底 + 箭头 + 红点首次）
function fbGrowBtnHTML(exploration, isFirst) {
  const count = (exploration && exploration.explored_area_count) || 0;
  return `<button class="fb-grow-btn" id="fbGrowBtn">
    <span class="g-ico">🧭</span>
    <span class="g-t">我的成长</span>
    <span class="g-sub">探索 ${count} 个方向 · 雷达 · 里程碑 · 心流</span>
    ${isFirst ? '<span class="g-dot"></span>' : '<span class="g-caret">▸</span>'}
  </button>`;
}
// 归档行（降级为一行）
function fbArchiveLineHTML(record, count) {
  return `<div class="archive-line"><span>📂</span><span>已存入画者档案 · 第 <b>${count}</b> 张</span><span class="flow">💧 +1</span></div>`;
}
// 成长区 · 小型心流储蓄卡（对齐定稿原型 grow-card + flow-mini，替代大储蓄罐）
function flowMiniHTML(data) {
  const exploration = (data && data.exploration) || {};
  const flowValue = exploration.progress || 0;
  let statusText = '心流正在积累';
  if (flowValue >= 70) statusText = '心流充盈，画者状态极佳';
  else if (flowValue >= 40) statusText = '心流稳定，继续保持';
  else statusText = '心流偏低，下次试试深呼吸';
  return `<div class="grow-card flow-mini-card">
    <div class="grow-row">
      <span class="grow-ico">💧</span>
      <div class="grow-main">
        <div class="grow-label">心流储蓄</div>
        <div class="grow-sub">${statusText}</div>
      </div>
      <span class="flow-mini">
        <svg viewBox="0 0 22 26"><rect x="2" y="3" width="18" height="20" rx="3" fill="none" stroke="var(--raw-ochre-500)" stroke-width="1.5"/><rect x="4" y="16" width="14" height="4" rx="1" fill="var(--raw-ochre-500)" opacity=".7"/></svg>
        +1
      </span>
    </div>
  </div>`;
}
// 展开/收起幕
function toggleFbAct(head) {
  const detail = head.parentElement.querySelector('.fb-act-detail');
  if (!detail) return;
  const open = detail.getAttribute('hidden') !== null;
  detail.toggleAttribute('hidden', !open);
  const arrow = head.querySelector('.fb-act-arrow');
  if (arrow) arrow.textContent = open ? '▸' : '▾';
}

// ═══ V2+V5 融合 · 公共三幕渲染（流式与回放共用，保证双路径一致） ═══
function renderV2V5Feedback(record, opts) {
  const layers = opts.layers || [];
  const byType = {};
  layers.forEach(l => { if (l && l.type && !byType[l.type]) byType[l.type] = l; });
  const identify = byType.identify, observe = byType.observe, progress = byType.progress,
        suggestion = byType.suggestion, encourage = byType.encourage;
  const exploration = opts.exploration, perception = opts.perception, m = opts.milestone;

  // 一句话总评 + 识别主题
  const summary = fbFirstSentence(observe ? observe.content : (encourage ? encourage.content : ''));
  if (identify && identify.content) {
    const mt = identify.content.match(/画的是(?:一个|一只|一幅)?(.+?)[对吧呢？\?]/);
    if (mt && mt[1]) currentDrawingSubject = mt[1].trim();
  }

  const box = document.getElementById('fbLayersContainer');
  if (box) box.innerHTML = '';

  // ═══ 对话流外壳 × 三幕（首屏只出 1 个结论气泡） ═══
  const wrap = document.createElement('div');
  wrap.className = 'fb-v25';
  wrap.innerHTML = `<div class="fb-act fb-act1">
    ${fbConclHTML(identify, summary)}
    <div class="fb-act-detail" hidden>${observe ? fbLayerHTML({...observe, content: fbObserveRest(observe.content)}) : ''}</div>
  </div>
  <div class="fb-act fb-act2">
    ${fbActHeadHTML('act2', '📈', '进步与建议')}
    <div class="fb-act-detail" hidden>${fbLayerHTML(progress)}${fbLayerHTML(suggestion)}</div>
  </div>
  <div class="fb-act fb-act3">
    ${fbActHeadHTML('act3', '🚀', '接下来')}
    <div class="fb-act-detail" hidden>
      ${fbLayerHTML(encourage)}
      <div class="fb-grow-wrap">
        ${fbGrowBtnHTML(exploration, true)}
        <div class="fb-grow-full" hidden>
          ${exploration ? explorationHTML(exploration) : ''}
          ${perception ? radarCardHTML(perception) : ''}
          ${m ? milestoneChatHTML(m) : ''}
          <div class="flow-bank-slot"></div>
        </div>
      </div>
      ${reflectionChatHTML()}
      ${fbArchiveLineHTML(record, currentTotalDrawings)}
    </div>
  </div>`;
  box.appendChild(wrap);
  scrollChatBottom();

  // ── 绑定交互（用户动作驱动展开：呼吸阀） ──
  wrap.querySelectorAll('.fb-act-head').forEach(head => head.addEventListener('click', () => toggleFbAct(head)));
  const expandBtn = wrap.querySelector('#fbExpandBtn');
  if (expandBtn) expandBtn.addEventListener('click', () => {
    const detail = wrap.querySelector('.fb-act1 .fb-act-detail');
    if (detail) {
      const nowOpen = !detail.hasAttribute('hidden');
      detail.toggleAttribute('hidden', nowOpen); // force=true 收起 / false 打开
      const arrow = expandBtn.querySelector('.fb-expand-arrow');
      if (arrow) arrow.textContent = nowOpen ? '▴' : '▾';
    }
    const a2 = wrap.querySelector('.fb-act2');
    if (a2) a2.classList.add('peek');  // 幕2 露头引导
  });
  const growBtn = wrap.querySelector('.fb-grow-btn');
  if (growBtn) growBtn.addEventListener('click', () => {
    const full = wrap.querySelector('.fb-grow-full');
    if (full) full.toggleAttribute('hidden', !full.hasAttribute('hidden'));
  });

  // 心流储蓄（成长区 · 小型卡，重放与流式共用，替代大储蓄罐）
  const flowSlot = wrap.querySelector('.flow-bank-slot');
  if (flowSlot) {
    flowSlot.innerHTML = flowMiniHTML(record.feedback_json || record);
  }
  // 反思（此刻想说：入口行 → 展开）
  bindReflectionFlow();
  setTimeout(() => loadReflectionTags(), 300);
  return wrap;
}

function finalizeStreamingFeedback(completeData, receivedLayers) {
  const record = completeData.record || {id: 'fallback_' + Date.now()};

  // 补全可能遗漏的层（不再逐条弹出，收集后三幕呈现）
  const allLayers = [...(receivedLayers || [])];
  if (record.feedback_json && record.feedback_json.layers) {
    const fullLayers = record.feedback_json.layers;
    for (let i = allLayers.length; i < fullLayers.length; i++) allLayers.push(fullLayers[i]);
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

  renderV2V5Feedback(record, {layers: allLayers, exploration, perception, milestone: m});

  // 操作按钮 + ← 回到首页
  const acts = document.getElementById('fbChatActions');
  if (acts) acts.style.display = 'flex';
  scrollChatBottom();
  setTimeout(() => stopFeedbackAutoScroll(), 2000);

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

  // 清掉旧的独立容器（三幕后统一走 renderV2V5Feedback，不再单独渲染）
  document.getElementById('milestoneSlot').innerHTML = '';
  currentRecordId = record.id;
  currentTotalDrawings = (window.records ? records.length : 0) || 1;

  const perception = fbJson?.perception_analysis || record.perception_analysis;
  const exploration = record.exploration || fbJson?.exploration;
  const m = record.milestone;
  const layers = (fbJson && fbJson.layers) || [];

  // ═══ V2+V5 融合：与流式共用同一渲染源（双路径一致） ═══
  renderV2V5Feedback(record, {layers, exploration, perception, milestone: m});

  // 操作按钮
  const acts = document.getElementById('fbChatActions');
  if (acts) acts.style.display = 'flex';

  // 滚动到反馈区顶部 + 锚点跟随
  setTimeout(() => {
    const rect = container.getBoundingClientRect();
    const scrollTop = window.pageYOffset + rect.top - 12;
    window.scrollTo({ top: scrollTop, behavior: 'smooth' });
    startFeedbackAutoScroll();
  }, 200);

  // 反思交互（此刻想说，renderV2V5Feedback 内已 bindReflectionFlow）
  track('ai_feedback_viewed', {record_id: record.id});
}

