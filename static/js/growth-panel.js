// ─── growth-panel.js · 画者成长档案（探索地图 + 心流银行） ───
// 点击首页探索进度条的「查看成长」打开成长弹窗
// 设计系统：探索点亮用 --raw-ochre-500 赭石金，未探索用纸色灰阶
// 数据源：stats.profile.exploration + stats.profile.flow_bank（后端已补返回）

const GROWTH_AREAS = [
  { key: '动物', icon: '🐾', desc: '画活物，捕捉神韵' },
  { key: '植物', icon: '🌿', desc: '画叶子，观察生长' },
  { key: '人物', icon: '🧑', desc: '画人，捕捉表情' },
  { key: '静物', icon: '🏺', desc: '画器物，训练观察' },
  { key: '风景', icon: '🏔️', desc: '画山水，经营构图' },
  { key: '建筑', icon: '🏛️', desc: '画房子，练习透视' },
  { key: '想象', icon: '🌌', desc: '画脑海，释放创造' },
  { key: '抽象', icon: '🎨', desc: '画感受，探索表达' },
  { key: '其他', icon: '✨', desc: '画未知，拓展边界' },
];

/**
 * 渲染画者成长档案弹窗（探索地图 + 心流银行）
 * @param {Object} profile - stats.profile（含 exploration + flow_bank）
 */
function renderGrowthPanel(profile) {
  if (!profile) return;

  const exploration = profile.exploration || {};
  const exploredAreas = exploration.explored_areas || {};
  const progress = exploration.progress || 0;
  const areaCount = Object.keys(exploredAreas).length;

  const flowBank = profile.flow_bank || {};
  const totalFlow = flowBank.total_flow_minutes || 0;
  const bestStreak = flowBank.best_streak_flow || 0;
  const flowHistory = flowBank.flow_history || [];

  // 探索地图格子
  const mapGrid = GROWTH_AREAS.map(a => {
    const count = exploredAreas[a.key] || 0;
    const lit = count > 0;
    return `
      <div class="growth-area-card ${lit ? 'lit' : ''}" onclick="${lit ? `showAreaDetail('${a.key}', ${count})` : 'showAreaExplain(event)'}">
        <span class="growth-area-icon">${a.icon}</span>
        <span class="growth-area-name">${a.key}</span>
        ${lit ? `<span class="growth-area-count">×${count}</span>` : '<span class="growth-area-lock">🔒</span>'}
      </div>`;
  }).join('');

  // 心流银行（储蓄罐 + 统计）
  const flowLevel = Math.min(100, Math.round(totalFlow / 60 * 100));
  const flowHistoryHtml = flowHistory.length
    ? flowHistory.map(h => `
        <div class="flow-history-item">
          <span class="flow-history-date">${escapeHtml(h.date || '')}</span>
          <span class="flow-history-min">+${escapeHtml(String(h.minutes || h.flow || 0))} 分钟</span>
        </div>`).join('')
    : '<div class="flow-history-empty">还没有心流记录——画第一张，开启你的心流之旅</div>';

  // 拼接完整弹窗
  const panel = `
    <div class="growth-overlay" id="growthOverlay" onclick="closeGrowthPanel(event)">
      <div class="growth-panel" onclick="event.stopPropagation()">
        <div class="growth-panel-header">
          <span class="growth-panel-title">🧭 画者成长档案</span>
          <button class="growth-panel-close" onclick="closeGrowthPanel()">✕</button>
        </div>

        <div class="growth-panel-section">
          <div class="growth-panel-section-title">探索地图</div>
          <div class="growth-panel-section-sub">已探索 <strong>${areaCount}</strong> / 9 个方向 · 累计探索 <strong>${progress}</strong> 次</div>
          <div class="growth-map-grid">${mapGrid}</div>
        </div>

        <div class="growth-panel-section">
          <div class="growth-panel-section-title">心流银行</div>
          <div class="growth-flow-bank">
            <div class="flow-bank-jar">
              <div class="flow-bank-liquid" style="height:${flowLevel}%;"></div>
              <span class="flow-bank-coin">💰</span>
            </div>
            <div class="flow-bank-stats">
              <div class="flow-bank-stat">
                <span class="flow-bank-stat-value">${totalFlow}</span>
                <span class="flow-bank-stat-label">累计心流分钟</span>
              </div>
              <div class="flow-bank-stat">
                <span class="flow-bank-stat-value">${bestStreak}</span>
                <span class="flow-bank-stat-label">最佳心流连胜</span>
              </div>
            </div>
          </div>
          <div class="flow-history-list">${flowHistoryHtml}</div>
        </div>

        <div class="growth-panel-footer">
          每一次探索都在点亮你的绘画世界地图
        </div>
      </div>
    </div>
  `;

  // 插入到 body
  let overlay = document.getElementById('growthOverlay');
  if (overlay) overlay.remove();
  document.body.insertAdjacentHTML('beforeend', panel);
  document.body.style.overflow = 'hidden';
}

function closeGrowthPanel(e) {
  if (e && e.target && e.target.id !== 'growthOverlay') return;
  const overlay = document.getElementById('growthOverlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
}

/** 已探索方向详情 */
function showAreaDetail(area, count) {
  if (typeof showConfirm === 'function') {
    showConfirm({
      icon: '🗺️',
      title: `${area}方向`,
      desc: `你已在「${area}」方向探索了 ${count} 次。\n\n继续画下去，这个方向的地图会越走越远。`,
      okText: '继续探索',
      okClass: 'btn-primary',
    });
  }
}

/** 未探索方向解释 */
function showAreaExplain(e) {
  if (e) e.stopPropagation();
  if (typeof showConfirm === 'function') {
    showConfirm({
      icon: '🗺️',
      title: '未探索的方向',
      desc: '这个方向你还没画过。\n\n画对应主题的画作，就能点亮它——\n画猫狗 → 点亮「动物」\n画杯子 → 点亮「静物」\n画风景 → 点亮「风景」\n\n每一次探索都让世界地图更丰富。',
      okText: '明白了',
      okClass: 'btn-primary',
    });
  }
}
