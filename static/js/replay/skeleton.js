// replay/skeleton.js · 骨架化中心线提取（从 replay.js 拆分）
// 职责：_removeHorizontalLines ~ _orderByProximity，纯图像处理，无 DOM 依赖

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
