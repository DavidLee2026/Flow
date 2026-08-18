// ─── timeline.js · 记录页 / 日历 / 详情弹窗 / 术语弹窗 ───
// 依赖：state.js
// ─── Timeline ───
// 加载完成标志：首次数据未就绪时渲染"加载中…"而非"还没有画作"空态（防空态竞态）
let timelineLoaded = false;

async function loadTimeline() {
  try {
    const res = await fetch(`${API_BASE}/api/timeline`);
    const data = await res.json();
    records = data.records || [];
    timelineLoaded = true;
    updateHomepage();
    const active = document.querySelector('.page.active');
    if (active) {
      const id = active.id.replace('page-', '');
      if (id === 'timeline') renderTimeline();
    }
  } catch (e) {
    // 加载失败也标记完成，避免永远停在"加载中"（此时空态是真实结果）
    timelineLoaded = true;
  }
}

function updateHomepage() {
  // 引导文字始终显示（方便新用户查看拍摄提示）
  const guide = document.getElementById('guideText');
  if (guide) {
    guide.classList.remove('hidden');
  }
}


// ─── 记录页增强：搜索 + 视图切换 ───
let timelineSearchQuery = '';
let timelineGroupMode = 'grid'; // 'grid' | 'list'

function renderTimeline() {
  const list = document.getElementById('timelineList');

  // 数据未加载完成：显示加载中，不渲染误导性的"还没有画作"空态
  if (!timelineLoaded) {
    list.innerHTML = `
      <div class="card" style="margin-top: 24px;">
        <div class="empty-state">
          <div class="empty-icon">🖼️</div>
          <div class="empty-title">正在整理你的画作…</div>
        </div>
      </div>`;
    return;
  }

  if (!records || records.length === 0) {
    list.innerHTML = `
      <div class="card" style="margin-top: 24px;">
        <div class="empty-state">
          <div class="empty-icon">🎨</div>
          <div class="empty-title">还没有画作</div>
          <div class="empty-desc">画完第一张上传吧，小绘会<br>看着你的进步陪你走下去。</div>
          <button class="btn btn-primary btn-md" onclick="switchTab('home')">📸 开始画</button>
        </div>
      </div>`;
    return;
  }

  // 搜索栏 + 视图切换
  let toolbarHtml = `
    <div class="tl-toolbar">
      <input class="tl-search" type="text" placeholder="🔍 搜索画作反馈..." value="${escapeHtml(timelineSearchQuery)}"
        oninput="onTimelineSearch(this.value)">
      <div class="tl-group-toggle">
        <button class="tl-group-btn ${timelineGroupMode === 'grid' ? 'active' : ''}" onclick="setTimelineGroup('grid')">平铺</button>
        <button class="tl-group-btn ${timelineGroupMode === 'list' ? 'active' : ''}" onclick="setTimelineGroup('list')">时间线</button>
      </div>
    </div>`;

  // 过滤
  let filtered = [...records].reverse();
  if (timelineSearchQuery.trim()) {
    const q = timelineSearchQuery.toLowerCase();
    filtered = filtered.filter(r =>
      (r.feedback || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    list.innerHTML = toolbarHtml + `
      <div class="card" style="margin-top:16px;text-align:center;padding:30px;">
        <div style="font-size:14px;color:var(--color-text-tertiary);">没有找到匹配的画作</div>
      </div>`;
    return;
  }

  if (timelineGroupMode === 'list') {
    // 时间线模式 — 按日期分组，56×56 缩略图 + 反馈摘要
    const grouped = groupRecordsByDate(filtered);
    let html = toolbarHtml;
    for (const [dateLabel, items] of Object.entries(grouped)) {
      html += `<div class="tl-date-group"><div class="tl-date-header">${dateLabel}</div>`;
      html += items.map(r => {
        const recordIndex = records.indexOf(r);
        return renderTimelineListItem(r, recordIndex);
      }).join('');
      html += '</div>';
    }
    list.innerHTML = html;
  } else {
    // 平铺模式 — 3 列图片网格
    list.innerHTML = toolbarHtml + '<div class="tl-grid">' + filtered.map(r => {
      const recordIndex = records.indexOf(r);
      return renderTimelineItem(r, recordIndex);
    }).join('') + '</div>';
  }
}

// 按日期分组记录
function groupRecordsByDate(filteredRecords) {
  const groups = {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  for (const r of filteredRecords) {
    let label;
    try {
      const d = new Date(r.timestamp);
      const dDate = new Date(d);
      dDate.setHours(0, 0, 0, 0);
      if (dDate.getTime() === today.getTime()) {
        label = '今天';
      } else if (dDate.getTime() === yesterday.getTime()) {
        label = '昨天';
      } else {
        label = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
      }
    } catch(e) {
      label = '未知日期';
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(r);
  }
  return groups;
}

function renderTimelineItem(r, recordIndex) {
  const safeIdx = recordIndex >= 0 ? recordIndex : 0;
  return `
    <div class="tl-grid-item" onclick="openModal(records[${safeIdx}])">
      <img src="${API_BASE}/data/${r.image}" alt="画作" loading="lazy">
    </div>`;
}

function renderTimelineListItem(r, recordIndex) {
  const safeIdx = recordIndex >= 0 ? recordIndex : 0;
  return `
    <div class="timeline-item" onclick="openModal(records[${safeIdx}])" style="cursor:pointer;">
      <div class="thumb"><img src="${API_BASE}/data/${r.image}" alt="第${records.length - safeIdx}张"></div>
      <div class="info">
        <div class="preview">${(r.feedback || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n/g, ' · ').slice(0, 80)}</div>
        <div class="time">第 ${records.length - safeIdx} 张 · ${formatTime(r.timestamp)}</div>
      </div>
    </div>`;
}

function onTimelineSearch(query) {
  timelineSearchQuery = query;
  renderTimeline();
  // 保持焦点
  setTimeout(() => {
    const input = document.querySelector('.tl-search');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, 0);
}

function setTimelineGroup(mode) {
  timelineGroupMode = mode;
  renderTimeline();
}

// ─── 构图引导 ───
function showCompositionGuide() {
  let overlay = document.getElementById('compositionOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'compositionOverlay';
    overlay.className = 'composition-overlay';
    overlay.innerHTML = `
      <div class="comp-card">
        <div class="comp-title">📸 拍照构图小贴士</div>
        <div class="comp-grid-demo">
          <div class="comp-grid-lines">
            <div class="comp-h-line" style="top:33.3%"></div>
            <div class="comp-h-line" style="top:66.6%"></div>
            <div class="comp-v-line" style="left:33.3%"></div>
            <div class="comp-v-line" style="left:66.6%"></div>
            <div class="comp-dot" style="top:33.3%;left:33.3%"></div>
            <div class="comp-dot" style="top:33.3%;left:66.6%"></div>
            <div class="comp-dot" style="top:66.6%;left:33.3%"></div>
            <div class="comp-dot" style="top:66.6%;left:66.6%"></div>
          </div>
        </div>
        <div class="comp-tips">
          <div>• 把画纸放在四个交叉点附近，不要偏到一边</div>
          <div>• 手机从正上方平行对准纸面，避免透视变形</div>
          <div>• 光线充足，不要让手或影子挡住画面</div>
          <div>• 画作尽量占满取景框</div>
        </div>
        <button class="btn btn-primary btn-md" style="width:100%;" onclick="closeCompositionGuide()">明白了，去拍照</button>
      </div>`;
    document.body.appendChild(overlay);
  }
  overlay.classList.add('visible');
}

function closeCompositionGuide() {
  const overlay = document.getElementById('compositionOverlay');
  if (overlay) overlay.classList.remove('visible');
}

// ─── Glossary ───
const GLOSSARY = {
  '灰面/中间调': ' 亮面和暗面之间的过渡区域，像"傍晚的天色"',
  '饱和度/纯度': ' 颜色有多"正"，越鲜艳饱和度越高，越灰越低',
  '明暗交界线': ' 物体亮面和暗面交接的那条暗带，不是细线',
  '三角形构图': ' 画面主体形成三角形的稳定结构',
  '五大调子': ' 高光、灰面、明暗交界线、反光、投影，五个亮度层次',
  '虚实边界': ' 有些地方边缘清楚（实），有些地方模糊（虚）',
  '一点透视': ' 所有横线都往一个消失点跑，正对物体的感觉',
  '两点透视': ' 横线往左一个点跑、往右一个点跑，像站在街角看',
  '三点透视': ' 除了左右，竖线也往天上或地下跑，像仰视高楼',
  '鱼眼透视': ' 线条往中间弯，像透过玻璃球看世界',
  '空气透视': ' 远处的物体颜色偏灰偏蓝，像被空气挡住',
  '视觉中心': ' 观众第一眼看到的地方，通常是画面最重要的位置',
  '黄金分割': ' 约等于三分法，比例大约是 1:1.618',
  '三庭五眼': ' 脸长分三等份（发际到眉、眉到鼻底、鼻底到下巴），脸宽约五只眼宽',
  '肌肉走向': ' 肌肉生长的方向，画线条要顺着这个方向',
  '手部比例': ' 手的长度约等于脸长，手掌和手指各占一半',
  '脚部简化': ' 把脚看成梯形+三角形的组合，不要一开始就画脚趾',
  '面部朝向': ' 脸是正面、侧面还是四分之三侧，决定五官怎么排',
  '颈肩关系': ' 脖子不是直直插在肩膀上的，有斜方肌的过渡',
  '四肢比例': ' 手臂下垂时肘关节在腰附近，腕关节在大腿根附近',
  '轮廓线': ' 物体最外圈的那根线，像剪影的边缘',
  '辅助线': ' 用来帮助定位的线，画完通常会擦掉',
  '结构线': ' 表现物体内部结构的线，比如杯子的圆柱轴线',
  '疏密线': ' 线条有疏有密，密的地方暗，疏的地方亮',
  '轻重线': ' 线条有粗有细、有深有浅，重线压下去，轻线提起来',
  '黑白灰': ' 画面中最亮、中间、最暗三个大色调',
  '互补色': ' 色环上面对面的颜色，红绿、蓝橙、黄紫',
  '类似色': ' 色环上挨着的颜色，红黄橙、蓝绿青',
  '对比色': ' 差别很大的颜色放一起，视觉冲击力很强',
  '环境色': ' 周围物体反射到你画的对象上的颜色',
  '固有色': ' 物体本身的颜色，比如香蕉是黄的',
  '光源色': ' 照在物体上的光本身带的颜色，比如夕阳是橙红的',
  '透明感': ' 颜色薄而透，能看到底下的纸或底色',
  '消失点': ' 线条向远方延伸，最后在视线高度交汇的那个点',
  '视平线': ' 和你眼睛一样高的那条水平线，所有消失点都在上面',
  '三分法': ' 画面横竖各分三等份，重要的东西放在交叉点上',
  '对角线': ' 从左下角到右上角（或反过来）的斜线，让画面有动感',
  '框架式': ' 用门窗、树枝等把主体"框"在中间，像画框里套画',
  '引导线': ' 画面中的线条指向主体，把观众视线带过去',
  '正负形': ' 主体是"正形"，主体以外的空白形状是"负形"',
  '头身比': ' 身高是头长的几倍，动漫常 7-9 头身，真人约 7.5',
  '动态线': ' 一条想象中的线，从头顶贯穿全身，抓住人物动作的核心',
  '骨骼点': ' 皮肤下面能摸到的骨头凸起，比如锁骨、膝盖骨、肘尖',
  '眉眼距': ' 眉毛到眼睛的距离，太大像惊讶，太小像皱眉',
  '鼻唇距': ' 鼻子底部到上嘴唇的距离，影响年龄感',
  '下颌角': ' 下巴两侧的拐角，方脸拐角低，尖脸拐角高',
  '指关节': ' 手指能弯曲的地方，三个关节把手指分成四段',
  '干画法': ' 颜料或铅笔干燥地画，笔触清晰，适合细节',
  '湿画法': ' 颜料加水画，颜色互相渗开，适合渐变',
  '排线': ' 用一组平行线填充面积或表现明暗，线越密颜色越深',
  '勾线': ' 用一条连续的线勾出物体轮廓，讲究干净利落',
  '运笔': ' 你拿笔的方式和笔在纸上移动的动作',
  '笔触': ' 笔尖留在纸上的痕迹，能看出你怎么画的',
  '断线': ' 画到一半停下来的线，速写里很常见',
  '长线': ' 一笔画出的长距离线条，用来抓大形',
  '短线': ' 短促的线条，用来排明暗或画细节',
  '弧线': ' 弯曲的线，画圆形物体时离不开它',
  '折线': ' 有棱有角的线，像画立方体边缘',
  '曲线': ' 流畅柔软的画线，和弧线差不多但更自由',
  '直线': ' 不弯的线，听起来简单其实最难画准',
  '切线': ' 用短直线去"切"出圆形或弧形的轮廓',
  '复线': ' 好几条线叠在一起画，速写里用来找形',
  '高光': ' 物体上最亮的那个点，光直接反射进你眼睛的地方',
  '反光': ' 暗部里悄悄亮起来的地方，是周围光线反射上去的',
  '投影': ' 物体挡住光后在地上留下的影子，让物体"落地"',
  '亮面': ' 被光直接照到的部分，物体最亮的区域',
  '暗面': ' 背对光源的那一面，但不要画成死黑',
  '黑度': ' 你画面里最暗的地方够不够暗',
  '明度': ' 一个颜色有多亮或多暗，大白话就是"亮度"',
  '暗部': ' 画面里所有偏暗的区域统称',
  '亮部': ' 画面里所有偏亮的区域统称',
  '硬边': ' 明暗交界很锐利，像刀切的一样',
  '软边': ' 明暗过渡很柔和，像晕开的一样',
  '色相': ' 颜色的名字，红橙黄绿青蓝紫，这叫色相',
  '冷暖': ' 颜色给人的温度感，红橙暖、蓝绿冷',
  '色调': ' 整张画的颜色倾向，偏暖、偏冷、偏灰',
  '色温': ' 颜色的冷暖程度，和色调差不多意思',
  '色块': ' 一块一块的颜色，像拼图一样拼成画面',
  '叠色': ' 一层颜色盖在另一层上，透出底下的颜色',
  '混色': ' 两种颜色混在一起，调出新的颜色',
  '厚涂': ' 颜料堆得很厚，能看出笔触和肌理',
  '薄涂': ' 颜料薄薄一层，像水彩那样透',
  '灰度': ' 去掉颜色只看明暗，从白到黑的阶梯',
  '色阶': ' 颜色从深到浅的层次，像楼梯一样',
  '仰视': ' 从下往上看，物体的底面看得到，顶面看不到',
  '俯视': ' 从上往下看，物体的顶面看得到，底面看不到',
  '平视': ' 和你眼睛一样高看过去，最舒服自然的角度',
  '缩短': ' 物体离你近的一头大、远的一头小，长度被"压缩"',
  '重叠': ' 一个物体挡在另一个前面，这是最简单的空间感',
  '对称': ' 左右两边差不多一样，给人稳定、庄重的感觉',
  '平衡': ' 左边重右边轻就加个小东西补一下，整体不歪',
  '留白': ' 画面故意不画满，空白也是一种"内容"',
  '裁切': ' 画面边缘切掉一部分，让主体更突出',
  '节奏': ' 画面元素有规律地重复或变化，像音乐的节拍',
  '重复': ' 同样的形状或颜色在画面中出现多次，形成统一感',
  '重心': ' 身体重量的支撑点，站立时通常在两脚之间',
  '体块': ' 把人体想成几个积木（头、胸、骨盆、四肢），先搭积木再细化',
  '转折': ' 身体从朝前变成朝侧面的那个"拐角"，比如肩膀到手臂',
  '关节': ' 手臂和腿都能弯曲的地方：肩、肘、腕、髋、膝、踝',
  '光滑': ' 表面平整，反光强烈且集中，比如玻璃、金属',
  '粗糙': ' 表面不平，反光是散的，比如石头、树皮',
  '柔软': ' 边缘柔和、起伏平缓，像布料、棉花',
  '坚硬': ' 边缘锐利、棱角分明，像石头、金属',
  '透明': ' 能看透的，比如玻璃杯、水、冰块',
  '反射': ' 光滑表面上能看到周围物体的倒影',
  '纹理': ' 物体表面的花纹，木纹、布纹、皮肤毛孔都算',
  '哑光': ' 不反光的表面，像水泥墙、未上釉的陶罐',
  '光泽': ' 表面有柔和的光亮，像皮肤、绸缎',
  '触感': ' 画面让人看了觉得"摸起来应该是什么感觉"',
  '擦笔': ' 用纸巾或擦笔把画好的线条揉开，制造柔和效果',
  '揉擦': ' 用手指或工具把色调抹匀，过渡更自然',
  '刮刀': ' 用油画刀刮颜料，制造肌理或去除多余颜色',
  '弹笔': ' 用笔弹洒颜料，制造星星点点的纹理',
  '点画': ' 用点组成画面，像修拉那样，近看是点远看是形',
  '平涂': ' 一块颜色均匀地平铺，没有渐变',
  '渐变': ' 颜色从深到浅或从一种色到另一种色慢慢过渡',
  '晕染': ' 边缘用水或干笔揉开，像水墨画那样自然扩散',
  '罩染': ' 薄薄一层透明色盖在底色上，让颜色变深变丰富',
  '提亮': ' 在暗部或中间调上加浅色，让那部分"亮起来"',
  '加深': ' 在亮部或中间调上加重色，增加立体感',
};

