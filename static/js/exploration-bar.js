// ─── exploration-bar.js · 2.0 探索进度（探索累积） ───
// 累积式横条，每次完成画作 +1，永不扣分
// 首次探索新方向时展示成就提示
// 设计系统：金色填充 --raw-ochre-500: #D9A441

/**
 * 渲染探索进度条
 * @param {Object} explorationData - { progress, area, is_first_exploration, explored_area_count, area_description }
 * @param {HTMLElement} container - 容器 DOM 元素
 */
function renderExplorationBar(explorationData, container) {
  if (!container || !explorationData) return;

  const progress = explorationData.progress || 0;
  const area = explorationData.area || '其他';
  const isFirst = explorationData.is_first_exploration || false;
  const areaCount = explorationData.explored_area_count || 0;
  const areaDesc = explorationData.area_description || '';

  // 进度条宽度（每 5 个进度填满一格，最多 100%）
  const fillPercent = Math.min(100, (progress % 5) * 20 + (progress >= 5 ? 100 : 0));
  // 更简洁：用方向数来填充，每探索一个新方向填一格
  const directionPercent = Math.min(100, areaCount * 12.5); // 8 个方向 = 100%

  container.innerHTML = `
    <div class="exploration-bar-wrapper">
      <div class="exploration-bar-header">
        <span class="exploration-bar-title">🧭 探索进度</span>
        <span class="exploration-bar-value">已探索 <span class="exploration-bar-num">${areaCount}</span> 个方向</span>
      </div>
      <div class="exploration-bar-track">
        <div class="exploration-bar-fill" style="width:0%;">
          <div class="exploration-bar-shine"></div>
        </div>
      </div>
      <div class="exploration-bar-labels">
        <span>1</span><span>3</span><span>5</span><span>7</span><span>9+</span>
      </div>
      <div class="exploration-bar-info">
        <span class="exploration-bar-area">本次方向：${escapeHtml(area)}</span>
        ${isFirst ? `<span class="exploration-bar-first">🎉 首次探索！</span>` : ''}
      </div>
      ${isFirst && areaDesc ? `<div class="exploration-bar-achievement">${escapeHtml(areaDesc)}</div>` : ''}
    </div>
  `;

  container.style.display = 'block';
  requestAnimationFrame(() => {
    container.classList.add('visible');

    const fill = container.querySelector('.exploration-bar-fill');
    if (!fill) return;

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    (async () => {
      // 填充动画
      fill.style.transition = 'width 800ms cubic-bezier(0.16, 1, 0.3, 1)';
      fill.style.width = directionPercent + '%';

      if (isFirst) {
        // 首次探索：闪烁 + 成就动画
        await sleep(850);
        fill.classList.add('flash-up');
        await sleep(600);
        fill.classList.remove('flash-up');
      }
    })();
  });
}

/**
 * 渲染首页底部探索进度（静态展示，无变化动画）
 * @param {number} areaCount - 已探索方向数
 * @param {HTMLElement} container - 容器 DOM 元素
 */
function renderHomeExplorationBar(areaCount, container) {
  if (!container) return;
  const count = Math.max(0, areaCount || 0);
  const percent = Math.min(100, count * 12.5);
  container.innerHTML = `
    <div class="home-exploration-bar">
      <div class="home-exploration-bar-info">
        <span class="home-exploration-bar-label">🧭 探索进度</span>
        <button class="home-exploration-bar-help" onclick="showExplorationBarExplain(event)" aria-label="什么是探索进度">?</button>
        <span class="home-exploration-bar-value">已探索 ${count} 个方向</span>
      </div>
      <div class="home-exploration-bar-track">
        <div class="home-exploration-bar-fill" style="width:${percent}%;"></div>
      </div>
    </div>
  `;
  container.style.display = 'block';
}

/**
 * 探索进度解释弹窗（用"探索地图"类比）
 */
function showExplorationBarExplain(e) {
  if (e) e.stopPropagation();
  if (typeof showConfirm === 'function') {
    showConfirm({
      icon: '🧭',
      title: '什么是探索进度？',
      desc: '每次完成画作，你的探索进度 +1，永不扣分。\n\n画杯子 → 点亮「静物」方向\n画猫狗 → 点亮「动物」方向\n画风景 → 点亮「风景」方向\n\n你探索的方向越多，你的绘画世界地图就越丰富。每一个方向都是你独一无二的创作图谱节点。',
      okText: '明白了',
      okClass: 'btn-primary',
    });
  }
}
