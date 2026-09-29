/**
 * Who is making the current request, for the change log. Set once when the
 * staff check passes (lib/staff.ts) and read by logEvent, so every live-session
 * change records the staff member's email instead of just "admin".
 */
import { AsyncLocalStorage } from 'node:async_hooks'

const store = new AsyncLocalStorage<string>()

export const setActor = (who: string) => store.enterWith(who)
export const currentActor = () => store.getStore()
