// ─── journey.js · 7 阶段用户旅程可视化 ──────────────
// 依赖：无（纯 DOM 操作）
// 被调用方：feedback.js / camera.js / home.js
// ──────────────────────────────────────────────────────

/**
 * 7 阶段定义：
 * 1. 入口仪式 — 首页加载
 * 2. 静默创作 — 用户画画中（相机打开/相册选择）
 * 3. 拍照上传 — 照片已拍/已选
 * 4. 绘画重现 — SVG 逐笔重现动画
 * 5. AI 处理 — SSE 流开始（first_impression / layer）
 * 6. 身份反馈 — 第一层反馈出现
 * 7. 档案归档 — 归档 pill 渲染
 */

const JOURNEY_STAGES = [
  { num: 1, label: '入口' },
  { num: 2, label: '创作' },
  { num: 3, label: '拍照' },
  { num: 4, label: '重现' },
  { num: 5, label: 'AI' },
  { num: 6, label: '反馈' },
  { num: 7, label: '归档' },
];

let _journeyCurrentStage = 0;

/**
 * 显示旅程指示器
 */
function showJourney() {
  const el = document.getElementById('journeyIndicator');
  if (!el) return;
  el.style.display = 'flex';
  el.classList.add('entering');
  setTimeout(() => el.classList.remove('entering'), 500);
}

/**
 * 隐藏旅程指示器
 */
function hideJourney() {
  const el = document.getElementById('journeyIndicator');
  if (!el) return;
  el.style.display = 'none';
  _journeyCurrentStage = 0;
}

/**
 * 设置当前阶段（之前的阶段自动标记为完成）
 * @param {number} stage - 1~7
 */
function setJourneyStage(stage) {
  const el = document.getElementById('journeyIndicator');
  if (!el) return;
  if (stage < 1 || stage > 7) return;
  _journeyCurrentStage = stage;

  el.querySelectorAll('.journey-step').forEach(stepEl => {
    const s = parseInt(stepEl.dataset.stage);
    stepEl.classList.remove('active', 'done');
    if (s < stage) {
      stepEl.classList.add('done');
    } else if (s === stage) {
      stepEl.classList.add('active');
    }
  });

  // 滚动当前阶段到可视区域
  const activeStep = el.querySelector('.journey-step.active');
  if (activeStep) {
    try {
      activeStep.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } catch(e) {}
  }
}

/**
 * 获取当前阶段
 */
function getJourneyStage() {
  return _journeyCurrentStage;
}
