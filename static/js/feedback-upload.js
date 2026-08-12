// ─── feedback.js · AI 流式反馈 / 反思交互 / 操作按钮 ───
// 依赖：state.js；运行时调用 camera.js / share.js / timeline.js 的函数
// ─── Upload → Analyze（流式 SSE）───
async function uploadImage(file) {
  // 清理上一次的锚点跟随 observer
  stopFeedbackAutoScroll();
  document.getElementById('spinner').classList.remove('active');
  document.getElementById('feedback').classList.remove('visible');
  document.getElementById('feedbackEnhanced').classList.remove('visible');
  document.getElementById('nextRec').classList.remove('visible');
  document.getElementById('reflectionArea').classList.remove('visible');
  document.getElementById('reflectionResponse').classList.remove('visible');
  const customRowEl = document.getElementById('reflectionCustomRow');
  if (customRowEl) customRowEl.style.display = 'none';
  document.querySelectorAll('.r-quick-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('fbActions').classList.remove('visible');
  document.getElementById('error').classList.remove('visible');

  // 2.0 新增：重置雷达图、探索进度、身份确认语容器（延迟插入策略：清空内容，仅在触发时填充）
  const radarEl = document.getElementById('radarChartContainer');
  if (radarEl) { radarEl.style.display = 'none'; radarEl.classList.remove('visible'); radarEl.innerHTML = ''; }
  const explorationEl = document.getElementById('explorationBarContainer');
  if (explorationEl) { explorationEl.style.display = 'none'; explorationEl.classList.remove('visible'); explorationEl.innerHTML = ''; }
  const identityEl = document.getElementById('identityStatementSlot');
  if (identityEl) { identityEl.innerHTML = ''; identityEl.classList.remove('visible'); }
  // 改造三：同步清理心流银行、档案归档、里程碑（避免旧内容残留）
  const flowEl = document.getElementById('flowBankSlot');
  if (flowEl) flowEl.innerHTML = '';
  const archiveEl = document.getElementById('archivePillSlot');
  if (archiveEl) archiveEl.innerHTML = '';
  const milestoneEl = document.getElementById('milestoneSlot');
  if (milestoneEl) milestoneEl.innerHTML = '';

  // 简洁等待提示（流式反馈会逐步替代）
  showSimpleWaiting();

  // 滚动到反馈区域，确保完全可见
  setTimeout(() => {
    const fb = document.getElementById('feedbackEnhanced');
    if (fb) {
      const rect = fb.getBoundingClientRect();
      const scrollTop = window.pageYOffset + rect.bottom - window.innerHeight + 24;
      window.scrollTo({ top: Math.max(0, scrollTop), behavior: 'smooth' });
    }
  }, 80);

  // 客户端压缩
  const compressedFile = await compressImage(file);

  // ═══ 2.0 改造六：7 阶段旅程 — 拍照上传阶段 ═══
  if (typeof showJourney === 'function') {
    showJourney();
    setJourneyStage(3);
  }

  // ═══ 2.0 MVP: 绘画重现动画（在SSE反馈前播放） ═══
  // 将拍照→反馈 变为 拍照→看见画活过来→反馈
  if (typeof playDrawingReplay === 'function') {
    // 隐藏等待提示，重现动画接管视觉焦点
    const waitingEl = document.getElementById('feedbackEnhanced');
    if (waitingEl) waitingEl.classList.remove('visible');
    // 旅程：绘画重现阶段
    if (typeof setJourneyStage === 'function') setJourneyStage(4);
    // 使用原始图片进行矢量化（质量更好，replay.js内部会降采样）
    const replayUrl = URL.createObjectURL(file);
    await new Promise((resolve) => {
      playDrawingReplay(replayUrl, resolve, { timeout: 5000 });
    });
    URL.revokeObjectURL(replayUrl);
    // 重现完成后恢复等待提示，SSE即将开始
    showSimpleWaiting();
  }

  const formData = new FormData();
  formData.append('image', compressedFile);
  // 附带当前主题信息
  const themeTitle = document.getElementById('themeTodayTitle')?.textContent || '';
  if (themeTitle) formData.append('theme', themeTitle);

  try {
    const response = await fetch(`${API_BASE}/api/analyze/stream`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      stopSimpleWaiting();
      const errData = await response.json().catch(() => ({}));
      showError(errData.error || '分析失败，请重试');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    // 旅程：AI 处理阶段（SSE 开始）
    if (typeof setJourneyStage === 'function') setJourneyStage(5);
    let buffer = '';
    const receivedLayers = [];   // 实时渲染，不再缓存
    let completeData = null;
    let containerReady = false;

    // 确保反馈容器已准备好（仅第一次调用时初始化）
    function ensureContainerReady() {
      if (containerReady) return;
      containerReady = true;
      stopSimpleWaiting();
      const container = document.getElementById('feedbackEnhanced');
      container.classList.add('visible');
      document.getElementById('aiNameEnhanced').textContent = '小绘';
      setAiSubtitle();
      document.getElementById('milestoneSlot').innerHTML = '';
      document.getElementById('fbDepthLayer').innerHTML = '';
      document.getElementById('fbLayersContainer').innerHTML = '';
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop(); // 保留不完整的 chunk

      for (const evt of events) {
        if (!evt.startsWith('data: ')) continue;
        let data;
        try { data = JSON.parse(evt.slice(6)); } catch (e) { continue; }

        if (data.type === 'first_impression') {
          // ── 首层秒出：立即显示第一印象，不用干等 ──
          // 旅程：AI 处理阶段
          if (typeof setJourneyStage === 'function') setJourneyStage(5);
          stopSimpleWaiting();
          const container = document.getElementById('feedbackEnhanced');
          container.classList.add('visible');
          document.getElementById('aiNameEnhanced').textContent = '小绘';
          setAiSubtitle();
          document.getElementById('milestoneSlot').innerHTML = '';
          document.getElementById('fbDepthLayer').innerHTML = '';
          document.getElementById('fbLayersContainer').innerHTML = `
            <div class="first-impression">
              <div class="first-impression-dots">
                <span></span><span></span><span></span>
              </div>
              <div class="first-impression-text">${data.message}</div>
            </div>`;
          containerReady = false;  // 不标记为 ready，让首个 layer 的 ensureContainerReady 清除第一印象
        } else if (data.type === 'layer') {
          // ✅ 真流式：收到 layer 立即渲染，不等其他层
          // 旅程：身份反馈阶段（第一层出现时）
          if (receivedLayers.length === 0 && typeof setJourneyStage === 'function') {
            setJourneyStage(6);
          }
          ensureContainerReady();
          receivedLayers.push(data.layer);
          renderStreamingLayer(data.layer, receivedLayers.length);
        } else if (data.type === 'complete') {
          completeData = data;
          console.log('[SSE] complete 事件收到', data.milestone ? `里程碑: ${data.milestone.number}` : '无里程碑');
        } else if (data.type === 'error') {
          stopSimpleWaiting();
          showError(data.message || '分析失败');
          return;
        }
      }
    }

    // 流结束 → 处理 complete 事件
    if (receivedLayers.length > 0) {
      try {
        if (completeData) {
          finalizeStreamingFeedback(completeData, receivedLayers);
        } else {
          // 有反馈但没收到 complete（后端可能中途故障）——降级收尾，不卡死
          console.warn('[SSE] 有 layers 但未收到 complete，降级收尾');
          stopSimpleWaiting();
          ensurePostFeedbackUI({id: 'fallback_' + Date.now()});
        }
      } catch (e) {
        console.error('finalizeStreamingFeedback error:', e);
        ensurePostFeedbackUI(completeData && completeData.record);
      }
      // 无论是否收到 complete，都刷新记录/统计/主题，让后端已保存的数据及时同步
      try { await loadStats(false); } catch (e) {}   // 上传后静默刷新，不显示欢迎回来
      try { await loadTimeline(); } catch (e) {}
      try { await loadTodayTheme(); } catch (e) {}
    } else if (completeData) {
      // 没收到 layer 但收到了 complete — 用 record 数据渲染
      stopSimpleWaiting();
      try {
        finalizeStreamingFeedback(completeData, []);
      } catch (e) {
        console.error('finalizeStreamingFeedback error:', e);
        ensurePostFeedbackUI(completeData.record);
      }
      try { await loadStats(false); } catch (e) {}   // 上传后静默刷新
      try { await loadTimeline(); } catch (e) {}
      try { await loadTodayTheme(); } catch (e) {}
    } else {
      // 没收到任何 layer 也没收到 complete
      stopSimpleWaiting();
      showError('分析超时，请重试');
      ensurePostFeedbackUI({id: 'fallback_' + Date.now()});
    }

  } catch (err) {
    stopSimpleWaiting();
    showError('网络错误，请检查服务器是否在运行');
  } finally {
    stopSimpleWaiting();
    document.getElementById('cameraInput').value = '';
    document.getElementById('uploadInput').value = '';
  }
}

// ─── 流式逐层渲染 ───
function renderStreamingLayer(layer, layerCount) {
  const LAYER_TAGS   = {identify: 'l-identify', observe: 'l-observe', progress: 'l-progress', suggestion: 'l-suggest', encourage: 'l-encourage'};
  const LAYER_LABELS = {identify: '识别', observe: '观察', progress: '进步', suggestion: '建议', encourage: '鼓励'};

  // 更新深度指示器
  const dotsHtml = Array.from({length: 5}, (_, i) =>
    `<div class="dot d${i+1} ${i < layerCount ? 'active' : ''}"></div>`
  ).join('');
  document.getElementById('fbDepthLayer').innerHTML = `
    <div class="fb-depth">
      ${dotsHtml}
      <span class="fb-depth-label">${layerCount >= 5 ? '解读完成' : '正在解读第 ' + layerCount + '/5 层'}</span>
    </div>`;

  // 提取绘画主题
  if (layer.type === 'identify' && layer.content) {
    const match = layer.content.match(/画的是(?:一个|一只|一幅)?(.+?)[对吧呢？\?]/);
    if (match && match[1]) {
      currentDrawingSubject = match[1].trim();
    }
  }

  const type = layer.type;
  const tagClass = LAYER_TAGS[type] || '';
  const label = LAYER_LABELS[type] || type;

  const div = document.createElement('div');
  div.className = 'streaming-layer';

  // 统一层级结构：layer-tag + layer-text (+ optional tip)
  let html = `<span class="layer-tag ${tagClass}">${label}</span>
    <div class="layer-text">${enrichText(layer.content)}</div>`;

  // observe / suggestion 层附带小技巧
  if ((type === 'observe' || type === 'suggestion') && layer.tip && layer.tip.trim()) {
    html += `<div class="fb-tip-box"><strong>小技巧</strong>：${enrichText(layer.tip)}</div>`;
  }

  div.innerHTML = html;

  document.getElementById('fbLayersContainer').appendChild(div);

  // 2.0 身份确认语（identify 层渲染后填入）
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

  // 2.0 时机修正：雷达图在 observe 层后滑入
  if (type === 'observe') {
    const perceptionData = layer.perception_analysis || (window._pendingFeedbackData && window._pendingFeedbackData.perception_analysis);
    const breakthroughDim = layer.breakthrough_dim || (window._pendingFeedbackData && window._pendingFeedbackData.breakthrough_dim);
    if (perceptionData && typeof renderRadarChart === 'function') {
      const radarContainer = document.getElementById('radarChartContainer');
      if (radarContainer) {
        setTimeout(() => {
          renderRadarChart(perceptionData, breakthroughDim, radarContainer);
        }, 300);
      }
    }
  }

  // 2.0 时机修正：探索进度在 encourage 层后出现
  if (type === 'encourage') {
    const explorationData = (window._pendingFeedbackData && window._pendingFeedbackData.exploration);
    if (explorationData && typeof renderExplorationBar === 'function') {
      const explorationContainer = document.getElementById('explorationBarContainer');
      if (explorationContainer) {
        setTimeout(() => {
          renderExplorationBar(explorationData, explorationContainer);
        }, 300);
      }
    }
    // 2.0 心流银行 + 档案归档
    if (window._pendingFeedbackData) {
      setTimeout(() => renderFlowBank(window._pendingFeedbackData), 600);
      // 旅程：档案归档阶段
      setTimeout(() => {
        if (typeof setJourneyStage === 'function') setJourneyStage(7);
        renderArchivePill(window._pendingFeedbackData);
      }, 900);
    }
  }

  // 第一层时滚动到反馈区顶部；后续层由 MutationObserver 自动跟随
  if (layerCount === 1) {
    setTimeout(() => {
      const container = document.getElementById('feedbackEnhanced');
      if (container) {
        const rect = container.getBoundingClientRect();
        const targetY = window.pageYOffset + rect.top - 12;
        smoothScrollTo(targetY, 700);
      }
    }, 150);
    // 启动 MutationObserver 监听后续层插入
    startFeedbackAutoScroll();
  }

  // 更新全局术语上下文
  if (layer.glossary_context) {
    currentGlossaryContext = { ...currentGlossaryContext, ...layer.glossary_context };
  }
}

// ── 锚点跟随：MutationObserver 监听反馈容器 DOM 变化 ──
let _feedbackScrollObserver = null;
let _userScrolledAway = false;

function startFeedbackAutoScroll() {
  const container = document.getElementById('fbLayersContainer');
  if (!container) return;

  // 清理旧 observer
  if (_feedbackScrollObserver) {
    _feedbackScrollObserver.disconnect();
  }
  _userScrolledAway = false;

  // 监听用户手动滚动：如果用户上滑超过 80px，暂停跟随
  let _lastScrollTop = window.pageYOffset;
  function _onUserScroll() {
    const cur = window.pageYOffset;
    if (cur < _lastScrollTop - 80) {
      _userScrolledAway = true;
    }
    _lastScrollTop = cur;
  }
  window.addEventListener('scroll', _onUserScroll, { passive: true });

  _feedbackScrollObserver = new MutationObserver(() => {
    if (_userScrolledAway) return;
    // 平滑滚动到最新内容底部
    const fbEnhanced = document.getElementById('feedbackEnhanced');
    if (!fbEnhanced) return;
    const rect = fbEnhanced.getBoundingClientRect();
    const bottom = rect.bottom;
    const winH = window.innerHeight;
    // 只在内容超出视口时滚动
    if (bottom > winH - 20) {
      const targetY = window.pageYOffset + (bottom - winH) + 24;
      window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
  });
  _feedbackScrollObserver.observe(container, {
    childList: true,
    subtree: true,
  });
}

function stopFeedbackAutoScroll() {
  if (_feedbackScrollObserver) {
    _feedbackScrollObserver.disconnect();
    _feedbackScrollObserver = null;
  }
}

// ── 安全兜底：确保反思区和操作按钮一定显示 ──
function ensurePostFeedbackUI(record) {
  if (!record) return;
  try {
    currentRecordId = record.id;
    // 操作按钮
    startActionButtonsDelay(record);
    // 反思区
    setTimeout(() => {
      const ra = document.getElementById('reflectionArea');
      if (ra) ra.classList.add('visible');
      resetReflectionUI();
      // 异步加载 AI 生成的反思快选标签
      setTimeout(() => loadReflectionTags(), 200);
    }, 1000);
  } catch (e) {
    console.error('ensurePostFeedbackUI error:', e);
  }
}

