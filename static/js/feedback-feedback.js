// ─── AI 生成反思快选标签 ───
function loadReflectionTags() {
  const subject = document.getElementById('themeTodayTitle')?.textContent || '';
  const layers = document.querySelectorAll('#fbLayersContainer .layer-text');
  let snippet = '';
  layers.forEach((el, i) => {
    if (i < 3) snippet += el.textContent.slice(0, 80) + ' ';
  });
  snippet = snippet.trim().slice(0, 200);
  console.log(`[reflection-tags] 请求 subject='${subject}' layers=${layers.length} snippet_len=${snippet.length}`);

  fetch('/api/reflection-tags', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({subject, feedback_snippet: snippet}),
    signal: AbortSignal.timeout(15000),
  })
    .then(r => r.json())
    .then(data => {
      if (!data.tags || data.tags.length === 0) return;
      console.log(`[reflection-tags] 收到 ${data.tags.length} 个 AI 标签`, data.tags);
      const container = document.getElementById('reflectionQuickOptions');
      if (!container) return;
      // 保留"自己写"按钮
      const customBtn = container.querySelector('.r-quick-custom');
      container.innerHTML = data.tags.map(t =>
        `<button class="r-quick-btn" onclick="selectQuickReflection(this, '${escapeHtml(t.text)}')">${t.emoji || '🏷️'} ${escapeHtml(t.text)}</button>`
      ).join('');
      if (customBtn) container.appendChild(customBtn);
    })
    .catch(() => {
      console.warn('[reflection-tags] API 超时/失败，保留硬编码标签');
    });
}

// ─── 流式完成后的收尾 ───
function finalizeStreamingFeedback(completeData, receivedLayers) {
  const record = completeData.record || {id: 'fallback_' + Date.now()};

  // 如果没有收到任何 layer（流式提取失败），用 record 的完整数据渲染
  if (receivedLayers.length === 0 && record.feedback_json && record.feedback_json.layers) {
    stopSimpleWaiting();
    showFeedback(record);
    if (completeData.next_recommendation) {
      document.getElementById('nextRecText').textContent = completeData.next_recommendation.title;
      document.getElementById('nextRec').classList.add('visible');
    }
    return;
  }

  // 补全可能遗漏的层（流式正则可能漏掉最后一层的 tip 等字段）
  if (record.feedback_json && record.feedback_json.layers) {
    const fullLayers = record.feedback_json.layers;
    const container = document.getElementById('fbLayersContainer');
    // 比较已渲染层数和完整层数
    if (fullLayers.length > receivedLayers.length) {
      for (let i = receivedLayers.length; i < fullLayers.length; i++) {
        renderStreamingLayer(fullLayers[i], i + 1);
      }
    }
  }

  // 显示耗时
  if (record.elapsed_s) {
    const s = record.elapsed_s;
    document.getElementById('elapsedBadgeEnhanced').textContent = s < 10 ? `${s}s` : `${Math.round(s)}s`;
  }

  // ── 安全兜底：确保标题恢复（防止 showSimpleWaiting 的 "AI 正在看你的画…" 未覆盖）──
  const subEl = document.getElementById('aiSubtitleEnhanced');
  if (subEl && subEl.textContent === 'AI 正在看你的画…') {
    setAiSubtitle();
  }
  // ── 恢复预览区标签 ──
  const tagEl = document.querySelector('.preview-confirm-tag');
  if (tagEl && tagEl.textContent === '🔍 分析中') {
    tagEl.textContent = '✓ 已分析';
  }
  const hintEl = document.querySelector('.preview-confirm-hint');
  if (hintEl && hintEl.textContent === 'AI 正在看你的画...') {
    hintEl.textContent = '画作已分析完成';
  }

  // 里程碑卡片
  document.getElementById('milestoneSlot').innerHTML = '';
  if (completeData.milestone || record.milestone) {
    const m = completeData.milestone || record.milestone;
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
    // 触发顶部成就弹窗
    showAchievementPopup(m);
  }

  // 2.0 新增：身份确认语兜底（流式未提取到时从 complete 数据补入）
  const identitySlot = document.getElementById('identityStatementSlot');
  if (identitySlot && !identitySlot.classList.contains('visible')) {
    const identityText = completeData.identity_statement ||
      (record.feedback_json?.layers?.find(l => l.type === 'identify')?.identity_statement);
    if (identityText) {
      identitySlot.innerHTML = `
        <div class="identity-statement-card">
          <div class="identity-statement-text">${enrichText(identityText)}</div>
        </div>`;
      identitySlot.classList.add('visible');
    }
  }

  // 2.0 存储完整数据供流式层渲染时使用（时机修正后由各层触发雷达图/探索进度）
  window._pendingFeedbackData = completeData;

  // 2.0 雷达图/探索进度兜底：如果流式渲染时未触发（数据在 complete 才返回），此处补渲染
  const perceptionData = completeData.perception_analysis ||
    (record.feedback_json?.perception_analysis);
  const breakthroughDim = completeData.breakthrough_dim ||
    (record.feedback_json?.breakthrough_dim);
  if (perceptionData && typeof renderRadarChart === 'function') {
    const radarContainer = document.getElementById('radarChartContainer');
    if (radarContainer && radarContainer.style.display === 'none') {
      setTimeout(() => {
        renderRadarChart(perceptionData, breakthroughDim, radarContainer);
      }, 500);
    }
  }

  // 2.0 新增：渲染探索进度（兜底，流式未触发时补渲染）
  const explorationData = completeData.exploration ||
    (record.exploration) ||
    (record.feedback_json?.exploration);
  if (explorationData && typeof renderExplorationBar === 'function') {
    const explorationContainer = document.getElementById('explorationBarContainer');
    if (explorationContainer && explorationContainer.style.display === 'none') {
      setTimeout(() => {
        renderExplorationBar(explorationData, explorationContainer);
      }, 800);
    }
  }

  // 2.0 心流银行 + 档案归档（兜底）— 提前延迟避免「高潮收尾」过长
  setTimeout(() => renderFlowBank(completeData), 800);
  setTimeout(() => {
    // 旅程：档案归档阶段
    if (typeof setJourneyStage === 'function' && getJourneyStage() < 7) setJourneyStage(7);
    renderArchivePill(completeData);
  }, 1100);

  // 下一幅推荐
  if (completeData.next_recommendation) {
    document.getElementById('nextRecText').textContent = completeData.next_recommendation.title;
    document.getElementById('nextRec').classList.add('visible');
  }

  // 操作按钮
  currentRecordId = record.id;
  track('ai_feedback_viewed', {record_id: record.id});
  startActionButtonsDelay(record);

  // 反思交互区
  setTimeout(() => {
    document.getElementById('reflectionArea').classList.add('visible');
    resetReflectionUI();
    loadReflectionTags();
    if (currentDrawingSubject === '这次') {
      const themeTitle = document.getElementById('themeTitle')?.textContent || '';
      if (themeTitle && themeTitle !== '画你想画的') {
        currentDrawingSubject = themeTitle.replace(/^画一个?/, '');
      }
    }
    const input = document.getElementById('reflectionInput');
    if (input) input.placeholder = `比如：${currentDrawingSubject}的形状这次画准了`;
  }, 1000);

  // 用户名标签保持隐藏

  // 所有延迟组件渲染完毕后停止锚点跟随
  setTimeout(() => stopFeedbackAutoScroll(), 2000);
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
      showAchievementPopup(m);
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
  startActionButtonsDelay(record);

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
  document.getElementById('aiNameEnhanced').textContent = '小绘';
  document.getElementById('aiSubtitleEnhanced').textContent = 'AI 正在看你的画…';
  document.getElementById('milestoneSlot').innerHTML = '';
  document.getElementById('fbDepthLayer').innerHTML = '';
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
  document.getElementById('aiNameEnhanced').textContent = '小绘';
  setAiSubtitle();
  if (record.elapsed_s) {
    const s = record.elapsed_s;
    document.getElementById('elapsedBadgeEnhanced').textContent = s < 10 ? `${s}s` : `${Math.round(s)}s`;
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

  // 深度指示器
  const layers = fbJson.layers || [];
  const LABELS = {identify: '认出内容', observe: '具体观察', progress: '进步连接', suggestion: '技巧建议', encourage: '鼓励期待'};
  document.getElementById('fbDepthLayer').innerHTML = `
    <div class="fb-depth">
      ${layers.map((l, i) => `<div class="dot d${i+1}" title="${LABELS[l.type] || l.type}"></div>`).join('')}
      <span class="fb-depth-label">小绘的解读</span>
    </div>`;

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
    // 2.0 身份确认语（回放模式）
    if (type === 'identify' && layer.identity_statement) {
      const slot = document.getElementById('identityStatementSlot');
      if (slot) {
        slot.innerHTML = `
          <div class="identity-statement-card">
            <div class="identity-statement-text">${enrichText(layer.identity_statement)}</div>
          </div>`;
        slot.classList.add('visible');
      }
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
  startActionButtonsDelay(record);

  // 显示反思交互区
  setTimeout(() => {
    document.getElementById('reflectionArea').classList.add('visible');
    resetReflectionUI();
    const input = document.getElementById('reflectionInput');
    if (input) input.placeholder = `比如：${currentDrawingSubject}的形状这次画准了`;
  }, 1000);
}

