// ─── feedback-upload.js · 上传 + SSE + flowfb-b 对话流反馈 ───
// ═══ 反馈全屏 view（设计版式 B 对话流） ═══
let currentTotalDrawings = 1;

function showFeedbackPage(file) {
  currentTotalDrawings = (window.records ? records.length : 0) + 1;
  const page = document.getElementById('feedbackPage');
  if (!page) return;
  if (file) {
    const r = new FileReader();
    r.onload = e => { document.getElementById('fbPhotoImg').src = e.target.result; };
    r.readAsDataURL(file);
  }
  const subEl = document.getElementById('fbHeadSub');
  if (subEl) subEl.textContent = `用户第 ${currentTotalDrawings} 张画 · 画者身份确认`;
  // 反馈页右上角天数（与首页 hd-day 一致）
  const hdDay = document.getElementById('fbHdDay');
  if (hdDay) hdDay.textContent = `画者 · 第 ${currentTotalDrawings} 天`;
  const statusEl = document.getElementById('fbHeadStatus');
  if (statusEl) statusEl.innerHTML = '<span class="dot"></span>正在看你的画';
  // 照片状态文字：反馈页重构后为 .fb-photo-status（class），旧 id fbPhotoMeta 已移除
  const photoMeta = document.querySelector('.fb-photo-status');
  if (photoMeta) photoMeta.textContent = '你拍的画 · 已发送';
  document.getElementById('fbLayersContainer').innerHTML = '';      // 清空对话流
  document.getElementById('fbChatActions').style.display = 'none';  // 隐藏按钮
  document.getElementById('feedbackEnhanced').classList.add('visible'); // 立即显示反馈容器
  page.classList.add('visible');
  document.body.style.overflow = 'hidden';
  setTimeout(scrollChatBottom, 60);
}
function closeFeedbackPage() {
  const page = document.getElementById('feedbackPage');
  if (page) page.classList.remove('visible');
  document.body.style.overflow = '';
}
function scrollChatBottom() {
  const s = document.getElementById('feedbackPage');
  if (s) s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' });
}
async function botSay(html) {
  const box = document.getElementById('fbLayersContainer');
  if (!box) return;
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  wrap.innerHTML = '<div class="msg-body"><div class="typing"><span></span><span></span><span></span></div></div>';
  box.appendChild(wrap);
  scrollChatBottom();
  await new Promise(r => setTimeout(r, 1100));
  wrap.querySelector('.msg-body').innerHTML = '<div class="msg-bubble">' + html + '</div>';
  wrap.classList.add('done');
  scrollChatBottom();
}
function buildReconstructBlock() {
  const div = document.createElement('div');
  div.className = 'reconstruct chat-recon show';
  div.innerHTML = '<div class="reconstruct-canvas"><div id="replayContainer" class="replay-container"></div></div>' +
    '<div class="reconstruct-label">绘画重现中…</div>';
  return div;
}
function fbReplay()  { closeFeedbackPage(); openCamera(); }
function fbProfile() { closeFeedbackPage(); switchTab('ach'); }
function fbShare()   { showToast('分享功能暂未开放，敬请期待 🎨'); }
function clearFeedbackContainers() {
  ['fbLayersContainer','radarChartContainer','explorationBarContainer','flowBankSlot','archivePillSlot','milestoneSlot'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
  ['radarChartContainer','explorationBarContainer'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.style.display = 'none'; el.classList.remove('visible'); }
  });
}

// ─── Upload → Analyze（SSE）───
// source: 'camera' 拍照 / 'gallery' 选照片（区分反馈页顶部文案）
async function uploadImage(file, source) {
  const isCamera = source === 'camera';
  showFeedbackPage(file);
  // 用户消息文案区分：画者拍下 / 画者选择
  const sub = document.querySelector('#fbMsgPhoto .msg-user-sub');
  if (sub) sub.textContent = isCamera ? '画者拍下这张画' : '画者选择了这张画';
  stopFeedbackAutoScroll();
  clearFeedbackContainers();
  // 客户端压缩
  const compressedFile = await compressImage(file);
  // ═══ flowfb-b：收到消息 → 5层（重现块暂隐藏，后续再设计展示） ═══
  await botSay('收到！我收到你的画了，正在仔细看…');
  // SSE 5层
  const formData = new FormData();
  formData.append('image', compressedFile);
  const themeTitle = document.getElementById('themeTodayTitle')?.textContent || '';
  if (themeTitle) formData.append('theme', themeTitle);
  try {
    const response = await fetch(`${API_BASE}/api/analyze/stream`, { method: 'POST', body: formData });
    if (!response.ok) {
      const d = await response.json().catch(() => ({}));
      showError(d.error || '分析失败，请重试');
      return;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', receivedLayers = [], completeData = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop();
      for (const evt of events) {
        if (!evt.startsWith('data: ')) continue;
        let data;
        try { data = JSON.parse(evt.slice(6)); } catch (e) { continue; }
        if (data.type === 'layer') {
          receivedLayers.push(data.layer);
          renderStreamingLayer(data.layer, receivedLayers.length);
        } else if (data.type === 'complete') {
          completeData = data;
        } else if (data.type === 'error') {
          showError(data.message || '分析失败');
          return;
        }
      }
    }
    // complete 后组件流
    if (completeData) finalizeStreamingFeedback(completeData, receivedLayers);
    else ensurePostFeedbackUI({ id: 'fallback_' + Date.now() });
    // 刷新数据
    try { await loadStats(false); } catch (e) {}
    try { await loadTimeline(); } catch (e) {}
    try { await loadTodayTheme(); } catch (e) {}
  } catch (err) {
    showError('网络错误，请检查服务器是否在运行');
    ensurePostFeedbackUI({ id: 'fallback_' + Date.now() });
  } finally {
    document.getElementById('cameraInput').value = '';
    document.getElementById('uploadInput').value = '';
  }
}

// ─── 流式逐层渲染（flowfb-b 5层卡片） ───
function renderStreamingLayer(layer, layerCount) {
  const DESIGN_LABELS = { identify: '🎯 认出', observe: '🔍 观察', progress: '📈 进步', suggestion: '💡 建议', encourage: '✨ 期待' };
  if (layer.type === 'identify' && layer.content) {
    const match = layer.content.match(/画的是(?:一个|一只|一幅)?(.+?)[对吧呢？\?]/);
    if (match && match[1]) currentDrawingSubject = match[1].trim();
  }
  const type = layer.type;
  const label = DESIGN_LABELS[type] || type;
  const div = document.createElement('div');
  div.className = 'stream-layer';
  div.dataset.type = type;
  let html;
  if (type === 'progress') {
    html = `<span class="s-tag">${label}</span><div class="fb-progress-box"><span class="p-icon">📈</span><span class="p-text">${enrichText(layer.content)} 👏</span></div>`;
  } else if (type === 'identify') {
    html = `<span class="s-tag">${label}</span><div class="s-text">${enrichText(layer.content)} 👀</div><span class="archive-note">📋 画者档案 +1 · 第 ${currentTotalDrawings} 次身份投票</span>`;
  } else if (type === 'observe' || type === 'suggestion') {
    let h = `<span class="s-tag">${label}</span><div class="s-text">${enrichText(layer.content)}</div>`;
    if (layer.tip && layer.tip.trim()) h += `<div class="fb-tip-box"><b>💡 小技巧</b>：${enrichText(layer.tip)} 💪</div>`;
    html = h;
  } else {
    html = `<span class="s-tag">${label}</span><div class="s-text">${enrichText(layer.content)} 🎉👍</div>`;
  }
  div.innerHTML = html;
  document.getElementById('fbLayersContainer').appendChild(div);
  requestAnimationFrame(() => div.classList.add('show'));
  scrollChatBottom();
  if (layerCount === 1) startFeedbackAutoScroll();
  if (layer.glossary_context) currentGlossaryContext = { ...currentGlossaryContext, ...layer.glossary_context };
}

// ── 锚点跟随：MutationObserver 监听反馈容器 DOM 变化 ──
let _feedbackScrollObserver = null;
let _userScrolledAway = false;
function startFeedbackAutoScroll() {
  const container = document.getElementById('fbLayersContainer');
  if (!container) return;
  const scroller = document.getElementById('feedbackPage');
  if (!scroller) return;
  if (_feedbackScrollObserver) _feedbackScrollObserver.disconnect();
  _userScrolledAway = false;
  let _lastScrollTop = scroller.scrollTop;
  function _onUserScroll() {
    const cur = scroller.scrollTop;
    if (cur < _lastScrollTop - 80) _userScrolledAway = true;
    _lastScrollTop = cur;
  }
  scroller.addEventListener('scroll', _onUserScroll, { passive: true });
  _feedbackScrollObserver = new MutationObserver(() => {
    if (_userScrolledAway) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
  });
  _feedbackScrollObserver.observe(container, { childList: true, subtree: true });
}
function stopFeedbackAutoScroll() {
  if (_feedbackScrollObserver) {
    _feedbackScrollObserver.disconnect();
    _feedbackScrollObserver = null;
  }
}

// ── 安全兜底 ──
function ensurePostFeedbackUI(record) {
  if (!record) return;
  currentRecordId = record.id;
  const acts = document.getElementById('fbChatActions');
  if (acts) acts.style.display = 'flex';
}
