// replay/replay.js · 绘画重现动画主入口（从 replay.js 拆分）
// 依赖：skeleton.js（骨架化）+ effects.js（效果），按顺序加载

// ─── replay.js · 绘画重现动画模块 (2.0 仪式感增强版) ───
// 依赖：无（纯JS骨架化，已移除 ImageTracer 依赖）
// 功能：拍照后→灰度预处理→Zhang-Suen骨架化→中心线追踪→SVG逐笔动画→仪式感收尾→SSE反馈
// 仪式感：金色渐变笔尖(3层光晕) + 金色渐变描边 + 笔尖呼吸 + 路径完成闪烁
//         + 进度文字标签 + 完成脉冲圆 + 完成径向光晕 + WOW徽章 + 身份确认语
// ─────────────────────────────────────────────────────────────

/**
 * 全局状态
 */
let replayInProgress = false;
let replayTimeoutIds = [];
let replayToken = 0;       // 每次 play 自增，用于取消在途的 rAF/动画
let replayBreathRafId = 0; // 笔尖呼吸循环的 rAF id

/**
 * SVG 命名空间
 */
var SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 金色渐变三色（ochre → clay → sage）
 */
var GOLD_OCHRE = '#D9A441';
var GOLD_CLAY = '#C97D5B';
var GOLD_SAGE = '#7B9B6E';

/* ── 缓动函数 ── */
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * 主入口：播放绘画重现动画
 * 在 uploadImage() 的 SSE 请求之前调用
 *
 * @param {string} imageDataUrl - 图片的 data URL 或 URL
 * @param {function} onComplete - 动画完成后的回调（无论成功或跳过都会调用）
 * @param {object} [opts] - 可选配置
 */
function playDrawingReplay(imageDataUrl, onComplete, opts) {
  opts = opts || {};

  // 防止重复播放
  if (replayInProgress) {
    console.warn('[replay] 动画进行中，跳过');
    if (onComplete) onComplete();
    return;
  }

  // 单次回调保护：无论 safety 超时还是正常结束，onComplete 只调用一次
  var called = false;
  function doneOnce() {
    if (called) return;
    called = true;
    if (onComplete) onComplete();
  }

  // 超时保护：8秒后无论如何都回调
  var timeoutMs = opts.timeout || 8000;
  var safetyTimeout = setTimeout(function () {
    console.warn('[replay] 超时降级，跳过动画');
    var c = document.getElementById('replayContainer');
    if (c) c.classList.remove('active');
    _cleanupReplay();
    doneOnce();
  }, timeoutMs);
  replayTimeoutIds.push(safetyTimeout);

  replayInProgress = true;
  var myToken = ++replayToken;

  // 显示重现容器
  var container = document.getElementById('replayContainer');
  if (!container) {
    console.warn('[replay] replayContainer 不存在，跳过');
    _cleanupReplay();
    doneOnce();
    return;
  }
  container.classList.add('active');
  container.innerHTML =
    '<span class="replay-wow-tag" id="replayWowTag">WOW</span>' +
    '<div class="replay-header">' +
      '<span class="replay-icon">✨</span>' +
      '<span class="replay-title">你的画正在重现...</span>' +
    '</div>' +
    '<div class="replay-canvas-wrap">' +
      '<svg class="replay-svg" id="replaySvg" xmlns="http://www.w3.org/2000/svg"></svg>' +
      '<div class="replay-completion-glow" id="replayCompletionGlow"></div>' +
    '</div>' +
    '<div class="replay-progress">' +
      '<div class="replay-progress-bar" id="replayProgressBar"></div>' +
    '</div>' +
    '<div class="replay-label" id="replayLabel">正在重现...</div>' +
    '<div class="replay-identity-text" id="replayIdentityText">这是你画的。</div>';

  // 滚动到重现区域
  var scrollId = setTimeout(function () {
    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
  replayTimeoutIds.push(scrollId);

  // 加载图片
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function () {
    try {
      _processAndAnimate(img, container, myToken, doneOnce);
    } catch (e) {
      console.error('[replay] 处理失败:', e);
      container.classList.remove('active');
      _cleanupReplay();
      doneOnce();
    }
  };
  img.onerror = function () {
    console.error('[replay] 图片加载失败');
    container.classList.remove('active');
    _cleanupReplay();
    doneOnce();
  };
  img.src = imageDataUrl;
}

// ════════════════════════════════════════════════════════
function _imageTracerFallback(imgd, w) {
  var traceOptions = {
    ltres: 0.5, qtres: 0.5, pathomit: 4,
    rightangleenhance: false,
    colorsampling: 0, numberofcolors: 2, colorquantcycles: 1,
    layering: 0, strokewidth: 1, linefilter: true,
    scale: 1, roundcoords: 1, viewbox: true,
    pal: [
      { r: 255, g: 255, b: 255, a: 255 },
      { r: 45, g: 35, b: 30, a: 255 }
    ]
  };

  var svgString = ImageTracer.imagedataToSVG(imgd, traceOptions);
  var parser = new DOMParser();
  var svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  var allPaths = svgDoc.querySelectorAll('path');

  var drawPaths = [];
  allPaths.forEach(function (p) {
    var fill = p.getAttribute('fill') || '';
    if (fill === 'rgb(255,255,255)' || fill === '#ffffff' || fill === '#fff') return;
    drawPaths.push({ d: p.getAttribute('d'), fill: fill });
  });

  if (drawPaths.length === 0) {
    allPaths.forEach(function (p) {
      drawPaths.push({ d: p.getAttribute('d'), fill: p.getAttribute('fill') || 'rgb(45,35,30)' });
    });
  }

  drawPaths.sort(function (a, b) { return b.d.length - a.d.length; });
  return drawPaths.slice(0, 40);
}

/**
 * 预处理图片并播放动画（骨架化中心线提取）
 */
function _processAndAnimate(img, container, myToken, doneOnce) {
  // ── 1. 降采样到大尺寸（保持质量但限制计算量） ──
  var MAX_SIZE = 500;
  var w = img.naturalWidth, h = img.naturalHeight;
  if (w > MAX_SIZE || h > MAX_SIZE) {
    if (w > h) {
      h = Math.round(h * MAX_SIZE / w);
      w = MAX_SIZE;
    } else {
      w = Math.round(w * MAX_SIZE / h);
      h = MAX_SIZE;
    }
  }

  // ── 2. 绘制到隐藏 canvas ──
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // ── 3. 预处理：灰度 → 对比度增强 → 阈值二值化 ──
  var imgd = ctx.getImageData(0, 0, w, h);
  _preprocessImage(imgd);

  // ── 4. 骨架化 + 中心线提取（替代 ImageTracer 轮廓追踪）──
  var pathsToDraw = [];
  try {
    _removeHorizontalLines(imgd, w, h);
    var binary = _toBinaryArray(imgd, w, h);
    _zhangSuenThinning(binary, w, h);
    var centerlinePaths = _extractCenterlines(binary, w, h);

    console.log('[replay] 骨架化：', centerlinePaths.length, '条原始路径');

    centerlinePaths = centerlinePaths.map(function (p) {
      p = _rdpSimplify(p, 1.5);
      p = _smoothPoints(p, 2);
      return p;
    });

    centerlinePaths = centerlinePaths.filter(function (p) { return p.length >= 5; });
    centerlinePaths = _orderByProximity(centerlinePaths);

    var MAX_PATHS = 40;
    pathsToDraw = centerlinePaths.slice(0, MAX_PATHS).map(function (p) {
      return { d: _pointsToSvgPath(p), fill: 'none' };
    });

    console.log('[replay] 骨架化完成：', pathsToDraw.length, '条有效路径');
  } catch (e) {
    console.error('[replay] 骨架化失败，降级到 ImageTracer:', e);
    pathsToDraw = [];
  }

  // 降级：骨架化无结果时使用 ImageTracer
  if (pathsToDraw.length === 0) {
    console.warn('[replay] 降级到 ImageTracer 轮廓追踪');
    try {
      // 重新获取原始 ImageData（骨架化可能已修改 imgd）
      var imgd2 = ctx.getImageData(0, 0, w, h);
      _preprocessImage(imgd2);
      pathsToDraw = _imageTracerFallback(imgd2, w);
      console.log('[replay] ImageTracer 降级完成：', pathsToDraw.length, '条路径');
    } catch (e2) {
      console.error('[replay] ImageTracer 也失败:', e2);
    }
  }

  if (pathsToDraw.length === 0) {
    console.warn('[replay] 所有方法均未提取到路径，跳过动画');
    container.classList.remove('active');
    _cleanupReplay();
    doneOnce();
    return;
  }

  // ── 5. 设置 SVG 容器 + defs（金色渐变 / 笔尖光晕渐变 / 笔尖发光 filter） ──
  var replaySvg = document.getElementById('replaySvg');
  var svgWidth = w;
  var svgHeight = h;

  replaySvg.setAttribute('viewBox', '0 0 ' + svgWidth + ' ' + svgHeight);
  replaySvg.style.maxWidth = '100%';
  replaySvg.style.maxHeight = '60vh';
  replaySvg.style.margin = '0 auto';
  replaySvg.style.display = 'block';

  // defs：渐变与滤镜
  var defs = document.createElementNS(SVG_NS, 'defs');

  // 金色渐变描边（ochre → clay → sage，铺满整张画布对角线）
  var goldGrad = document.createElementNS(SVG_NS, 'linearGradient');
  goldGrad.setAttribute('id', 'replayGoldGradient');
  goldGrad.setAttribute('gradientUnits', 'userSpaceOnUse');
  goldGrad.setAttribute('x1', '0'); goldGrad.setAttribute('y1', '0');
  goldGrad.setAttribute('x2', String(svgWidth));
  goldGrad.setAttribute('y2', String(svgHeight));
  [
    ['0%', GOLD_OCHRE],
    ['50%', GOLD_CLAY],
    ['100%', GOLD_SAGE]
  ].forEach(function (s) {
    var stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', s[0]);
    stop.setAttribute('stop-color', s[1]);
    goldGrad.appendChild(stop);
  });
  defs.appendChild(goldGrad);

  // 笔尖 aura 外圈光晕渐变
  var auraGrad = document.createElementNS(SVG_NS, 'radialGradient');
  auraGrad.setAttribute('id', 'replayPenAuraGrad');
  [
    ['0%', 'rgba(217,164,65,0.35)'],
    ['60%', 'rgba(217,164,65,0.12)'],
    ['100%', 'rgba(217,164,65,0)']
  ].forEach(function (s) {
    var stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', s[0]);
    stop.setAttribute('stop-color', s[1]);
    auraGrad.appendChild(stop);
  });
  defs.appendChild(auraGrad);

  // 笔尖 glow 金色光晕渐变
  var glowGrad = document.createElementNS(SVG_NS, 'radialGradient');
  glowGrad.setAttribute('id', 'replayPenGlowGrad');
  [
    ['0%', 'rgba(255,236,200,0.95)'],
    ['45%', 'rgba(217,164,65,0.70)'],
    ['100%', 'rgba(217,164,65,0)']
  ].forEach(function (s) {
    var stop = document.createElementNS(SVG_NS, 'stop');
    stop.setAttribute('offset', s[0]);
    stop.setAttribute('stop-color', s[1]);
    glowGrad.appendChild(stop);
  });
  defs.appendChild(glowGrad);

  // 笔尖发光 filter（feGaussianBlur + feMerge）
  var penFilter = document.createElementNS(SVG_NS, 'filter');
  penFilter.setAttribute('id', 'replayPenFilter');
  penFilter.setAttribute('x', '-100%'); penFilter.setAttribute('y', '-100%');
  penFilter.setAttribute('width', '300%'); penFilter.setAttribute('height', '300%');
  var blur = document.createElementNS(SVG_NS, 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '2.5');
  blur.setAttribute('result', 'penBlur');
  penFilter.appendChild(blur);
  var merge = document.createElementNS(SVG_NS, 'feMerge');
  var mn1 = document.createElementNS(SVG_NS, 'feMergeNode');
  mn1.setAttribute('in', 'penBlur');
  var mn2 = document.createElementNS(SVG_NS, 'feMergeNode');
  mn2.setAttribute('in', 'SourceGraphic');
  merge.appendChild(mn1);
  merge.appendChild(mn2);
  penFilter.appendChild(merge);
  defs.appendChild(penFilter);

  replaySvg.appendChild(defs);

  // 绘制层
  var drawLayer = document.createElementNS(SVG_NS, 'g');
  drawLayer.setAttribute('class', 'replay-draw-layer');
  replaySvg.appendChild(drawLayer);

  // 笔尖 group（aura r=28 + glow r=14 + core r=4）
  var penTipGroup = document.createElementNS(SVG_NS, 'g');
  penTipGroup.setAttribute('class', 'replay-pen-tip');
  penTipGroup.setAttribute('id', 'replayPenTip');
  penTipGroup.setAttribute('filter', 'url(#replayPenFilter)');

  var penAura = document.createElementNS(SVG_NS, 'circle');
  penAura.setAttribute('r', '28');
  penAura.setAttribute('fill', 'url(#replayPenAuraGrad)');
  penTipGroup.appendChild(penAura);

  var penGlow = document.createElementNS(SVG_NS, 'circle');
  penGlow.setAttribute('r', '14');
  penGlow.setAttribute('fill', 'url(#replayPenGlowGrad)');
  penTipGroup.appendChild(penGlow);

  var penCore = document.createElementNS(SVG_NS, 'circle');
  penCore.setAttribute('r', '4');
  penCore.setAttribute('fill', '#FFF7E6');
  penTipGroup.appendChild(penCore);

  replaySvg.appendChild(penTipGroup);

  // 收集 DOM 引用
  var els = {
    container: container,
    replaySvg: replaySvg,
    drawLayer: drawLayer,
    penTipGroup: penTipGroup,
    penAura: penAura,
    penGlow: penGlow,
    penCore: penCore,
    labelEl: document.getElementById('replayLabel'),
    progressBar: document.getElementById('replayProgressBar'),
    completionGlow: document.getElementById('replayCompletionGlow'),
    identityText: document.getElementById('replayIdentityText'),
    doneOnce: doneOnce
  };

  // ── 8. 运行仪式感动画面 ──
  _runCeremony(pathsToDraw, svgWidth, svgHeight, els, myToken).then(function () {
    if (myToken !== replayToken) return; // 已被取消
    _finishReplay(container, doneOnce);
  }).catch(function (e) {
    console.error('[replay] 动画异常:', e);
    _cleanupReplay();
    doneOnce();
  });
}

function _finishReplay(container, doneOnce) {
  var titleEl = container.querySelector('.replay-title');
  if (titleEl) titleEl.textContent = '画完成了';

  var endId = setTimeout(function () {
    container.classList.remove('active');
    container.innerHTML = '';
    _cleanupReplay();
    doneOnce();
  }, 200);
  replayTimeoutIds.push(endId);
}

/**
 * 清理：取消所有未完成的定时器与呼吸循环，重置状态
 */
function _cleanupReplay() {
  replayToken++; // 使在途的 rAF/动画循环失效
  if (replayBreathRafId) {
    cancelAnimationFrame(replayBreathRafId);
    replayBreathRafId = 0;
  }
  replayTimeoutIds.forEach(function (id) { clearTimeout(id); });
  replayTimeoutIds = [];
  replayInProgress = false;
}

/**
 * 跳过动画（用户主动跳过或快速模式）
 */
function skipReplay() {
  _cleanupReplay();
  var container = document.getElementById('replayContainer');
  if (container) {
    container.classList.remove('active');
    container.innerHTML = '';
  }
}
