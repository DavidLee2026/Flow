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
// 骨架化 + 中心线提取（替代 ImageTracer 轮廓追踪）
// 原理：Zhang-Suen 细化 → 中心线追踪 → 邻近度排序
// 效果：沿笔迹中心线绘制，而非描边
// ════════════════════════════════════════════════════════

/**
 * 移除横线（笔记本纸纹干扰）
 * 检测水平方向上超过 40% 画布宽度的连续深色像素行，视为纸纹横线并清除
 */
function _removeHorizontalLines(imgd, w, h) {
  var data = imgd.data;
  for (var y = 0; y < h; y++) {
    var runStart = -1;
    for (var x = 0; x <= w; x++) {
      var isDark = x < w && (data[(y * w + x) * 4] < 180);
      if (isDark && runStart === -1) { runStart = x; }
      else if (!isDark && runStart !== -1) {
        if (x - runStart > w * 0.4) {
          for (var xi = runStart; xi < x; xi++) {
            data[(y * w + xi) * 4] = 255;
            data[(y * w + xi) * 4 + 1] = 255;
            data[(y * w + xi) * 4 + 2] = 255;
          }
        }
        runStart = -1;
      }
    }
  }
}

/**
 * 将 ImageData 转为二值数组（1=前景/线条，0=背景）
 */
function _toBinaryArray(imgd, w, h) {
  var data = imgd.data;
  var binary = new Uint8Array(w * h);
  for (var i = 0; i < w * h; i++) {
    binary[i] = data[i * 4] < 180 ? 1 : 0;
  }
  return binary;
}

/**
 * Zhang-Suen 细化算法
 * 将所有笔迹细化到单像素宽的中心线（骨架）
 */
function _zhangSuenThinning(binary, w, h) {
  var changed = true;
  while (changed) {
    changed = false;

    // 子迭代 1
    var toRemove = [];
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx = y * w + x;
        if (binary[idx] !== 1) continue;

        var p2 = binary[(y - 1) * w + x];
        var p3 = binary[(y - 1) * w + (x + 1)];
        var p4 = binary[y * w + (x + 1)];
        var p5 = binary[(y + 1) * w + (x + 1)];
        var p6 = binary[(y + 1) * w + x];
        var p7 = binary[(y + 1) * w + (x - 1)];
        var p8 = binary[y * w + (x - 1)];
        var p9 = binary[(y - 1) * w + (x - 1)];

        var neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (neighbors < 2 || neighbors > 6) continue;

        var transitions = 0;
        var seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        for (var k = 0; k < 8; k++) {
          if (seq[k] === 0 && seq[k + 1] === 1) transitions++;
        }
        if (transitions !== 1) continue;
        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;

        toRemove.push(idx);
      }
    }
    for (var i = 0; i < toRemove.length; i++) {
      binary[toRemove[i]] = 0;
      changed = true;
    }

    // 子迭代 2
    toRemove = [];
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var idx2 = y * w + x;
        if (binary[idx2] !== 1) continue;

        var p2 = binary[(y - 1) * w + x];
        var p3 = binary[(y - 1) * w + (x + 1)];
        var p4 = binary[y * w + (x + 1)];
        var p5 = binary[(y + 1) * w + (x + 1)];
        var p6 = binary[(y + 1) * w + x];
        var p7 = binary[(y + 1) * w + (x - 1)];
        var p8 = binary[y * w + (x - 1)];
        var p9 = binary[(y - 1) * w + (x - 1)];

        var neighbors = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (neighbors < 2 || neighbors > 6) continue;

        var transitions = 0;
        var seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        for (var k = 0; k < 8; k++) {
          if (seq[k] === 0 && seq[k + 1] === 1) transitions++;
        }
        if (transitions !== 1) continue;
        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;

        toRemove.push(idx2);
      }
    }
    for (var i = 0; i < toRemove.length; i++) {
      binary[toRemove[i]] = 0;
      changed = true;
    }
  }
}

/**
 * 从骨架中提取中心线路径
 * 1. 找端点（1邻居）和交叉点（3+邻居）
 * 2. 从端点出发追踪路径，在交叉点处停止
 * 3. 处理闭环（无端点的路径）
 */
function _extractCenterlines(binary, w, h) {
  var visited = new Uint8Array(w * h);
  var paths = [];

  function countNeighbors(x, y) {
    var count = 0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        var nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && binary[ny * w + nx] === 1) count++;
      }
    }
    return count;
  }

  function traceFrom(startX, startY) {
    var path = [{ x: startX, y: startY }];
    visited[startY * w + startX] = 1;
    var cx = startX, cy = startY;

    while (true) {
      var nextX = -1, nextY = -1;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h &&
            binary[ny * w + nx] === 1 && !visited[ny * w + nx]) {
            nextX = nx; nextY = ny;
            break;
          }
        }
        if (nextX !== -1) break;
      }
      if (nextX === -1) break;

      var nCount = countNeighbors(nextX, nextY);
      visited[nextY * w + nextX] = 1;
      path.push({ x: nextX, y: nextY });
      cx = nextX; cy = nextY;

      if (nCount >= 3) break; // 交叉点停止
    }
    return path;
  }

  // 从端点出发追踪
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (binary[y * w + x] === 1 && !visited[y * w + x] && countNeighbors(x, y) === 1) {
        var path = traceFrom(x, y);
        if (path.length >= 3) paths.push(path);
      }
    }
  }

  // 处理闭环和剩余线段
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (binary[y * w + x] === 1 && !visited[y * w + x]) {
        var path = traceFrom(x, y);
        if (path.length >= 3) paths.push(path);
      }
    }
  }

  return paths;
}

/**
 * Ramer-Douglas-Peucker 路径简化
 * 减少点数，保留形状特征
 */
function _rdpSimplify(points, tolerance) {
  if (points.length < 3) return points;

  function perpDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return Math.sqrt((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y));
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  }

  function rdp(pts, start, end, result) {
    if (end - start < 2) return;
    var maxDist = 0, maxIdx = 0;
    for (var i = start + 1; i < end; i++) {
      var d = perpDist(pts[i], pts[start], pts[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tolerance) {
      rdp(pts, start, maxIdx, result);
      result.push(pts[maxIdx]);
      rdp(pts, maxIdx, end, result);
    }
  }

  var result = [points[0]];
  rdp(points, 0, points.length - 1, result);
  result.push(points[points.length - 1]);
  return result;
}

/**
 * 移动平均平滑
 * 消除骨架化产生的锯齿
 */
function _smoothPoints(points, radius) {
  if (points.length < 4) return points;
  var result = [];
  for (var i = 0; i < points.length; i++) {
    var sx = 0, sy = 0, count = 0;
    for (var j = Math.max(0, i - radius); j <= Math.min(points.length - 1, i + radius); j++) {
      sx += points[j].x;
      sy += points[j].y;
      count++;
    }
    result.push({ x: sx / count, y: sy / count });
  }
  return result;
}

/**
 * 点数组转 SVG path 字符串
 */
function _pointsToSvgPath(points) {
  if (points.length === 0) return '';
  var d = 'M' + points[0].x.toFixed(1) + ',' + points[0].y.toFixed(1);
  for (var i = 1; i < points.length; i++) {
    d += ' L' + points[i].x.toFixed(1) + ',' + points[i].y.toFixed(1);
  }
  return d;
}

/**
 * 按邻近度排序路径（模拟自然绘制顺序）
 * 从最长的路径开始，每次找离当前终点最近的下一条路径
 */
function _orderByProximity(paths) {
  if (paths.length <= 1) return paths;

  var remaining = paths.slice().sort(function (a, b) { return b.length - a.length; });
  var ordered = [remaining.shift()];

  while (remaining.length > 0) {
    var last = ordered[ordered.length - 1];
    var lastEnd = last[last.length - 1];
    var minDist = Infinity, minIdx = 0, reverse = false;

    for (var i = 0; i < remaining.length; i++) {
      var start = remaining[i][0];
      var end = remaining[i][remaining[i].length - 1];
      var dStart = (start.x - lastEnd.x) * (start.x - lastEnd.x) + (start.y - lastEnd.y) * (start.y - lastEnd.y);
      var dEnd = (end.x - lastEnd.x) * (end.x - lastEnd.x) + (end.y - lastEnd.y) * (end.y - lastEnd.y);
      if (dStart < minDist) { minDist = dStart; minIdx = i; reverse = false; }
      if (dEnd < minDist) { minDist = dEnd; minIdx = i; reverse = true; }
    }

    var next = remaining.splice(minIdx, 1)[0];
    if (reverse) next.reverse();
    ordered.push(next);
  }

  return ordered;
}

/**
 * ImageTracer 降级方案
 * 骨架化失败时回退到轮廓追踪
 */
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

/**
 * 仪式感动画面主流程（async）
 * 顺序：显示笔尖 → 呼吸 → 逐条路径绘制(笔尖同步) → 闪烁 → 平滑移动到下一条 → 完成
 */
function _runCeremony(pathsToDraw, svgWidth, svgHeight, els, myToken) {
  var totalPaths = pathsToDraw.length;

  // 显示笔尖（CSS opacity 0→1，100ms 淡入）
  els.penTipGroup.style.opacity = 1;

  // 启动笔尖呼吸循环
  _startBreathing(els.penAura, els.penGlow, els.penCore, myToken);

  // 预创建所有路径元素，计算长度与起止点
  var pathInfos = [];
  for (var i = 0; i < totalPaths; i++) {
    var pathEl = document.createElementNS(SVG_NS, 'path');
    pathEl.setAttribute('class', 'replay-path');
    pathEl.setAttribute('d', pathsToDraw[i].d);
    pathEl.setAttribute('stroke', 'url(#replayGoldGradient)');
    pathEl.setAttribute('stroke-width', '2');
    els.drawLayer.appendChild(pathEl);

    var len = 0;
    try { len = pathEl.getTotalLength(); } catch (e) { len = 200; }
    if (!isFinite(len) || len < 1) len = 1;

    pathEl.style.strokeDasharray = String(len);
    pathEl.style.strokeDashoffset = String(len);
    pathEl.style.opacity = 1;

    var startPt = { x: svgWidth / 2, y: svgHeight / 2 };
    var endPt = startPt;
    try {
      startPt = pathEl.getPointAtLength(0);
      endPt = pathEl.getPointAtLength(len);
    } catch (e) { /* keep defaults */ }

    pathInfos.push({ el: pathEl, len: len, startPt: startPt, endPt: endPt });
  }

  // 时长预算（总动画约 4-6 秒，所有路径数下均 < 8s 超时保护）
  var DRAW_BUDGET = 2400;
  var perPathDraw = clamp(DRAW_BUDGET / totalPaths, 60, 220);
  var gapMove = clamp(perPathDraw * 0.2, 20, 50);

  // 笔尖就位到第一条路径起点
  els.penTipGroup.setAttribute(
    'transform',
    'translate(' + pathInfos[0].startPt.x + ',' + pathInfos[0].startPt.y + ')'
  );
  _updateLabel(els.labelEl, 1, totalPaths);

  // 逐条绘制
  var chain = Promise.resolve();
  pathInfos.forEach(function (info, idx) {
    chain = chain.then(function () {
      if (myToken !== replayToken) return;

      _updateLabel(els.labelEl, idx + 1, totalPaths);

      // 路径绘制：stroke-dashoffset len→0，easeOutCubic，笔尖同步到前沿
      return _animate(perPathDraw, easeOutCubic, function (eased) {
        if (myToken !== replayToken) return;
        var drawn = info.len * eased;
        info.el.style.strokeDashoffset = String(info.len - drawn);
        var pt = info.endPt;
        try { pt = info.el.getPointAtLength(drawn); } catch (e) { /* keep */ }
        els.penTipGroup.setAttribute(
          'transform',
          'translate(' + pt.x.toFixed(2) + ',' + pt.y.toFixed(2) + ')'
        );
      }, myToken);
    }).then(function () {
      if (myToken !== replayToken) return;

      // 收尾路径
      info.el.style.strokeDashoffset = '0';
      info.el.style.strokeDasharray = 'none';

      // 路径完成闪烁
      info.el.classList.add('flashing');
      var flashId = setTimeout(function () {
        info.el.classList.remove('flashing');
      }, 280);
      replayTimeoutIds.push(flashId);

      // 进度条 + 标签
      if (els.progressBar) {
        els.progressBar.style.width = ((idx + 1) / totalPaths * 100) + '%';
      }
      if (idx + 1 < totalPaths) {
        _updateLabel(els.labelEl, idx + 2, totalPaths);
      }

      // 平滑移动到下一条路径起点（easeInOutCubic）
      if (idx + 1 < totalPaths) {
        var fromPt = info.endPt;
        var toPt = pathInfos[idx + 1].startPt;
        return _animate(gapMove, easeInOutCubic, function (eased) {
          if (myToken !== replayToken) return;
          var x = fromPt.x + (toPt.x - fromPt.x) * eased;
          var y = fromPt.y + (toPt.y - fromPt.y) * eased;
          els.penTipGroup.setAttribute(
            'transform',
            'translate(' + x.toFixed(2) + ',' + y.toFixed(2) + ')'
          );
        }, myToken);
      }
    });
  });

  return chain.then(function () {
    if (myToken !== replayToken) return;

    // ── 完成仪式 ──
    // 隐藏笔尖
    els.penTipGroup.style.opacity = 0;

    // 完成光晕（整画布径向金色光晕）
    if (els.completionGlow) els.completionGlow.classList.add('show');

    // 完成脉冲圆（从中心扩散）
    _playCompletionPulse(els.replaySvg, svgWidth, svgHeight, myToken);

    // 身份确认语：浮现(500ms) → 停留 1s → 淡出(500ms)
    return _delay(180, myToken).then(function () {
      if (myToken !== replayToken) return;
      if (els.identityText) els.identityText.classList.add('show');
      return _delay(500 + 1000, myToken); // fade-in + 停留 1s
    }).then(function () {
      if (myToken !== replayToken) return;
      if (els.identityText) els.identityText.classList.remove('show'); // 淡出
      return _delay(500, myToken);
    });
  });
}

/**
 * rAF 动画封装为 Promise
 * @param {number} duration - 毫秒
 * @param {function} easeFn - 缓动函数
 * @param {function} onTick - (eased, linearT) =>
 * @param {number} myToken - 取消令牌
 */
function _animate(duration, easeFn, onTick, myToken) {
  return new Promise(function (resolve) {
    if (duration <= 0) { onTick(1, 1); resolve(); return; }
    var start = performance.now();
    function frame(now) {
      if (myToken !== replayToken) { resolve(); return; }
      var t = Math.min(1, (now - start) / duration);
      var eased = easeFn(t);
      onTick(eased, t);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });
}

/**
 * 延迟 Promise（受 token 控制的中断）
 */
function _delay(ms, myToken) {
  return new Promise(function (resolve) {
    var id = setTimeout(function () {
      if (myToken === replayToken) resolve();
    }, ms);
    replayTimeoutIds.push(id);
  });
}

/**
 * 笔尖呼吸循环（半径用 sin 做微小波动）
 */
function _startBreathing(penAura, penGlow, penCore, myToken) {
  if (replayBreathRafId) cancelAnimationFrame(replayBreathRafId);
  var start = performance.now();
  function loop(now) {
    if (myToken !== replayToken) return;
    var elapsed = now - start;
    var breath = 1 + Math.sin(elapsed * 0.012) * 0.08; // ±8% 微小波动
    if (penAura) penAura.setAttribute('r', (28 * breath).toFixed(2));
    if (penGlow) penGlow.setAttribute('r', (14 * breath).toFixed(2));
    if (penCore) penCore.setAttribute('r', (4 * breath).toFixed(2));
    replayBreathRafId = requestAnimationFrame(loop);
  }
  replayBreathRafId = requestAnimationFrame(loop);
}

/**
 * 完成脉冲圆：从中心扩散一圈金色脉冲
 */
function _playCompletionPulse(svg, w, h, myToken) {
  var cx = w / 2, cy = h / 2;
  var maxR = Math.max(w, h) * 0.65;
  var circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', cx);
  circle.setAttribute('cy', cy);
  circle.setAttribute('r', 0);
  circle.setAttribute('fill', 'none');
  circle.setAttribute('stroke', 'url(#replayGoldGradient)');
  circle.setAttribute('stroke-width', '2');
  circle.style.opacity = 0.9;
  svg.appendChild(circle);

  _animate(700, easeOutCubic, function (eased) {
    if (myToken !== replayToken) return;
    circle.setAttribute('r', (maxR * eased).toFixed(2));
    circle.style.opacity = (0.9 * (1 - eased)).toFixed(3);
  }, myToken).then(function () {
    if (circle.parentNode) circle.parentNode.removeChild(circle);
  });
}

/**
 * 更新进度文字标签
 */
function _updateLabel(labelEl, current, total) {
  if (!labelEl) return;
  labelEl.textContent = '正在重现: 线条 ' + current + '/' + total;
}

/**
 * 预处理图像：灰度 → 对比度增强 → 阈值二值化
 * 适配铅笔线描画（深色线条在浅色纸上）
 */
function _preprocessImage(imgd) {
  var data = imgd.data;
  var len = data.length;
  var threshold = 180;    // 像素灰度 < 180 视为线条（提高以捕获浅色铅笔线）
  var contrast = 1.4;     // 对比度增强系数

  for (var i = 0; i < len; i += 4) {
    // 灰度转换（亮度公式）
    var gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

    // 对比度增强
    gray = (gray - 128) * contrast + 128;
    gray = Math.max(0, Math.min(255, gray));

    // 二值化：线条=深色，背景=白色
    if (gray < threshold) {
      // 深色线条
      data[i] = 45;
      data[i + 1] = 35;
      data[i + 2] = 30;
    } else {
      // 白色背景
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }
    data[i + 3] = 255;
  }
}

/**
 * 完成动画：更新标题、清理、回调
 */
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
