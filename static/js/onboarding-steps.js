// onboarding-steps.js · Onboarding 步骤定义（从 onboarding.js 拆分）

const OB_STEPS = [
  {
    title: '你好呀，我是小绘',
    sub: '怎么称呼你呢？小绘想用心记住你',
    render: (d) => `
      <div class="ob-chat" id="obChat">
        <div class="ob-msg ob-msg-ai">
          <div class="ob-msg-avatar">✏️</div>
          <div class="ob-msg-bubble">你好呀，我是你的 AI 画友 ✨，你画的每一笔，我都会认真看见 🎨</div>
        </div>
        <div class="ob-msg ob-msg-ai">
          <div class="ob-msg-avatar">✏️</div>
          <div class="ob-msg-bubble">怎么称呼你呢？设个昵称和 4 位 PIN，下次回来还是你</div>
        </div>
      </div>
      <div class="ob-input-bar" id="obInputBar">
        <div class="ob-input-avatar" id="obInputAvatar">画</div>
        <div class="ob-input-fields">
          <input class="ob-input" id="obName" type="text" maxlength="8" placeholder="昵称（8 字以内）">
          <div class="ob-input-line2" id="obInputLine2">
            <input class="ob-input" id="obPin" type="password" maxlength="4" inputmode="numeric" placeholder="4 位 PIN">
            <span class="ob-pin-note">用户自由设置</span>
            <button class="ob-send-btn" id="obSendBtn" disabled>进入</button>
          </div>
        </div>
      </div>
    `,
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
      // 获取登录模式：本地免 PIN（隐藏 PIN 框）/ 服务器需 PIN
      fetch(`${API_BASE}/api/account/mode`).then(r => r.json()).then(m => {
        window._pinRequired = !!(m && m.pin_required);
        if (pinEl) pinEl.style.display = window._pinRequired ? '' : 'none';
        if (bubbles.length >= 2) {
          bubbles[1].textContent = window._pinRequired
            ? '怎么称呼你呢？设个昵称和 4 位 PIN，下次回来还是你'
            : '怎么称呼你呢？设个昵称，下次回来还是你';
        }
        const line2 = document.getElementById('obInputLine2');
        if (line2) line2.style.justifyContent = window._pinRequired ? 'flex-start' : 'flex-end';
        const note = document.querySelector('.ob-pin-note');
        if (note) note.style.display = window._pinRequired ? '' : 'none';
        syncBtn();
      }).catch(() => { window._pinRequired = true; });
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
