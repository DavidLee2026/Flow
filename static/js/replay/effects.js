// replay/effects.js · 重绘动画仪式感效果（从 replay.js 拆分）
// 职责：_runCeremony / _animate / _delay / _startBreathing / _playCompletionPulse / _updateLabel / _preprocessImage

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
