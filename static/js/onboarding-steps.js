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
      <div class="ob-input-bar" id="obInputBar" style="flex-wrap:wrap">
        <input class="ob-input" id="obName" type="text" maxlength="20" placeholder="昵称（别人能看到）" style="flex:1 1 60%">
        <input class="ob-input" id="obPin" type="password" maxlength="4" inputmode="numeric" placeholder="4位PIN" style="flex:1 1 30%">
        <button class="ob-send-btn" id="obSendBtn" disabled>进入</button>
      </div>
    `,
    validate: (d) => (d.nickname && d.pin) ? {nickname: d.nickname, pin: d.pin} : null,
    onMount: () => {
      const nickEl = document.getElementById('obName');
      const pinEl = document.getElementById('obPin');
      const btn = document.getElementById('obSendBtn');
      if (!nickEl || !pinEl) return;
      // 不自动 focus：避免 onboarding 一显示就弹键盘导致 iOS 滚动
      const syncBtn = () => {
        if (btn) btn.disabled = !(nickEl.value.trim() && pinEl.value.trim().length === 4);
      };
      [nickEl, pinEl].forEach(el => {
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
