// onboarding-steps.js · Onboarding 步骤定义（从 onboarding.js 拆分）

const OB_STEPS = [
  {
    title: '你好呀，我是小绘',
    sub: '怎么称呼你呢？小绘想用心记住你',
    render: (d) => `
      <div class="ob-chat" id="obChat">
        <div class="ob-msg ob-msg-ai">
          <div class="ob-msg-avatar">✏️</div>
          <div class="ob-msg-bubble">你好呀，我是你的 AI 画友 ✨，你画的每一笔，我都会认真看见 💖</div>
        </div>
        <div class="ob-msg ob-msg-ai">
          <div class="ob-msg-avatar">✏️</div>
          <div class="ob-msg-bubble">怎么称呼你呢？小绘想用心记住你</div>
        </div>
      </div>
      <div class="ob-input-bar" id="obInputBar">
        <input class="ob-input" id="obName" type="text" placeholder="给自己起个名字吧" value="${d.name || ''}">
        <button class="ob-send-btn" id="obSendBtn" disabled>发送</button>
      </div>
    `,
    validate: (d) => d.name ? {name: d.name} : null,
    onMount: () => {
      const inp = document.getElementById('obName');
      const btn = document.getElementById('obSendBtn');
      if (!inp) return;
      inp.focus();
      const syncBtn = () => {
        const name = inp.value.trim();
        if (btn) btn.disabled = !name || name.length > 8;
        if (name.length > 8) {
          inp.classList.add('shake');
          showToast('姓名不能超过 8 个字 😅');
          setTimeout(() => inp.classList.remove('shake'), 600);
        }
      };
      // IME 拼音组词中不触发校验（组词中的拼音字母会短暂超 8 字符）
      inp.addEventListener('input', (e) => {
        if (e.isComposing) return;
        syncBtn();
      });
      inp.addEventListener('compositionend', syncBtn);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) obSendName();
      });
      btn.addEventListener('click', obSendName);
      syncBtn();
    }
  }
];
