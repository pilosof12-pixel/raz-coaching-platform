(function () {
  const byId = (id) => document.getElementById(id);

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

  syncSpecificLiftingDays();
  assertGoalStepPrecedesMarkers();
})();
