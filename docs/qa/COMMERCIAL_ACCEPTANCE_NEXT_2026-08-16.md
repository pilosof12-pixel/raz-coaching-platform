# Commercial acceptance — next execution order

The Tactical coaching live-generation gate is now closed. The remaining work is commercial behavior and device acceptance.

## Priority order

1. **Second-personal-code protection**
   - Reuse a completed Program Pass against a fresh browser/token context.
   - Expected: no second entitlement/personal code and no AI call.

2. **Lost-first-response recovery**
   - Activate a fresh Program Pass and deliberately discard the browser response before saving the returned personal code.
   - Re-enter the same pass.
   - Expected: recover the same entitlement/personal code path without creating another initial block or consuming another pass.

3. **Adjustment allowance**
   - Run substantive adjustments 1 through 6.
   - Expected: each successful persisted adjustment decrements remaining allowance exactly once.
   - Submit adjustment 7.
   - Expected: rejected before an AI call.

4. **Failed-adjustment non-consumption**
   - Force or observe a failed adjustment before persistence.
   - Expected: remaining allowance unchanged.

5. **Language switching**
   - Switch English/Hebrew in both directions.
   - Expected: no adjustment allowance consumed.

6. **Status UI**
   - Verify expiry timestamp and remaining-adjustment count after the preceding actions.

7. **Spreadsheet after adjustment**
   - Export after at least one successful substantive adjustment.
   - Expected: latest persisted program is exported, not the initial stale block.

8. **Delete My Data under enforcement ON**
   - Delete coaching data after a successful paid block.
   - Expected: coaching data becomes unretrievable while the commercial entitlement remains and cannot create a fresh block credit.

9. **Expiry + grace cleanup**
   - Use controlled test timestamps / staging fixtures rather than waiting 56 days.
   - Expected: return access denied after expiry; post-grace cleanup removes coaching content while retaining entitlement/audit state required for commercial enforcement.

10. **Real-device UX**
    - Verify the intake, generated-program tables, Program Pass status and spreadsheet path on a real iPhone.

## Production-secret boundary

Before broad paid launch, independently verify in Render that `SUPABASE_SERVICE_ROLE_KEY` exists only server-side and rotate the previously exposed admin provisioning secret. These cannot be inferred from repository code or GitHub CI.

## Merge boundary

PR #15 stays unmerged until the Program Pass acceptance matrix, production-secret verification and real-device UX checks above are complete.
