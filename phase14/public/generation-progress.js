(function () {
  const buildStatus = document.getElementById('build-status');
  const buildBtn = document.getElementById('build-btn');
  if (!buildStatus || !buildBtn) return;

  const wrap = document.createElement('div');
  wrap.id = 'generation-progress';
  wrap.className = 'generation-progress hidden';
  wrap.setAttribute('aria-live', 'polite');
  wrap.innerHTML = [
    '<div class="generation-progress-head">',
    '  <strong>Building your program</strong>',
    '  <span id="generation-progress-time">0s</span>',
    '</div>',
    '<div class="generation-progress-steps">',
    '  <div class="generation-step" data-stage="preparing"><span>1</span><b>Understand goals & week</b></div>',
    '  <div class="generation-step" data-stage="generating"><span>2</span><b>Build the 4-week block</b></div>',
    '  <div class="generation-step" data-stage="validating"><span>3</span><b>Run coaching quality checks</b></div>',
    '  <div class="generation-step" data-stage="refining"><span>4</span><b>Refine if needed</b></div>',
    '  <div class="generation-step" data-stage="finalizing"><span>5</span><b>Save & finalize</b></div>',
    '</div>',
    '<div id="generation-progress-detail" class="generation-progress-detail">Reading your intake…</div>',
  ].join('');
  buildStatus.parentNode.insertBefore(wrap, buildStatus);

  const timeEl = document.getElementById('generation-progress-time');
  const detailEl = document.getElementById('generation-progress-detail');
  const steps = Array.from(wrap.querySelectorAll('.generation-step'));
  const order = ['preparing', 'generating', 'validating', 'refining', 'finalizing'];
  let startedAt = 0;
  let timer = null;

  function inferStage(text) {
    const t = String(text || '').toLowerCase();
    if (/done|program is ready|program is below/.test(t)) return 'done';
    if (/finaliz|saving/.test(t)) return 'finalizing';
    if (/refin|quality check failed|repair/.test(t)) return 'refining';
    if (/quality|validat|check/.test(t)) return 'validating';
    if (/building the training block|building your program|training block/.test(t)) return 'generating';
    if (/reading|mapping|queued|prepar|goals|constraints/.test(t)) return 'preparing';
    return null;
  }

  function publicDetail(stage) {
    if (stage === 'preparing') return 'Reading your goals, schedule, sport load and constraints.';
    if (stage === 'generating') return 'Building the four-week training structure and prescriptions.';
    if (stage === 'validating') return 'Checking progression, recovery, exercise selection and weekly stress.';
    if (stage === 'refining') return 'A quality check requested a refinement. Keeping valid work and correcting the remaining issue.';
    if (stage === 'finalizing') return 'Quality checks passed. Saving and preparing your finished program.';
    if (stage === 'done') return 'Program ready.';
    return 'Working on your program…';
  }

  function paint(stage) {
    const current = stage === 'done' ? order.length : order.indexOf(stage);
    steps.forEach((el, i) => {
      el.classList.toggle('complete', stage === 'done' || (current >= 0 && i < current));
      el.classList.toggle('active', stage !== 'done' && current === i);
    });
    detailEl.textContent = publicDetail(stage);
  }

  function start() {
    if (!startedAt) startedAt = Date.now();
    wrap.classList.remove('hidden');
    paint('preparing');
    if (!timer) {
      timer = setInterval(() => {
        const secs = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
        timeEl.textContent = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
      }, 1000);
    }
  }

  function stop(success) {
    if (timer) clearInterval(timer);
    timer = null;
    if (success) paint('done');
    startedAt = 0;
  }

  const observer = new MutationObserver(() => {
    const text = buildStatus.textContent || '';
    if (buildBtn.disabled) start();
    const stage = inferStage(text);
    if (stage) paint(stage);
    if (!buildBtn.disabled && stage === 'done') stop(true);
    if (!buildBtn.disabled && buildStatus.classList.contains('err')) stop(false);
  });
  observer.observe(buildStatus, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });

  buildBtn.addEventListener('click', () => setTimeout(start, 0));
})();
