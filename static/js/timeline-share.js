// renderGrowth / drawRadarChart removed in v3.0 (growth page hidden for MVP)
// ─── Modal ───
function openModal(record) {
  const modal = document.getElementById('recordDetailPage');
  document.getElementById('modalImg').src = `${API_BASE}/data/${record.image}`;
  currentRecordId = record.id;  // 保存当前记录 ID，用于删除

  // 查找记录索引（用于显示"第 N 张"）
  const recordIndex = records.findIndex(r => r.id === record.id);
  const drawingNum = recordIndex >= 0 ? records.length - recordIndex : '';

  // 构建头部信息
  const headerEl = document.getElementById('modalHeader');
  if (headerEl) {
    let headerHtml = '';
    if (drawingNum) {
      headerHtml += `<span class="modal-badge">第 ${drawingNum} 张</span>`;
    }
    headerHtml += `<span class="modal-date">${formatTime(record.timestamp)}</span>`;
    headerEl.innerHTML = headerHtml;
  }

  // 构建反馈内容 — 优先使用 5 层结构，否则按段落格式化
  const feedbackEl = document.getElementById('modalFeedback');
  if (record.feedback_json && record.feedback_json.layers && record.feedback_json.layers.length >= 4) {
    // 时空穿梭风格：精致分层标签
    const LAYER_LABELS = {identify: '识别', observe: '观察', progress: '进步', suggestion: '建议', encourage: '鼓励'};
    const LAYER_COLORS = {identify: 'rec', observe: 'obs', progress: 'prog', suggestion: 'sugg', encourage: 'enc'};
    let html = '<div class="tt-ai-section">';
    html += '<div class="tt-ai-header"><span class="tt-ai-avatar">🧑‍🎨</span><span class="tt-ai-name">小绘 · 当时的反馈</span></div>';
    for (const layer of record.feedback_json.layers) {
      const type = layer.type;
      const color = LAYER_COLORS[type] || '';
      const label = LAYER_LABELS[type] || type;
      html += `<div class="tt-ai-layer"><span class="tt-ai-tag ${color}">${label}</span>${enrichText(layer.content)}</div>`;
      if (type === 'suggestion' && layer.tip && layer.tip.trim()) {
        html += `<div class="tt-ai-tip">${enrichText(layer.tip)}</div>`;
      }
    }
    html += '</div>';
    feedbackEl.innerHTML = html;
  } else {
    // 普通版：按段落格式化
    const lines = (record.feedback || '').split('\n').filter(l => l.trim());
    let html = '<div class="tt-ai-section">';
    html += '<div class="tt-ai-header"><span class="tt-ai-avatar">🧑‍🎨</span><span class="tt-ai-name">小绘 · 当时的反馈</span></div>';
    lines.forEach(line => {
      const cleanLine = line.trim().replace(/^[\d]+[)）.、:：]?\s*/, '');
      if (!cleanLine) return;
      html += `<div class="tt-ai-layer">${enrichText(cleanLine)}</div>`;
    });
    html += '</div>';
    feedbackEl.innerHTML = html || '<p style="color:var(--color-text-tertiary);">暂无反馈</p>';
  }

  // 2.0 组件渲染（记录详情弹窗）
  const fbData = record.feedback_json || record;

  // 身份确认语
  const identitySlot = document.getElementById('modalIdentitySlot');
  if (identitySlot) {
    identitySlot.innerHTML = '';
    identitySlot.classList.remove('visible');
    const identityText = fbData.identity_statement ||
      (fbData.layers?.find(l => l.type === 'identify')?.identity_statement);
    if (identityText) {
      identitySlot.innerHTML = `
        <div class="identity-statement-card">
          <div class="identity-statement-text">${enrichText(identityText)}</div>
        </div>`;
      identitySlot.classList.add('visible');
    }
  }

  // 五维雷达图
  const modalRadar = document.getElementById('modalRadarChart');
  if (modalRadar) {
    modalRadar.style.display = 'none';
    modalRadar.innerHTML = '';
    const perceptionData = fbData.perception_analysis;
    const breakthroughDim = fbData.breakthrough_dim;
    if (perceptionData && typeof renderRadarChart === 'function') {
      setTimeout(() => renderRadarChart(perceptionData, breakthroughDim, modalRadar), 200);
    }
  }

  // 探索进度
  const modalExploration = document.getElementById('modalExplorationBar');
  if (modalExploration) {
    modalExploration.style.display = 'none';
    modalExploration.innerHTML = '';
    const explorationData = record.exploration || fbData.exploration;
    if (explorationData && typeof renderExplorationBar === 'function') {
      setTimeout(() => renderExplorationBar(explorationData, modalExploration), 400);
    }
  }

  // 心流银行 + 档案归档
  const modalFlowBank = document.getElementById('modalFlowBank');
  const modalArchivePill = document.getElementById('modalArchivePill');
  if (modalFlowBank) {
    modalFlowBank.innerHTML = '';
    setTimeout(() => {
      if (typeof renderFlowBank === 'function') renderFlowBank(fbData, modalFlowBank);
    }, 600);
  }
  if (modalArchivePill) {
    modalArchivePill.innerHTML = '';
    setTimeout(() => {
      if (typeof renderArchivePill === 'function') renderArchivePill(fbData, modalArchivePill);
    }, 800);
  }

  // 里程碑（如果有）
  const milestoneEl = document.getElementById('modalMilestone');
  if (milestoneEl) {
    if (record.milestone) {
      const m = record.milestone;
      const mClass = `milestone-icon ${m.number <= 50 ? 'm' + m.number : 'm50'}`;
      const cardClass = `milestone-card ${m.number <= 50 ? 'm' + m.number : 'm50'}`;
      milestoneEl.innerHTML = `
        <div class="${cardClass}">
          <div class="${mClass}">${m.icon}</div>
          <div class="milestone-body">
            <div class="milestone-title">${escapeHtml(m.title)}</div>
            <div class="milestone-desc">${escapeHtml(m.message)}</div>
          </div>
        </div>`;
      milestoneEl.style.display = 'block';
    } else {
      milestoneEl.innerHTML = '';
      milestoneEl.style.display = 'none';
    }
  }

  // 时空穿梭：展示用户当时写下的反思文字
  const reflectionEl = document.getElementById('modalReflection');
  if (reflectionEl) {
    const reflection = getReflection(record.id);
    if (reflection && reflection.text) {
      const timeAgo = getTimeAgo(reflection.timestamp);
      reflectionEl.innerHTML = `
        <div class="modal-reflection-block">
          <div class="modal-reflection-label">✍️ 你当时写道</div>
          <div class="modal-reflection-text">${escapeHtml(reflection.text)}</div>
          <div class="modal-reflection-meta">— ${timeAgo}写下的</div>
        </div>`;
      reflectionEl.style.display = 'block';
      // 高亮脉冲动画
      reflectionEl.classList.add('pulse-highlight');
      setTimeout(() => reflectionEl.classList.remove('pulse-highlight'), 2000);
    } else {
      // 空态：引导用户下次写感受
      reflectionEl.innerHTML = `
        <div class="modal-reflection-empty">
          <div class="modal-reflection-empty-text">那天你没有留下文字</div>
          <div class="modal-reflection-empty-hint">下次画完试试写两句？</div>
        </div>`;
      reflectionEl.style.display = 'block';
    }
  }

  // "现在的你看" 区块 — AI 回顾性对比
  const nowReviewEl = document.getElementById('modalNowReview');
  if (nowReviewEl) {
    const recordIndex = records.findIndex(r => r.id === record.id);
    const totalDrawings = records.length;
    const drawingNum = recordIndex >= 0 ? records.length - recordIndex : 1;
    const timeAgo = getTimeAgo(record.timestamp);

    // 生成回顾性文字
    let reviewText = '';
    if (drawingNum === 1) {
      reviewText = `这是你的第一张画。一切的起点，都从这一笔开始。`;
    } else if (drawingNum < 7) {
      reviewText = `这是你第 ${drawingNum} 张画。${timeAgo}你还在摸索，现在你已经画了 ${totalDrawings} 张了。`;
    } else if (drawingNum < 30) {
      reviewText = `这是你第 ${drawingNum} 张画。${timeAgo}画下的这一笔，是你成长路上的一块基石。到现在你已经画了 ${totalDrawings} 张。`;
    } else {
      reviewText = `这是你第 ${drawingNum} 张画。回看${timeAgo}的这幅画，你能看到自己走过的路。${totalDrawings} 张画，每一张都算数。`;
    }

    nowReviewEl.innerHTML = `
      <div class="modal-now-review-block">
        <div class="modal-now-review-label">🕰️ 现在的你看</div>
        <div class="modal-now-review-text">${escapeHtml(reviewText)}</div>
      </div>`;
    nowReviewEl.style.display = 'block';
  }

  modal.classList.add('visible');
  // 禁止底层页面滚动，防止穿透
  document.body.style.overflow = 'hidden';

  // 记录详情滚动收缩：用户向下滑动文字区时，图片缩小到 3:7 比例
  const modalInfo = modal.querySelector('.modal-info');
  if (modalInfo) {
    modalInfo.scrollTop = 0;
    modalInfo.style.overscrollBehavior = 'contain';
    const handleModalScroll = () => {
      if (modalInfo.scrollTop > 30) {
        modal.querySelector('.modal').classList.add('img-collapsed');
      } else {
        modal.querySelector('.modal').classList.remove('img-collapsed');
      }
    };
    modalInfo.addEventListener('scroll', handleModalScroll, { passive: true });
    // 存储引用以便关闭时移除
    modal._scrollHandler = handleModalScroll;
    modal._scrollTarget = modalInfo;
  }
}

function closeModal() {
  const modal = document.getElementById('recordDetailPage');
  // 移除滚动监听
  if (modal._scrollHandler && modal._scrollTarget) {
    modal._scrollTarget.removeEventListener('scroll', modal._scrollHandler);
    modal._scrollHandler = null;
    modal._scrollTarget = null;
  }
  // 重置图片收缩状态
  const modalInner = modal.querySelector('.modal');
  if (modalInner) modalInner.classList.remove('img-collapsed');
  modal.classList.remove('visible');
  // 恢复底层页面滚动
  document.body.style.overflow = '';
}

function confirmDeleteRecord() {
  if (!currentRecordId) return;
  showConfirm({
    icon: '🗑️',
    title: '删除画作',
    desc: '删除后无法恢复，确定要删除这张画吗？',
    okText: '删除',
    okClass: 'btn-danger',
    onOk: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/record/${currentRecordId}`, { method: 'DELETE' });
        const data = await res.json();
        if (data.ok) {
          showToast('已删除', 'success');
          closeModal();
          await loadTimeline();
          await loadStats(false);
        } else {
          showToast(data.error || '删除失败', 'error');
        }
      } catch (e) {
        showToast('网络错误', 'error');
      }
    }
  });
}

// ── 记录详情已是独立全屏页（非弹窗），不需要点击遮罩关闭 ──
// 返回通过顶部栏「‹ 返回」按钮（onclick="closeModal()"）完成

function formatTime(ts) {
  try {
    const d = new Date(ts);
    return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch(e) {
    return ts;
  }
}

// ─── 保存照片 ───
function savePhoto() {
  const photoSrc = document.getElementById('submittedPhotoImg').src;
  if (!photoSrc) {
    showError('没有可保存的照片');
    return;
  }
  const link = document.createElement('a');
  link.download = `绘心-${new Date().toISOString().slice(0,10)}.jpg`;
  link.href = photoSrc;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => { document.body.removeChild(link); }, 1000);
}

// ─── Share Image ───
async function generateShareImage() {
  if (records.length < 1) return;

  const canvas = document.getElementById('shareCanvas');
  const ctx = canvas.getContext('2d');

  const W = 800, H = 1000;
  canvas.width = W;
  canvas.height = H;

  const loadImg = async (url) => {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = no;
      img.src = URL.createObjectURL(blob);
    });
  };

  const firstUrl = `${API_BASE}/data/${records[records.length - 1].image}`;
  const lastUrl = `${API_BASE}/data/${records[0].image}`;

  try {
    const [firstImg, lastImg] = await Promise.all([loadImg(firstUrl), loadImg(lastUrl)]);

    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#faf8f5');
    grad.addColorStop(1, '#efeae2');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#2c2c2c';
    ctx.font = 'bold 36px -apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✏️ 绘心 Flow', W / 2, 60);

    const streakEl = document.getElementById('streakBadge');
    ctx.font = '18px -apple-system,sans-serif';
    ctx.fillStyle = '#5b7a6e';
    ctx.fillText(streakEl.textContent || `共 ${records.length} 张画作`, W / 2, 92);

    ctx.strokeStyle = '#ddd7ce';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 112);
    ctx.lineTo(W - 40, 112);
    ctx.stroke();

    const imgW = 340, imgH = 340;
    const gapX = 40;
    const topY = 140;

    ctx.font = 'bold 20px -apple-system,sans-serif';
    ctx.fillStyle = '#8a8a8a';
    ctx.textAlign = 'center';
    ctx.fillText('🎬 第 1 天', gapX + imgW / 2, topY - 12);

    ctx.save();
    ctx.beginPath();
    ctx.rect(gapX, topY, imgW, imgH);
    ctx.clip();
    ctx.drawImage(firstImg, gapX, topY, imgW, imgH);
    ctx.restore();

    ctx.strokeStyle = '#ddd7ce';
    ctx.lineWidth = 1;
    ctx.strokeRect(gapX, topY, imgW, imgH);

    ctx.font = '40px -apple-system,sans-serif';
    ctx.fillStyle = '#bbb';
    ctx.textAlign = 'center';
    ctx.fillText('→', W / 2, topY + imgH / 2 + 14);

    const lastLabel = records.length > 1 ? `🎨 第 ${records.length} 天` : '🎨 今天';
    ctx.font = 'bold 20px -apple-system,sans-serif';
    ctx.fillStyle = '#5b7a6e';
    ctx.textAlign = 'center';
    ctx.fillText(lastLabel, W - gapX - imgW / 2, topY - 12);

    const lastX = W - gapX - imgW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(lastX, topY, imgW, imgH);
    ctx.clip();
    ctx.drawImage(lastImg, lastX, topY, imgW, imgH);
    ctx.restore();

    ctx.strokeStyle = '#5b7a6e';
    ctx.lineWidth = 2;
    ctx.strokeRect(lastX, topY, imgW, imgH);

    ctx.font = '14px -apple-system,sans-serif';
    ctx.fillStyle = '#9a9a9a';
    ctx.textAlign = 'center';
    ctx.fillText('手机 + 纸 + 笔 + AI 陪伴 · 每天画一点', W / 2, H - 60);

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `绘心-第${records.length}天.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 1000);
    }, 'image/png');

  } catch (e) {
    showError('生成分享图失败，图片加载出错');
  }
}



