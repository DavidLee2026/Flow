// onboarding-steps.js · Onboarding 步骤定义（从 onboarding.js 拆分）

const OB_STEPS = [
  {
    title: '纸笔绘画的 AI 陪伴者',
    sub: '3 步开始你的第一幅画',
    render: () => `
      <div class="ob-scene">
        <div class="ob-scene-title-card">
          <h2 class="ob-scene-title">纸笔绘画的<br>AI 陪伴者</h2>
        </div>
        <div class="ob-scene-steps">
          <div class="ob-scene-step">
            <span class="ob-scene-num">1</span>
            <div class="ob-scene-txt"><b>找一张纸和一支笔</b></div>
          </div>
          <div class="ob-scene-step">
            <span class="ob-scene-num">2</span>
            <div class="ob-scene-txt"><b>画任何东西</b><span class="ob-scene-sub">简笔画、涂鸦、临摹都可以</span></div>
          </div>
          <div class="ob-scene-step">
            <span class="ob-scene-num">3</span>
            <div class="ob-scene-txt"><b>拍下来，AI 画友给你反馈</b></div>
          </div>
        </div>
        <blockquote class="ob-scene-quote">
          <p class="ob-scene-quote-line">不用画得像，不用画得好。</p>
          <p class="ob-scene-quote-line ob-scene-quote-hit">画下去，就是胜利。</p>
        </blockquote>
        <button class="ob-btn primary" id="obSceneBtn">我知道了，开始吧</button>
      </div>
    `,
    validate: () => ({}),
    onMount: () => {
      const btn = document.getElementById('obSceneBtn');
      if (btn) btn.addEventListener('click', obNext);
    }
  },
  {
    title: '你好呀，我是小绘',
    sub: '怎么称呼你呢？小绘想用心记住你',
    render: (d) => {
      // PIN 行是否显示：预取未完成（undefined）或需 PIN → 显示（保守）；免 PIN → 直接隐藏，避免闪烁
      const needPin = window._pinRequired !== false;
      return `
      <div class="ob-chat" id="obChat">
        <div class="ob-msg ob-msg-ai">
          <div class="ob-msg-avatar">✏️</div>
          <div class="ob-msg-bubble">你好呀，我是小绘 ✨ 我是你纸笔绘画的 AI 画友。找一张纸和一支笔，画下任何想画的——简笔画、涂鸦都可以。不用画得像，画下去，就是胜利。拍给我看，我会认真看见你的每一笔 🎨</div>
        </div>
        <div class="ob-msg ob-msg-ai">
          <div class="ob-msg-avatar">✏️</div>
          <div class="ob-msg-bubble">怎么称呼你呢？</div>
        </div>
      </div>
      <div class="ob-input-wrap" id="obInputWrap">
        <div class="ob-input-bar" id="obInputBar">
          <div class="ob-input-fields">
            <div class="ob-input-line1" id="obInputLine1">
              <input class="ob-input" id="obName" type="text" maxlength="8" placeholder="昵称（8 字以内）">
              <button class="ob-send-btn" id="obSendBtn" disabled>进入</button>
            </div>
            <div class="ob-input-line2" id="obInputLine2" style="${needPin ? '' : 'display:none'}">
              <input class="ob-input" id="obPin" type="password" maxlength="4" inputmode="numeric" placeholder="4 位 PIN（自由设置）">
            </div>
          </div>
        </div>
        <div class="ob-msg-avatar ob-input-avatar" id="obInputAvatar">新</div>
      </div>
    `;
    },
    validate: (d) => (d.nickname) ? {nickname: d.nickname} : null,
    onMount: () => {
      const nickEl = document.getElementById('obName');
      const pinEl = document.getElementById('obPin');
      const btn = document.getElementById('obSendBtn');
      if (!nickEl) return;
      // 不自动 focus：避免 onboarding 一显示就弹键盘导致 iOS 滚动
      const bubbles = document.querySelectorAll('#obChat .ob-msg-ai .ob-msg-bubble');
      const syncBtn = () => {
        if (btn) {
          const pinOk = window._pinRequired === false || (pinEl && pinEl.value.trim().length === 4);
          btn.disabled = !(nickEl.value.trim() && pinOk);
        }
      };
      // PIN 模式：优先用 startOnboarding 预取的结果（避免先显示 PIN 再闪烁隐藏），未就绪则兜底 fetch
      const applyPinMode = () => {
        if (pinEl) pinEl.style.display = window._pinRequired ? '' : 'none';
        const line2El = document.getElementById('obInputLine2');
        if (line2El) line2El.style.display = window._pinRequired ? '' : 'none';
        if (bubbles.length >= 2) {
          bubbles[1].textContent = window._pinRequired
            ? '怎么称呼你呢？设个昵称和 4 位 PIN，下次回来还是你'
            : '怎么称呼你呢？';
        }
        const line2 = document.getElementById('obInputLine2');
        if (line2) line2.style.justifyContent = window._pinRequired ? 'flex-start' : 'flex-end';
        syncBtn();
      };
      if (typeof window._pinRequired === 'boolean') {
        applyPinMode();
      } else {
        fetch(`${API_BASE}/api/account/mode`).then(r => r.json()).then(m => {
          window._pinRequired = !!(m && m.pin_required);
          applyPinMode();
        }).catch(() => { window._pinRequired = true; applyPinMode(); });
      }
      const els = pinEl ? [nickEl, pinEl] : [nickEl];
      els.forEach(el => {
        el.addEventListener('focus', () => {
          const ob = document.getElementById('onboardingOverlay');
          if (!ob) return;
          const prev = ob.scrollTop;
          [0, 80, 200, 400].forEach(d => setTimeout(() => { if (ob.scrollTop !== prev) ob.scrollTop = prev; }, d));
        });
        el.addEventListener('input', (e) => { if (e.isComposing) return; syncBtn(); });
        el.addEventListener('compositionend', syncBtn);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) obSendName(); });
      });
      btn.addEventListener('click', obSendName);
      syncBtn();
    }
  }
];
