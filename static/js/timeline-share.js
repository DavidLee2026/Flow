// renderGrowth / drawRadarChart removed in v3.0 (growth page hidden for MVP)
// ─── Modal ───
function openModal(record) {
  // 详情页全屏覆盖时隐藏底部导航（避免按钮被盖住但可见不可点）
  document.body.classList.add('detail-open');
  const modal = document.getElementById('recordDetailPage');
  document.getElementById('modalImg').src = `${API_BASE}/data/${record.image}`;
  currentRecordId = record.id;  // 保存当前记录 ID，用于删除

  // 查找记录索引（用于显示"第 N 张"）
  const recordIndex = records.findIndex(r => r.id === record.id);
  const drawingNum = recordIndex >= 0 ? records.length - recordIndex : '';

  // 对话流头部信息（照片消息副标 + 小绘对话头副标）
  const detailSub = document.getElementById('detailSub');
  if (detailSub) detailSub.textContent = drawingNum ? `第 ${drawingNum} 张画` : '画者';
  const detailHeadSub = document.getElementById('detailHeadSub');
  if (detailHeadSub) detailHeadSub.textContent = formatTime(record.timestamp);

  // 构建反馈内容 — 对话流样式（对齐反馈页），旧版按段落
  const feedbackEl = document.getElementById('modalFeedback');
  if (record.feedback_json && record.feedback_json.layers && record.feedback_json.layers.length >= 4) {
    // 反馈页对话流卡片（stream-layer / s-tag / fb-tip-box / archive-note）
    const LAYER_LABELS = {identify: '🎯 认出', observe: '🔍 观察', progress: '📈 进步', suggestion: '💡 建议', encourage: '✨ 期待'};
    let html = '';
    for (const layer of record.feedback_json.layers) {
      const type = layer.type;
      const label = LAYER_LABELS[type] || type;
      if (type === 'progress') {
        html += `<div class="stream-layer" data-type="progress"><span class="s-tag">${label}</span><div class="fb-progress-box"><span class="p-icon">📈</span><span class="p-text">${enrichText(layer.content)} 👏</span></div></div>`;
      } else {
        let h = `<div class="stream-layer" data-type="${type}"><span class="s-tag">${label}</span><div class="s-text">${enrichText(layer.content)}</div>`;
        if (type === 'identify') {
          h += `<span class="archive-note">📋 画者档案 +1</span>`;
        } else if ((type === 'observe' || type === 'suggestion') && layer.tip && layer.tip.trim()) {
          h += `<div class="fb-tip-box"><b>💡 小技巧</b>：${enrichText(layer.tip)} 💪</div>`;
        }
        h += '</div>';
        html += h;
      }
    }
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

  // 身份确认语（详情页不再单独展示）
  const identitySlot = document.getElementById('modalIdentitySlot');
  if (identitySlot) {
    identitySlot.innerHTML = '';
    identitySlot.classList.remove('visible');
  }

  // 五维雷达图（反馈页雷达卡样式，无数据用默认值兜底，不空着）
  const modalRadar = document.getElementById('modalRadarChart');
  if (modalRadar) {
    modalRadar.style.display = '';
    const perceptionData = fbData.perception_analysis || {};
    if (typeof radarCardHTML === 'function') {
      modalRadar.innerHTML = radarCardHTML(perceptionData);
    }
  }

  // 探索进度（flowfb-b 样式，无数据用默认 0 兜底，不空着）
  const modalExploration = document.getElementById('modalExplorationBar');
  if (modalExploration) {
    modalExploration.style.display = '';
    const explorationData = record.exploration || fbData.exploration || {};
    if (typeof explorationHTML === 'function') {
      modalExploration.innerHTML = explorationHTML({ explored_area_count: explorationData.explored_area_count || 0 });
    }
  }

  // 归档 / 心流（详情页已去掉，保持为空）
  const modalFlowBank = document.getElementById('modalFlowBank');
  if (modalFlowBank) modalFlowBank.innerHTML = '';
  const modalArchivePill = document.getElementById('modalArchivePill');
  if (modalArchivePill) modalArchivePill.innerHTML = '';

  // 里程碑（身份仪式 · v6c-v8d2-b 固定文案）
  const milestoneEl = document.getElementById('modalMilestone');
  if (milestoneEl) {
    milestoneEl.innerHTML = `<div class="milestone-card"><div class="milestone-icon">🏅</div><div class="milestone-text"><div class="milestone-title">画者档案 +1 · 第 1 次身份投票</div><div class="milestone-msg">你画的每一个杯子，都是画者身份的证据。归档完毕。</div></div></div>`;
    milestoneEl.style.display = 'block';
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
    } else if (typeof reflectionChatHTML === 'function') {
      // 没留下文字：用反馈页"画完想说点什么？"（选标签 / 自己写）
      reflectionEl.innerHTML = reflectionChatHTML();
      reflectionEl.style.display = 'block';
      if (typeof bindReflectionFlow === 'function') bindReflectionFlow();
    }
  }

  // "现在的你看" 区块（详情页已去掉）
  const nowReviewEl = document.getElementById('modalNowReview');
  if (nowReviewEl) { nowReviewEl.innerHTML = ''; nowReviewEl.style.display = 'none'; }

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
  document.body.classList.remove('detail-open');
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



