// ─── radar-chart.js · 2.0 五维感知雷达图 ───
// 基于 Betty Edwards 五维感知理论
// 依赖：无外部库，纯 SVG 渲染
// 设计系统：复用"温纸手记"色系（--raw-ochre-* 金色系）

/**
 * 渲染五维感知雷达图
 * @param {Object} perceptionAnalysis - { edge, space, proportion, light, whole } 1-10 分
 * @param {String} breakthroughDim - 突破维度 key (edge/space/proportion/light/whole)
 * @param {HTMLElement} container - 容器 DOM 元素
 */
function renderRadarChart(perceptionAnalysis, breakthroughDim, container) {
  if (!container || !perceptionAnalysis) return;

  const dims = [
    { key: 'edge',       label: '边缘', en: 'Edge' },
    { key: 'space',      label: '空间', en: 'Space' },
    { key: 'proportion', label: '比例', en: 'Proportion' },
    { key: 'light',      label: '光影', en: 'Light' },
    { key: 'whole',      label: '整体', en: 'Whole' },
  ];

  const size = 260;
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = 88;
  const levels = 5; // 5 层同心五边形

  // 计算各维度坐标点
  function getPoint(angle, radius) {
    return {
      x: cx + radius * Math.cos(angle - Math.PI / 2),
      y: cy + radius * Math.sin(angle - Math.PI / 2),
    };
  }

  // 5 个轴的角度（72 度间隔）
  const angles = dims.map((_, i) => (i * 2 * Math.PI) / 5);

  // 构建网格层（同心五边形）
  let gridSvg = '';
  for (let lv = 1; lv <= levels; lv++) {
    const r = (maxRadius * lv) / levels;
    const points = angles.map(a => {
      const p = getPoint(a, r);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
    gridSvg += `<polygon points="${points}" class="radar-grid-poly" data-level="${lv}"/>`;
  }

  // 构建轴线
  let axesSvg = '';
  dims.forEach((dim, i) => {
    const p = getPoint(angles[i], maxRadius);
    const isBreakthrough = dim.key === breakthroughDim;
    axesSvg += `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="radar-axis${isBreakthrough ? ' radar-axis-breakthrough' : ''}"/>`;
  });

  // 构建数据多边形
  const dataPoints = dims.map((dim, i) => {
    const score = perceptionAnalysis[dim.key] || 0;
    const r = (maxRadius * Math.max(0, Math.min(10, score))) / 10;
    return getPoint(angles[i], r);
  });
  const dataPolygon = dataPoints.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // 构建数据点圆点（突破维度用 SVG animate 做脉冲动画）
  let dataDotsSvg = '';
  dataPoints.forEach((p, i) => {
    const dim = dims[i];
    const isBreakthrough = dim.key === breakthroughDim;
    const cls = `radar-data-dot${isBreakthrough ? ' radar-dot-breakthrough' : ''}`;
    if (isBreakthrough) {
      dataDotsSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5" class="${cls}">` +
        `<animate attributeName="r" values="5;7.5;5" dur="1.5s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="1;0.7;1" dur="1.5s" repeatCount="indefinite"/>` +
        `</circle>`;
    } else {
      dataDotsSvg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" class="${cls}"/>`;
    }
  });

  // 中心点
  const centerSvg = `<circle cx="${cx}" cy="${cy}" r="2.5" class="radar-center-dot"/>`;

  // 构建右侧五维列表
  let labelsHtml = '';
  dims.forEach((dim) => {
    const isBreakthrough = dim.key === breakthroughDim;
    const score = perceptionAnalysis[dim.key] || 0;
    const rowCls = isBreakthrough ? 'radar-label-row highlight' : 'radar-label-row';
    const nameText = dim.label + '感知' + (isBreakthrough ? ' ★' : '');
    labelsHtml += `<div class="${rowCls}"><span class="name">${nameText}</span><span class="val">${score}</span></div>`;
  });

  const breakthroughLabel = dims.find(d => d.key === breakthroughDim)?.label || '';

  // 组装完整结构（水平布局：左侧雷达图 + 右侧五维列表）
  container.innerHTML = `
    <div class="radar-chart-wrapper">
      <div class="radar-chart-title">
        <span class="radar-icon">🎯</span>
        <span>五维感知评估</span>
        <span class="radar-subtitle">AI 观察到了什么（非评分）</span>
      </div>
      <div class="radar-wrap">
        <svg viewBox="0 0 ${size} ${size}" class="radar-svg" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="radarFill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#D9A441" stop-opacity="0.35"/>
              <stop offset="100%" stop-color="#D9A441" stop-opacity="0.15"/>
            </radialGradient>
            <filter id="breakthroughGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          ${gridSvg}
          ${axesSvg}
          <polygon points="${dataPolygon}" class="radar-data-poly" style="opacity:0; animation: radarFadeIn 600ms 200ms var(--ease-out) forwards;"/>
          ${dataDotsSvg}
          ${centerSvg}
        </svg>
        <div class="radar-labels">
          ${labelsHtml}
        </div>
      </div>
      ${breakthroughDim ? `
        <div class="radar-breakthrough-hint">
          ✨ 本次突破：<strong>${breakthroughLabel}感知</strong>
        </div>` : ''}
    </div>
  `;

  container.style.display = 'block';
  // 触发淡入动画
  requestAnimationFrame(() => {
    container.classList.add('visible');
  });
}
