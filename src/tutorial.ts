/**
 * Derby Dash tutorial: one list of steps, run by a tiny engine.
 *
 * Adding a feature? Append a step to STEPS with `since: <new version>` and bump TUTORIAL_VERSION.
 * - New players (nothing seen yet) get every step, in order, the first time they press PLAY.
 * - Returning players who saw an older version get a short "What's new" with only the steps
 *   whose `since` is newer than what they saw.
 * Steps say where they happen (`where`): in a practice race, in the Magic Shop, or anywhere
 * (a tip card). The engine opens the practice race / the shop as needed.
 * A step advances when `done(ctx)` returns true (the player actually did it), or, if it has
 * no `done`, when the player presses Next.
 */
import { ABILITIES, abilityDef, type AbilityId, type Save } from './abilities'
import { ABILITY } from './config'
import type { Race } from './race'

/** Bump this whenever you append steps for a new feature. */
export const TUTORIAL_VERSION = 2
export const TUTORIAL_KEY = 'derby.tutorial'

export interface TutCtx {
  race: Race | null
  save: Save
  mobile: boolean
  /** Seconds since this step started. */
  t: number
  /** Scratch space for the current step (cleared on every step). */
  data: Record<string, number>
  /** Give the player coins (tutorial grant). */
  grant(coins: number): void
}

export interface TutStep {
  id: string
  /** Tutorial version that introduced this step. */
  since: number
  where: 'race' | 'shop' | 'any'
  title: string
  /** Text, or a function of the context (desktop/phone wording, live numbers). */
  text: string | ((c: TutCtx) => string)
  setup?(c: TutCtx): void
  /** Returns true once the player did the thing. No `done` = a tip with a Next button. */
  done?(c: TutCtx): boolean
  /** Label for the Next button (tips only). */
  next?: string
  /** Also offer Next on a do-it step (e.g. nothing left to buy on a replay). */
  canNext?(c: TutCtx): boolean
  /** Runs every frame while the step is shown. */
  tick?(c: TutCtx): void
}

const dummies = (c: TutCtx) => (c.race ? c.race.horses.filter((h) => h.dummy) : [])
const exploded = (c: TutCtx) => dummies(c).reduce((n, h) => n + h.timesExploded, 0)
const key = (c: TutCtx, desk: string, phone: string) => (c.mobile ? phone : desk)
const owned = (c: TutCtx) => Object.values(c.save.owned).filter(Boolean).length
const cheapest = () => Math.min(...ABILITIES.map((a) => a.price))

export const STEPS: TutStep[] = [
  // ---- v1: the basics ----
  {
    id: 'move', since: 1, where: 'race', title: 'Gallop!',
    text: (c) => key(c,
      'Press and <b>drag</b> anywhere with the mouse: your horse runs toward where you drag. A longer drag is faster, let go to stop. (Or use <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>.)',
      'Put your finger down anywhere and <b>drag</b>: your horse runs toward where you drag. A longer drag is faster, lift your finger to stop.'),
    done: (c) => !!c.race && c.race.player.progress > 250 + (c.data.p0 ?? 0),
    setup: (c) => { if (c.race) c.data.p0 = c.race.player.progress },
  },
  {
    id: 'arrow', since: 1, where: 'race', title: 'Follow the arrow',
    text: 'The <b>arrow</b> by your horse points along the track. Keep following it around the bends. Bumping the fence slows you down.',
    setup: (c) => { if (c.race) c.data.p0 = c.race.player.progress },
    done: (c) => !!c.race && c.race.player.progress > 900 + (c.data.p0 ?? 0),
  },
  {
    id: 'ram', since: 1, where: 'race', title: 'Ram from behind 💥',
    text: 'A practice horse is standing ahead. Run into it <b>from behind</b> to blow it up!',
    setup: (c) => {
      const r = c.race; if (!r) return
      const d = dummies(c)
      if (d[0]) r.placeAhead(d[0], 380, 0)
      if (d[1]) r.placeAhead(d[1], -2000, 0)
      c.data.n0 = exploded(c)
    },
    // Missed it? Put it back in front of you.
    tick: (c) => {
      const r = c.race, d = dummies(c)[0]
      if (r && d && d.state === 'normal' && d.progress < r.player.progress - 120 && c.t > 1) r.placeAhead(d, 300, 0)
    },
    done: (c) => exploded(c) > (c.data.n0 ?? 0),
  },
  {
    id: 'headon', since: 1, where: 'any', title: 'Head-on = both explode',
    text: 'Nice! Hitting a horse <b>from behind</b> only blows <i>them</i> up. Crash into one <b>head-on</b> and you <b>both</b> explode, so watch out for horses coming the other way.',
    next: 'Got it',
  },
  {
    id: 'boost', since: 1, where: 'race', title: 'Catch-up boost 🚀',
    text: 'Ouch, you got blown up! When you land and get up again, you get a short <b>speed boost</b> to catch up. Look for the sparks.',
    setup: (c) => { const r = c.race; if (r && r.player.state === 'normal') r.blastHorse(r.player) },
    done: (c) => !!c.race && c.race.player.state === 'normal' && c.race.player.boostTimer > 0 && c.t > 0.5,
  },
  {
    id: 'lap', since: 1, where: 'race', title: 'Finish the lap 🏁',
    text: 'Races are a few laps. Your <b>lap</b> and <b>place</b> (POS) are at the top left. Finish 1st for the most coins, and every horse you blow up pays a bonus. Finish this lap to continue!',
    done: (c) => !!c.race && c.race.player.finished,
  },
  {
    id: 'coins', since: 1, where: 'shop', title: 'Coins & the Magic Shop ✨',
    text: (c) => `You earn <b>coins</b> from every race. Spend them in the <b>Magic Shop</b> on abilities. Here are some coins to start: you have <b>${c.save.coins}</b> 🪙. Tap <b>Unlock</b> on any ability you can afford.`,
    setup: (c) => {
      c.data.own0 = owned(c)
      if (c.save.coins < cheapest() && c.data.own0 < ABILITIES.length) c.grant(cheapest() * 2 - c.save.coins)
    },
    done: (c) => owned(c) > (c.data.own0 ?? 0),
    canNext: (c) => (c.data.own0 ?? 0) > 0,
  },
  {
    id: 'equip', since: 1, where: 'shop', title: 'Equip it',
    text: (c) => {
      const id = c.save.equipped.find(Boolean)
      return id
        ? `<b>${abilityDef(id).icon} ${abilityDef(id).name}</b> is <b>equipped</b>: you take it into every race. To swap, tap <b>Equip</b> on another ability you own.`
        : 'Tap <b>Equip</b> on the ability you bought to take it into races.'
    },
    done: (c) => c.save.equipped.some(Boolean) && c.t > 6,
    canNext: (c) => c.save.equipped.some(Boolean),
  },
  {
    id: 'use', since: 1, where: 'race', title: 'Use your ability',
    text: (c) => {
      const id = c.race?.slots[0] as AbilityId | undefined
      const extra = id === 'papaya' ? ' Then <b>tap the track</b> where it should land.' : id === 'grapple' ? ' (The hook needs a horse close enough.)' : ''
      return key(c, `Press <kbd>E</kbd> or <kbd>1</kbd> (or click the button at the bottom right) to use your ability.${extra}`, `Tap the <b>ability button</b> at the bottom right to use it.${extra}`)
    },
    setup: (c) => {
      const r = c.race; if (!r) return
      const d = dummies(c)
      d.forEach((h, k) => r.placeAhead(h, 260 + k * 60, k ? 30 : -30))
    },
    done: (c) => !!c.race && (c.race.cooldowns[0] ?? 0) > 0,
    canNext: (c) => !c.race?.slots[0],
  },
  {
    id: 'cooldown', since: 1, where: 'race', title: 'Cooldowns ⏳',
    text: (c) => {
      const cd = c.race?.cooldowns[0] ?? 0
      return `After you use it, the ability <b>recharges</b>: the button fills back up and glows when ready. Use it as often as you like!${cd > 0 ? ` <span class="tut-cd">Ready in ${Math.ceil(cd)}s</span>` : ' <b>Ready again!</b>'}`
    },
    next: 'Next',
  },
  // ---- v2 (v7 update): new abilities ----
  {
    id: 'emp', since: 2, where: 'any', title: 'New: EMP ⚡',
    text: `<b>EMP</b> zaps every horse around you: they're stunned for ${ABILITY.empStunSeconds}s, then slowed to ${Math.round(ABILITY.empSlowMul * 100)}% speed for ${ABILITY.empSlowSeconds}s. You're immune.`,
    next: 'Next',
  },
  {
    id: 'hay', since: 2, where: 'any', title: 'New: Orbiting Hay 🌾',
    text: `<b>Orbiting Hay</b>: ${ABILITY.hayBundles} sharp hay bundles circle you for ${ABILITY.haySeconds}s. Each one that hits a horse slows it for ${ABILITY.haySlowSeconds}s, and all 3 hits stack!`,
    next: 'Next',
  },
  {
    id: 'papaya', since: 2, where: 'any', title: 'New: Papaya-Bomb 🥭',
    text: (c) => `<b>Papaya-Bomb</b>: use it, then ${c.mobile ? 'tap' : 'click'} on the track to throw. It flies for ${ABILITY.papayaFlight}s and blows up every horse in a big circle. Press the button again to cancel.`,
    next: 'Next',
  },
  {
    id: 'grapple2', since: 2, where: 'any', title: 'Changed: Grappling Hook 🪝',
    text: 'The hook now has a <b>shorter range</b> and only grabs horses you can reach along the track. The hooked horse explodes only when it gets <b>pulled all the way to you</b>.',
    next: 'Next',
  },
  // ---- always last for new players ----
  {
    id: 'done', since: 1, where: 'any', title: "You're ready! 🏆",
    text: 'That\'s everything. Replay this any time with the <b>Tutorial</b> button on the main menu. Good luck!',
    next: "Let's race!",
  },
]

/** What the player has seen: 0 = never played. */
export function seenVersion(): number {
  const v = Number(localStorage.getItem(TUTORIAL_KEY))
  if (v > 0) return v
  // Players from before the tutorial existed (they already have a save) know the basics.
  return localStorage.getItem('derby.save') ? 1 : 0
}
export function markSeen() { localStorage.setItem(TUTORIAL_KEY, String(TUTORIAL_VERSION)) }

/** Steps for a full run (seen = 0) or a "What's new" run (only steps newer than `seen`). */
export function stepsFor(seen: number): TutStep[] {
  if (seen <= 0) return STEPS
  return STEPS.filter((s) => s.since > seen)
}

/** Runs a list of steps. The game calls update() every frame and listens to the callbacks. */
export class Tutorial {
  i = -1
  t = 0
  data: Record<string, number> = {}
  constructor(public steps: TutStep[], public whatsNew: boolean) {}
  get step(): TutStep | null { return this.steps[this.i] ?? null }
  get finished() { return this.i >= this.steps.length }

  /** Move to the next step. Returns the new step (null when finished). Caller then runs setup. */
  advance(): TutStep | null {
    this.i++; this.t = 0; this.data = {}
    return this.step
  }
}
