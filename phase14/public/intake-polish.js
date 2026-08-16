(function () {
  const byId = (id) => document.getElementById(id);
  let lastBuildJobId = '';

  function syncSpecificLiftingDays() {
    const group = byId('gym-availability-choice');
    const mode = byId('gym_availability_mode');
    const panel = byId('gym-availability-details');
    if (!group || !mode || !panel) return;

    const sync = () => {
      const limited = String(mode.value || '').toLowerCase() === 'limited';
      panel.classList.toggle('hidden', !limited);
      panel.setAttribute('aria-hidden', limited ? 'false' : 'true');
    };

    group.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        // app.js updates the hidden field first; run after that listener.
        queueMicrotask(sync);
      });
    });
    sync();
  }

  function assertGoalStepPrecedesMarkers() {
    const goal = byId('goal_primary_1');
    const markers = byId('performance-block');
    if (!goal || !markers) return;
    const goalStep = goal.closest('.wizard-step');
    const markerStep = markers.closest('.wizard-step');
    if (!goalStep || !markerStep) return;
    const goalIndex = Number(goalStep.dataset.step);
    const markerIndex = Number(markerStep.dataset.step);
    if (!(goalIndex < markerIndex)) {
      console.error('RAZ intake order regression: goals must precede current performance markers.');
    }
  }

  function installBuildSupportReference() {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init) {
      const response = await originalFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : String(input?.url || '');
        const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
        if (method === 'POST' && /\/api\/build(?:$|\?)/.test(url)) {
          const payload = await response.clone().json();
          const id = payload?.job_id || payload?.jobId || payload?.id || payload?.job?.id || '';
          if (id) lastBuildJobId = String(id);
        }
      } catch (_) {}
      return response;
    };

    const status = byId('build-status');
    if (!status) return;
    const observer = new MutationObserver(() => {
      const text = String(status.textContent || '');
      if (!lastBuildJobId || !/Internal coaching QA could not repair|unusable result after multiple attempts/i.test(text)) return;
      if (/Support reference:/i.test(text)) return;
      status.textContent = `${text} Support reference: ${lastBuildJobId}`;
    });
    observer.observe(status, { childList: true, subtree: true, characterData: true });
  }

  syncSpecificLiftingDays();
  assertGoalStepPrecedesMarkers();
  installBuildSupportReference();
})();
