// ============================================================================
// settleRelease — pay out the releaser once a replacement has actually paid.
//
// PHASE 3 SCOPE (this file): a no-op stub so the claim success path has a real
// function to call. It performs NO money movement and does NOT mark the release
// settled (resolved_at stays null), so Phase 4 can still settle it for real.
//
// PHASE 4 replaces the body with the credit/card settlement logic, guarded on
// releases.resolved_at for idempotency under duplicate webhooks. Signature stable.
// ============================================================================
export async function settleRelease(releaseId: string): Promise<void> {
  console.log('[settlement] settleRelease called (Phase 4 will pay out):', releaseId)
}
