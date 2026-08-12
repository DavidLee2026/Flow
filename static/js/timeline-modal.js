function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\\/-]/g, '\$&');
}

function enrichText(text) {
  let result = escapeHtml(text);

  // Step 1: Handle markdown bold **text** (从 LLM 输出的 **重点** 转为 strong 标签)
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Step 2: Handle glossary terms (绘画术语 → 深蓝可点击)
  const terms = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
  for (const term of terms) {
    const safeTerm = escapeRegex(term);
    const regex = new RegExp(`(${safeTerm})`, 'g');
    result = result.replace(regex, `<span class="glossary-term" onclick="showGlossaryTip(event,'${escapeRegex(term)}')">$1</span>`);
  }

  return result.replace(/\n/g, '<br>');
}

function showGlossaryTip(event, term) {
  event.stopPropagation();
  const existing = document.querySelector('.glossary-tip.visible');
  if (existing) existing.classList.remove('visible');

  let tip = document.getElementById('glossaryTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'glossaryTip';
    tip.className = 'glossary-tip';
    tip.onclick = () => tip.classList.remove('visible');
    document.body.appendChild(tip);
  }

  // 基础定义
  let html = `<span class="tip-word">${term}</span>${GLOSSARY[term] || '暂无解释'}`;

  // 画作关联语境（增强版）
  const ctx = window.currentGlossaryContext || {};
  const contextLine = ctx[term];
  if (contextLine) {
    html += `<div class="tip-context visible">
      <span class="ctx-label">🎯 在你这幅画里：</span>${contextLine}
    </div>`;
  }

  tip.innerHTML = html;
  tip.classList.add('visible');

  const rect = event.target.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - 130;
  let top = rect.bottom + 8;
  if (left < 10) left = 10;
  if (top + 200 > window.innerHeight) top = rect.top - 140;
  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

// capture 阶段监听：详情页/弹窗的 .modal 容器有 onclick="event.stopPropagation()"，
// 冒泡阶段会被拦断到不了 document → 点击别处永远关不掉术语提示。
// capture 阶段最先执行、先于 stopPropagation，任意位置点击都能正确关闭。
document.addEventListener('click', (e) => {
  if (!e.target.closest('.glossary-term')) {
    const tip = document.getElementById('glossaryTip');
    if (tip) tip.classList.remove('visible');
  }
}, true);

// ─── Calendar ───
let calYear, calMonth;

function renderCalendar() {
  const now = new Date();
  calYear = calYear || now.getFullYear();
  calMonth = calMonth !== undefined ? calMonth : now.getMonth();

  document.getElementById('calTitle').textContent = `${calYear} 年 ${calMonth + 1} 月`;
  document.getElementById('calPrev').onclick = () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); };
  document.getElementById('calNext').onclick = () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); };

  const drawDates = new Set();
  const dayRecords = {};
  for (const r of records) {
    try {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      drawDates.add(key);
      if (!dayRecords[key]) dayRecords[key] = [];
      dayRecords[key].push(r);
    } catch(e) {}
  }

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  let html = '<div class="cal-grid">';
  html += weekdays.map(w => `<div class="cal-weekday">${w}</div>`).join('');

  const prevMonthDays = new Date(calYear, calMonth, 0).getDate();
  for (let i = firstDay - 1; i >= 0; i--) {
    html += `<div class="cal-day other-month">${prevMonthDays - i}</div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${calMonth}-${d}`;
    const isToday = key === todayKey;
    const hasDrawing = drawDates.has(key);
    let cls = 'cal-day';
    if (hasDrawing) cls += ' has-drawing';
    if (isToday) cls += ' today';
    html += `<div class="${cls}" onclick="showCalDay('${key}')">${d}${hasDrawing ? '<span class="cal-dot"></span>' : ''}</div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = (7 - totalCells % 7) % 7;
  for (let d = 1; d <= remaining; d++) {
    html += `<div class="cal-day other-month">${d}</div>`;
  }

  html += '</div>';
  document.getElementById('calendarGrid').innerHTML = html;
  document.getElementById('calDayDetail').classList.remove('visible');
}

function showCalDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  const detail = document.getElementById('calDayDetail');
  const title = document.getElementById('calDayTitle');
  const list = document.getElementById('calDayDrawings');

  title.textContent = `${y} 年 ${m + 1} 月 ${d} 日`;

  const dayItems = records.filter(r => {
    try {
      const rd = new Date(r.timestamp);
      return rd.getFullYear() === y && rd.getMonth() === m && rd.getDate() === d;
    } catch(e) { return false; }
  });

  if (dayItems.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:#aaa;padding:20px;font-size:14px;">这天没有画作记录</div>';
  } else {
    list.innerHTML = dayItems.map(r => {
      const idx = records.findIndex(x => x.id === r.id);
      return `
        <div class="cal-day-detail-item" onclick="openModal(records[${idx >= 0 ? idx : 0}])">
          <div class="thumb"><img src="${API_BASE}/data/${r.image}" alt=""></div>
          <div class="preview">${r.feedback ? r.feedback.replace(/\n/g,' · ').slice(0,60) : '无反馈'}</div>
        </div>`;
    }).join('');
  }

  detail.classList.add('visible');
}

