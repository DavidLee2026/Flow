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

  // ═══ 详情页对话流渲染（干净重写） ═══
  const fbData = record.feedback_json || record;

  // 小绘对话头副标（时间）
  const detailHeadSub = document.getElementById('detailHeadSub');
  if (detailHeadSub) detailHeadSub.textContent = formatTime(record.timestamp);

  // 1. 5 层反馈（stream-layer 对话流卡片）
  const feedbackEl = document.getElementById('modalFeedback');
  const LAYER_LABELS = {identify: '🎯 认出', observe: '🔍 观察', progress: '📈 进步', suggestion: '💡 建议', encourage: '✨ 期待'};
  let fbHtml = '';
  const fbLayers = (record.feedback_json && record.feedback_json.layers) || [];
  for (const layer of fbLayers) {
    const type = layer.type;
    const label = LAYER_LABELS[type] || type;
    if (type === 'progress') {
      fbHtml += `<div class="stream-layer" data-type="progress"><span class="s-tag">${label}</span><div class="fb-progress-box"><span class="p-icon">📈</span><span class="p-text">${enrichText(layer.content)} 👏</span></div></div>`;
    } else {
      let h = `<div class="stream-layer" data-type="${type}"><span class="s-tag">${label}</span><div class="s-text">${enrichText(layer.content)}</div>`;
      if (type === 'identify') h += `<span class="archive-note">📋 画者档案 +1</span>`;
      else if ((type === 'observe' || type === 'suggestion') && layer.tip && layer.tip.trim()) h += `<div class="fb-tip-box"><b>💡 小技巧</b>：${enrichText(layer.tip)} 💪</div>`;
      h += '</div>';
      fbHtml += h;
    }
  }
  if (!fbHtml && record.feedback) {
    fbHtml = record.feedback.split('\n').filter(l => l.trim()).map(l =>
      `<div class="stream-layer"><div class="s-text">${enrichText(l.trim().replace(/^[\d]+[)）.、:：]?\s*/, ''))}</div></div>`).join('');
  }
  feedbackEl.innerHTML = fbHtml || '<div class="stream-layer"><div class="s-text">暂无反馈</div></div>';

  // 探索/雷达/里程碑/反思等 slot 暂清空（David 先看基础详情页：照片 + 5层 + 删除）
  ['modalExplorationBar','modalRadarChart','modalMilestone','modalIdentitySlot','modalFlowBank','modalArchivePill','modalNowReview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = ''; el.style.display = 'none'; }
  });

  // 反思区（用户对自己说的 + 小绘回应）——有则显示
  const reflEl = document.getElementById('modalReflection');
  if (reflEl) {
    const renderRefl = (refl) => {
      if (refl && (refl.text || refl.reply)) {
        reflEl.style.display = '';
        // 还原反馈页反思的对话气泡结构（chat-meta + chat-bubble）
        reflEl.innerHTML = `
          <div class="detail-reflection">
            <div class="detail-refl-title">💭 我对自己说</div>
            <div class="reflection-response">
              <div class="chat-meta user">你</div>
              <div class="chat-bubble chat-user">${escapeHtml(refl.text || '')}</div>
              <div class="chat-meta ai">小绘</div>
              <div class="chat-bubble chat-ai">${escapeHtml(refl.reply || '')}</div>
            </div>
          </div>`;
      } else {
        reflEl.innerHTML = ''; reflEl.style.display = 'none';
      }
    };
    // 内存数据可能是画完时加载的（无反思），反思保存在后 → 从后端拉最新记录
    const refl = record.reflection;
    if (refl && (refl.text || refl.reply)) {
      renderRefl(refl);
    } else if (record.id) {
      fetch(`${API_BASE}/api/timeline`).then(r => r.json()).then(d => {
        const latest = (d.records || []).find(r => r.id === record.id);
        renderRefl(latest && latest.reflection);
      }).catch(() => renderRefl(null));
    } else {
      renderRefl(null);
    }
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



