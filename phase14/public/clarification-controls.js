(() => {
  // Install BEFORE launch-controls.js. The launch wrapper then adds consent/pass data
  // once, and this inner wrapper can resolve deterministic 422 clarification rounds
  // without causing a second analytics event or any AI generation call.
  const nativeFetch = window.fetch.bind(window);
  const MAX_ROUNDS = 2;

  function isBuildRequest(input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' ? input?.method : 'GET') || 'GET').toUpperCase();
    return method === 'POST' && url.includes('/api/build') && typeof init?.body === 'string';
  }

  function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

  function closeModal(root, value, resolve) {
    try { root.remove(); } catch {}
    resolve(value);
  }

  function askQuestions(questions = []) {
    return new Promise((resolve) => {
      const qs = Array.isArray(questions) ? questions.filter(q => q && q.id && q.prompt).slice(0, 6) : [];
      if (!qs.length) return resolve(null);

      const root = document.createElement('div');
      root.id = 'clarification-modal';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-labelledby', 'clarification-title');
      root.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:18px;';

      const card = document.createElement('div');
      card.style.cssText = 'width:min(680px,100%);max-height:88vh;overflow:auto;background:#fff;color:#111;border-radius:16px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.28);';
      const title = document.createElement('h2');
      title.id = 'clarification-title';
      title.textContent = 'A few details before I build your program';
      title.style.marginTop = '0';
      const intro = document.createElement('p');
      intro.textContent = 'These answers change the actual prescription, so I would rather ask than guess.';
      card.append(title, intro);

      const fields = new Map();
      qs.forEach((q, index) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin:18px 0;';
        const label = document.createElement('label');
        const inputId = `clarification-${index}`;
        label.htmlFor = inputId;
        label.textContent = q.prompt;
        label.style.cssText = 'display:block;font-weight:700;margin-bottom:7px;';
        const input = document.createElement('textarea');
        input.id = inputId;
        input.rows = 3;
        input.maxLength = 1500;
        input.autocomplete = 'off';
        input.style.cssText = 'box-sizing:border-box;width:100%;font:inherit;padding:11px;border:1px solid #bbb;border-radius:10px;resize:vertical;';
        if (q.help) {
          input.placeholder = q.help;
          const help = document.createElement('div');
          help.textContent = q.help;
          help.style.cssText = 'font-size:.88rem;opacity:.72;margin-top:5px;';
          wrap.append(label, input, help);
        } else wrap.append(label, input);
        fields.set(q.id, input);
        card.appendChild(wrap);
      });

      const err = document.createElement('div');
      err.style.cssText = 'min-height:20px;color:#a32020;font-size:.9rem;margin-bottom:8px;';
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;';
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = 'Cancel';
      cancel.style.cssText = 'padding:10px 14px;border-radius:9px;border:1px solid #aaa;background:#fff;';
      const submit = document.createElement('button');
      submit.type = 'button'; submit.textContent = 'Use these answers and build';
      submit.style.cssText = 'padding:10px 14px;border-radius:9px;border:0;background:#111;color:#fff;font-weight:700;';
      actions.append(cancel, submit); card.append(err, actions); root.appendChild(card); document.body.appendChild(root);

      const first = fields.values().next().value; setTimeout(() => first?.focus(), 0);
      cancel.addEventListener('click', () => closeModal(root, null, resolve));
      submit.addEventListener('click', () => {
        const result = {};
        for (const [id, input] of fields) {
          const value = String(input.value || '').trim();
          if (!value) { err.textContent = 'Please answer each question so I can avoid guessing.'; input.focus(); return; }
          result[id] = value;
        }
        closeModal(root, result, resolve);
      });
    });
  }

  window.fetch = async function(input, init = {}) {
    if (!isBuildRequest(input, init)) return nativeFetch(input, init);
    let body = safeParse(init.body);
    if (!body?.intake) return nativeFetch(input, init);
    let response = await nativeFetch(input, init);

    for (let round = 0; round < MAX_ROUNDS && response.status === 422; round++) {
      const payload = await response.clone().json().catch(() => null);
      if (!payload?.clarification_required || !Array.isArray(payload.clarifications)) break;
      const newAnswers = await askQuestions(payload.clarifications);
      if (!newAnswers) return response;
      body = {
        ...body,
        intake: {
          ...body.intake,
          clarification_answers: {
            ...(body.intake.clarification_answers || {}),
            ...newAnswers,
          },
        },
      };
      response = await nativeFetch(input, { ...init, body: JSON.stringify(body) });
    }
    return response;
  };
})();
