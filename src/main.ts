import { ABILITIES, buy, equip, loadSave, raceReward, storeSave, type AbilityId } from './abilities'
import { Audio } from './audio'
import { ABILITY, HORSE, RACE, TRACK } from './config'
import { NEWS, STEPS, TUTORIAL_KEY, TUTORIAL_VERSION, Tutorial, initSeen, markSeen, newsFor, seenVersion, type NewsItem, type TutCtx } from './tutorial'
import { Effects } from './effects'
import { Input } from './input'
import { boostMul, slowMul } from './horse'
import { Pen } from './pen'
import { fromAngle, wrapAngle } from './math'
import { Race } from './race'
import { Renderer } from './render'
import { locate, sample } from './track'
import { UI, type Screen } from './ui'

const canvas = document.getElementById('view') as HTMLCanvasElement
const renderer = new Renderer(canvas)
const input = new Input(canvas)
const audio = new Audio()
const fx = new Effects()
const ui = new UI()
const params = new URLSearchParams(location.search)
const debug = params.has('debug')

let screen: Screen = 'menu'
let race: Race | null = null
let menuRace = new Race(fx, audio) // drives the animated backdrop behind the menu
let doneTimer = 0
let rewarded = false
let overview = false // debug: show the whole track

let save = loadSave()
const pen = new Pen(document.getElementById('pen') as HTMLCanvasElement, audio)
window.addEventListener('resize', () => pen.resize())

function refreshShop(flash?: AbilityId) {
  ui.renderShop(save, (id) => {
    audio.unlock()
    if (buy(save, id)) { audio.coin(); audio.chime(); refreshShop(id); ui.updateWallet(save, true) }
    else audio.bump(0.3)
  }, (id) => { equip(save, id, 0); audio.chime(); refreshShop() }, flash)
}
ui.updateWallet(save)

input.onGesture = () => audio.unlock()
audio.setMuted(localStorage.getItem('derby.muted') === '1')
ui.setMuted(audio.muted)

function setScreen(s: Screen) {
  screen = s
  ui.show(s)
  if (s === 'menu') { ui.updateWallet(save); requestAnimationFrame(() => pen.resize()) }
  if (s === 'shop') refreshShop()
  input.enabled = s === 'race'
  if (s !== 'race') input.reset()
}

function startRace() {
  audio.unlock()
  fx.clear()
  const laps = Number(params.get('laps')) || RACE.laps
  const rivals = params.has('rivals') ? Number(params.get('rivals')) : -1
  race = new Race(fx, audio, laps, rivals)
  // Take the equipped ability into the race (unlimited uses, on a cooldown).
  save = loadSave()
  race.setSlots(save.equipped)
  if (params.get('botab') === '0') race.botAbilities = false
  rewarded = false
  ui.resetAbilityBar()
  renderer.snapCamera(race.player)
  doneTimer = 0
  setScreen('race')
}

function toMenu() {
  closeTutorial()
  race = null
  fx.clear()
  menuRace = new Race(fx, audio)
  setScreen('menu')
}

// ---- Tutorial ------------------------------------------------------------
// The steps live in tutorial.ts. First PLAY ever = the full tutorial. After an update
// (TUTORIAL_VERSION went up), a returning player sees ONE scrollable "What's new" panel on the
// menu as soon as the game opens (never from PLAY). ?debug turns both off (so tests are not
// interrupted) unless &tutorial (full tutorial on PLAY) or &whatsnew[=seenVersion] is given.
const mobile = matchMedia('(pointer: coarse)').matches
let tut: Tutorial | null = null
let tutFromPlay = false
let tutForce = params.has('tutorial')
const tutEl = document.getElementById('tutorial') as HTMLElement
const tutTitle = document.getElementById('tutTitle') as HTMLElement
const tutText = document.getElementById('tutText') as HTMLElement
const tutCount = document.getElementById('tutCount') as HTMLElement
const tutBadge = document.getElementById('tutBadge') as HTMLElement
const tutNext = document.getElementById('tutNext') as HTMLButtonElement
const appEl = document.getElementById('app') as HTMLElement

function tutCtx(): TutCtx {
  return {
    race, save, mobile, t: tut?.t ?? 0, data: tut?.data ?? {},
    grant: (n) => { save = loadSave(); save.coins += n; storeSave(save); ui.updateWallet(save, true); refreshShop(); audio.coin() },
  }
}

/** A short, wide, 1-lap practice race: no countdown, no rival abilities, two standing dummies. */
function startPractice() {
  audio.unlock()
  fx.clear()
  race = new Race(fx, audio, 1, 2, { kind: 'hull', halfWidth: TRACK.maxHalfWidth })
  save = loadSave()
  race.setSlots(save.equipped)
  race.botAbilities = false
  race.tutorial = true
  race.countdown = 0.001
  race.horses.filter((h) => !h.isPlayer).forEach((h, k) => { h.dummy = true; race!.placeAhead(h, -900 - k * 500, k ? 40 : -40) })
  rewarded = true // practice pays nothing
  ui.resetAbilityBar()
  renderer.snapCamera(race.player)
  doneTimer = 0
  setScreen('race')
}

function startTutorial(fromPlay: boolean) {
  audio.unlock()
  closeNews(false)
  tut = new Tutorial(STEPS)
  tutFromPlay = fromPlay
  tutBadge.textContent = 'TUTORIAL'
  tutEl.hidden = false
  nextTutStep()
}

function nextTutStep() {
  if (!tut) return
  const st = tut.advance()
  if (!st) { endTutorial(true); return }
  if (st.where === 'race' && (screen !== 'race' || !race?.tutorial || race.player.finished)) startPractice()
  if (st.where === 'shop' && screen !== 'shop') setScreen('shop')
  appEl.dataset.tut = st.where === 'shop' ? 'shop' : st.where
  appEl.dataset.tutstep = st.id
  st.setup?.(tutCtx())
  tutCount.textContent = `${tut.i + 1}/${tut.steps.length}`
  tutTitle.textContent = st.title
  renderTutText(true)
  audio.chime()
}

let tutHtml = ''
function renderTutText(force = false) {
  const st = tut?.step
  if (!st) return
  const c = tutCtx()
  const html = typeof st.text === 'function' ? st.text(c) : st.text
  if (force || html !== tutHtml) { tutText.innerHTML = html; tutHtml = html }
  const showNext = !st.done || !!st.canNext?.(c)
  tutNext.hidden = !showNext
  tutNext.textContent = st.next ?? 'Next'
}

/** Completed or skipped: remember it and carry on (to the real race if they came from PLAY). */
function endTutorial(completed: boolean) {
  if (!tut) return
  markSeen()
  tut = null
  tutEl.hidden = true
  delete appEl.dataset.tut
  delete appEl.dataset.tutstep
  if (completed || tutFromPlay) startRace()
  else toMenu()
}

/** Leaving to the menu mid-tutorial (pause → Menu) just closes it; it will show again next PLAY. */
function closeTutorial() {
  tut = null
  tutEl.hidden = true
  delete appEl.dataset.tut
  delete appEl.dataset.tutstep
}

function tutFrame(dt: number) {
  if (!tut?.step) return
  if (screen === 'pause' || screen === 'results') return
  tut.t += dt
  const c = tutCtx()
  tut.step.tick?.(c)
  if (tut.step.done?.(c)) { nextTutStep(); return }
  renderTutText()
}

ui.on('tutNext', () => { if (tut?.step) nextTutStep() })
ui.on('tutSkip', () => endTutorial(false))
ui.on('btnTutorial', () => startTutorial(false))

// ---- What's new: one scrollable panel on the menu, shown on load after an update ----
const newsEl = document.getElementById('whatsNew') as HTMLElement
const newsList = document.getElementById('newsList') as HTMLElement
let newsShown: NewsItem[] = []
function openNews(items: NewsItem[]) {
  if (!items.length) return
  newsShown = items
  newsList.innerHTML = items.map((n) => `<li data-id="${n.id}"><span class="ni">${n.icon}</span><div><b>${n.title}</b><p>${n.text}</p></div></li>`).join('')
  newsList.scrollTop = 0
  newsEl.hidden = false
}
/** Close the panel; `seen` = remember it (OK / ✕). */
function closeNews(seen = true) {
  if (newsEl.hidden) return
  newsEl.hidden = true
  newsShown = []
  if (seen) markSeen()
}
ui.on('newsOk', () => { audio.unlock(); closeNews() })
ui.on('newsClose', () => { audio.unlock(); closeNews() })
newsEl.addEventListener('click', (e) => { if (e.target === newsEl) closeNews() })
{
  initSeen()
  const seen = seenVersion()
  if (params.has('whatsnew')) openNews(newsFor(Number(params.get('whatsnew')) || Math.max(1, Math.min(seen, TUTORIAL_VERSION - 1))))
  else if (!debug && seen > 0 && seen < TUTORIAL_VERSION) openNews(newsFor(seen))
}

function play() {
  // PLAY never shows What's new: if the panel is still open, PLAY just closes it (seen) and races.
  closeNews()
  if (tutForce) { tutForce = false; startTutorial(true); return }
  if (!debug && seenVersion() === 0) { startTutorial(true); return }
  startRace()
}

ui.on('btnPlay', play)
ui.on('btnShopPlay', play)
ui.on('btnShop', () => { audio.unlock(); setScreen('shop') })
ui.on('menuEquipped', () => { audio.unlock(); setScreen('shop') })
ui.on('btnShopBack', () => setScreen('menu'))

function useSlot(i: number) {
  if (screen !== 'race' || !race) return
  audio.unlock()
  ui.flashSlot(i)
  race.useSlot(i)
}

/** Pay out coins once per race: by place, plus a bonus per rival you blew up. */
function finishRace(r: Race) {
  r.phase = 'done'
  const place = r.placeOf(r.player)
  const rw = raceReward(place, r.player.kills)
  if (!rewarded) { save = loadSave(); save.coins += rw.total; storeSave(save); rewarded = true }
  ui.showResults(r, { ...rw, kills: r.player.kills, coins: save.coins })
  audio.coin()
}
ui.on('btnAgain', startRace)
ui.on('btnRestart', startRace)
ui.on('btnMenu', toMenu)
ui.on('btnPauseMenu', toMenu)
ui.on('btnPause', () => { if (screen === 'race') setScreen('pause') })
ui.on('btnResume', () => { if (race) setScreen('race') })
ui.on('btnMute', () => {
  audio.unlock()
  audio.setMuted(!audio.muted)
  ui.setMuted(audio.muted)
  localStorage.setItem('derby.muted', audio.muted ? '1' : '0')
})
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
    if (screen === 'race') setScreen('pause')
    else if (screen === 'pause') setScreen('race')
  }
  // Ability slots: E or 1 = slot 1, 2..n = further slots. (Not WASD/arrows.)
  if (screen === 'race' && !e.repeat) {
    const k = e.key.toLowerCase()
    if (k === 'e') { e.preventDefault(); useSlot(0) }
    else if (/^[1-9]$/.test(k) && Number(k) <= (race?.slots.length ?? 0)) { e.preventDefault(); useSlot(Number(k) - 1) }
  }
})
document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'race') setScreen('pause') })
// Stop iOS double-tap zoom / pinch during play.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (screen === 'race' && race) {
    // Fixed small sub-steps keep fast collisions reliable.
    const steps = Math.ceil(dt / (1 / 120))
    // Papaya aim: the next tap/click on the track is the throw target.
    input.aimMode = race.aiming >= 0
    for (const t of input.takeAimTaps()) if (race.aiming >= 0) race.throwAt(renderer.toWorld(t.x, t.y))
    if (race.aiming < 0) input.takeAimTaps()
    for (let i = 0; i < steps; i++) race.update(dt / steps, input)
    fx.update(dt)
    renderer.updateCamera(race.player, dt)
    if (overview) {
      const b = race.track.bounds
      renderer.cam.x = (b.minX + b.maxX) / 2; renderer.cam.y = (b.minY + b.maxY) / 2
      renderer.cam.zoom = Math.min(window.innerWidth / (b.maxX - b.minX + 200), window.innerHeight / (b.maxY - b.minY + 200))
    }
    if (race.winner && race.tutorial) {
      // Practice race: no results screen; the tutorial moves on.
    } else if (race.winner) {
      doneTimer += dt
      // You win: a short victory lap. A bot wins: straight to the "You lose" screen.
      if (!race.winner.isPlayer || doneTimer > RACE.finishLinger) { finishRace(race); screen = 'results'; input.enabled = false }
    }
    ui.updateHud(race)
    ui.updateAbilityBar(race, useSlot)
  } else if (screen === 'menu') {
    // Idle flyover of a fresh track behind the menu.
    const t = now / 1000
    const at = sample(menuRace.track, t * 160)
    renderer.cam.x = at.p.x; renderer.cam.y = at.p.y
    renderer.cam.zoom = Math.min(window.innerWidth, window.innerHeight) / 700
    pen.update(dt)
    pen.draw()
  } else if (screen === 'results' && race) {
    // Keep the world alive behind the results card.
    race.update(dt, input)
    fx.update(dt)
    renderer.updateCamera(race.player, dt)
  }
  tutFrame(dt)
  const r = race ?? menuRace
  const aiming = screen === 'race' && !!race && race.aiming >= 0
  const nadeAim = aiming && race!.slots[race!.aiming] === 'nade'
  const range = nadeAim ? ABILITY.nadeRange : ABILITY.papayaRange
  const aim = aiming ? { range, radius: nadeAim ? ABILITY.nadeRadius : ABILITY.papayaRadius, electric: nadeAim, at: input.hover ? r.abilities.clampThrow(r.player, renderer.toWorld(input.hover.x, input.hover.y), range) : null } : null
  renderer.draw({ aim, track: r.track, horses: r.horses, player: r.player, fx, drag: input.drag, maxDrag: input.maxDrag, time: now / 1000, showArrow: screen === 'race', items: r.abilities.items })
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ---- Test / debug hooks -------------------------------------------------
declare global { interface Window { __horse: unknown } }
window.__horse = {
  snapshot: () => {
    const r = race
    return {
      screen,
      phase: r?.phase,
      time: r?.time,
      trackLength: r?.track.length,
      winner: r?.winner ? r.winner.id : -1,
      trackKind: r?.track.kind,
      trackSolidity: r?.track.solidity,
      trackHalfWidth: r?.track.halfWidth,
      trackPts: r ? r.track.pts.filter((_, i) => i % 6 === 0).map((p) => [Math.round(p.x), Math.round(p.y)]) : null,
      laps: r?.laps,
      beeping: audio.beeping,
      beepCount: audio.beepCount,
      particles: fx.particles.length,
      flash: fx.flash,
      save: { ...save, owned: { ...save.owned }, equipped: [...save.equipped] },
      drag: { ...input.drag }, maxDrag: input.maxDrag,
      slots: r?.slots, cooldowns: r ? [...r.cooldowns] : null, aiming: r ? r.aiming : -1, grappleRange: ABILITY.grappleRange, aimMode: input.aimMode,
      cam: { ...renderer.cam }, view: { w: window.innerWidth, h: window.innerHeight },
      items: r?.abilities.items.map((it) => ({ kind: it.kind, owner: it.owner, t: it.t, ...('pos' in it ? { x: it.pos.x, y: it.pos.y } : {}), ...(it.kind === 'hook' ? { target: it.target, done: it.done, result: it.result } : {}), ...('to' in it ? { tx: it.to.x, ty: it.to.y, done: it.done } : {}), ...('pts' in it ? { pts: it.pts.map((q) => [q.x, q.y]) } : {}), ...('hits' in it ? { hits: it.hits } : {}), ...('vel' in it ? { vx: it.vel.x, vy: it.vel.y } : {}), ...(it.kind === 'robot' ? { s: it.s, lat: it.lat, speed: it.speed, target: it.target, life: it.life } : {}), ...(it.kind === 'banana' ? { r: it.r } : {}), ...(it.kind === 'nade' ? { links: it.links.map((l) => ({ ...l })), life: it.life } : {}) })),
      used: r ? { ...r.abilities.used } : null,
      pen: pen.debug(),
      tutorial: tut ? { step: tut.step?.id ?? null, index: tut.i, count: tut.steps.length, ids: tut.steps.map((x) => x.id), next: !tutNext.hidden } : null,
      news: newsEl.hidden ? null : newsShown.map((n) => n.id), newsAll: NEWS.map((n) => ({ id: n.id, since: n.since })),
      tutorialSeen: seenVersion(), tutorialVersion: TUTORIAL_VERSION, tutorialAll: STEPS.map((x) => ({ id: x.id, since: x.since })),
      practice: !!r?.tutorial,
      shake: fx.shake,
      horses: r?.horses.map((h) => ({
        id: h.id, name: h.name, isPlayer: h.isPlayer, x: h.pos.x, y: h.pos.y, heading: h.heading,
        speed: h.fwdSpeed, state: h.state, stun: h.stunTimer, lap: h.lap, progress: h.progress,
        finished: h.finished, place: r.placeOf(h), mode: h.ctrl.mode,
        top: h.topSpeed, topTarget: h.topTarget, boost: h.boostTimer, bounces: h.bounces, z: h.z,
        dummy: h.dummy, exploded: h.timesExploded, kills: h.kills, spinOut: h.spinOutTimer, slow: h.slowTimer, empSlow: h.empSlowTimer, nadeSlow: h.nadeSlowTimer, rocket: h.rocketTimer, hay: [...h.haySlow], zap: h.zapTimer, knock: h.knockTimer, noBoost: h.noBoost, ability: h.ability, abilityCd: h.abilityCd, abilityFirstAt: h.abilityFirstAt, label: h.label ? h.label.text : null, hunting: h.ai.hunting, hunts: h.ai.huntsStarted, recover: h.recoverTimer,
      })),
    }
  },
  ...(debug ? {
    /** Wallet / inventory helpers for tests. */
    grantCoins: (n: number) => { save = loadSave(); save.coins += n; storeSave(save); ui.updateWallet(save); if (screen === 'shop') refreshShop() },
    /** Unlock an ability without paying. */
    grantAbility: (id: AbilityId) => {
      save = loadSave(); save.owned[id] = true; storeSave(save)
      ui.updateWallet(save); if (screen === 'shop') refreshShop()
    },
    equip: (id: AbilityId) => { save = loadSave(); save.owned[id] = true; equip(save, id, 0); if (race) { race.slots[0] = id; race.cooldowns[0] = 0 } ui.updateWallet(save); if (screen === 'shop') refreshShop() },
    /** Write a raw save (e.g. an old v5 save with charges) for migration tests. */
    rawSave: (obj: unknown) => { localStorage.setItem('derby.save', JSON.stringify(obj)); save = loadSave(); ui.updateWallet(save) },
    /** Skip the player's cooldowns. */
    readyAbility: () => { if (race) race.cooldowns = race.cooldowns.map(() => 0) },
    /** Give bot `id` ability `ab` (null = none) with its first use `firstAt` s after GO. */
    botAbility: (id: number, ab: AbilityId | null, firstAt = 0) => { if (!race) return; const h = race.horses[id]; h.ability = ab; h.abilityFirstAt = firstAt; h.abilityCd = 0 },
    /** Screen point of a world point (tests: click on the track). */
    toScreen: (x: number, y: number) => renderer.toScreen(x, y),
    /** Is the straight line between two horses on the track (hook line of sight)? */
    lineOnTrack: (a: number, b: number) => !!race && race.abilities.lineOnTrack(race.horses[a], race.horses[b]),
    /** Bot `id`: is there a papaya target? */
    papayaTarget: (id: number) => (race ? race.abilities.papayaTarget(race.horses[id]) : null),
    /** Bot `id`: where would it throw an Electricity-nade (null = no target)? */
    nadeTarget: (id: number) => (race ? race.abilities.nadeTarget(race.horses[id]) : null),
    speedMul: (id: number) => (race ? slowMul(race.horses[id]) : 1),
    /** Speed-up multiplier on horse `id` (catch-up boost / Rocket Hooves), 1 = none. */
    boostMul: (id: number) => (race ? boostMul(race.horses[id]) : 1),
    canHook: (id: number) => !!race && !!race.abilities.grappleTarget(race.horses[id]),
    /** Switch bot abilities on/off for the whole race. */
    botAbilitiesOn: (on: boolean) => { if (race) race.botAbilities = on },
    resetSave: () => { localStorage.removeItem('derby.save'); save = loadSave(); ui.updateWallet(save); if (screen === 'shop') refreshShop() },
    useAbility: (slot = 0) => (race ? race.useSlot(slot) : false),
    /** Force horse `id` to use ability `ab` right now (bots included). */
    botUse: (id: number, ab: AbilityId) => !!race && race.abilities.use(ab, race.horses[id], true),
    /** Electricity-nade chain links if horse `owner`'s nade landed at (x, y) right now. */
    nadeChainAt: (owner: number, x: number, y: number) => (race ? race.abilities.nadeChain(owner, { x, y }) : null),
    abilityIds: () => ABILITIES.map((a) => a.id),
    penClick: (i: number) => { const p = pen.debug().horses[i]; return p ? pen.click(p.x, p.y) : -1 },
    penSpawn: (n: number) => pen.spawn(n),
    /** Put horse `id` at world x,y (normal state), facing `heading` at `speed`. heading null = along the track. */
    placeAt: (id: number, x: number, y: number, heading: number | null = null, speed = 0) => {
      if (!race) return
      const h = race.horses[id]
      h.state = 'normal'; h.z = 0; h.recoverTimer = 0; h.boostTimer = 0; h.knockTimer = 0; h.spinOutTimer = 0; h.slowTimer = 0; h.empSlowTimer = 0; h.nadeSlowTimer = 0; h.rocketTimer = 0; h.haySlow = [0, 0, 0]
      h.pos = { x, y }
      const L = race.track.length
      const loc = locate(race.track, h.pos)
      let ds = loc.s - h.lastS; ds -= Math.round(ds / L) * L
      h.progress += ds; h.lastS = loc.s; h.trackIdx = loc.i
      if (heading === null) { const at = sample(race.track, h.lastS); heading = Math.atan2(at.tan.y, at.tan.x) }
      h.heading = heading
      h.vel = fromAngle(heading, speed); h.fwdSpeed = speed
      h.ai.backupTimer = 0
    },
    /** Stun horse `id` for `s` seconds (tests: interrupt a grapple pull). */
    stun: (id: number, s = 1) => { if (!race) return; const h = race.horses[id]; h.state = 'stunned'; h.stunTimer = s; h.stunLen = s; h.vel = { x: 0, y: 0 }; h.fwdSpeed = 0 },
    /** Freeze/unfreeze one horse. */
    freezeOne: (id: number, on: boolean) => { if (race) race.horses[id].frozen = on },
    /** Point along the track at `ahead` units from the player: world position. */
    trackPoint: (ahead: number, lat = 0) => {
      if (!race) return null
      const at = sample(race.track, race.player.lastS + ahead)
      return { x: at.p.x + at.nrm.x * lat, y: at.p.y + at.nrm.y * lat, heading: Math.atan2(at.tan.y, at.tan.x) }
    },
    /** Tutorial: start it, or set the stored seen version (0 = never). */
    tutorialStart: () => startTutorial(true),
    showNews: (seen: number) => openNews(newsFor(seen)),
    setTutorialSeen: (v: number) => { if (v > 0) localStorage.setItem(TUTORIAL_KEY, String(v)); else localStorage.removeItem(TUTORIAL_KEY) },
    /** Skip the countdown. */
    go: () => { if (race && race.phase === 'countdown') race.countdown = 0.001 },
    /**
     * Put bot `id` right behind the target horse at top speed, aimed at it,
     * so it rams on the next frames. target defaults to the player.
     */
    setupRam: (attackerId: number, victimId = 0, speed = -1, gap = 40) => {
      if (!race) return
      const a = race.horses[attackerId], v = race.horses[victimId]
      for (const h of [a, v]) { h.state = 'normal'; h.recoverTimer = 0; h.z = 0; h.boostTimer = 0 }
      const at = sample(race.track, v.lastS + 60)
      v.pos = { ...at.p }
      v.heading = Math.atan2(at.tan.y, at.tan.x)
      v.vel = { x: 0, y: 0 }
      v.trackIdx = at.i
      const back = sample(race.track, v.lastS + 60 - gap)
      a.pos = { ...back.p }
      a.trackIdx = back.i
      a.heading = v.heading
      const sp = speed < 0 ? a.topSpeed : speed
      a.vel = fromAngle(a.heading, sp)
      a.fwdSpeed = sp
      a.ai.backupTimer = 0
    },
    /** Put horses a and b nose to nose on the centre line, driving at each other at `speed`. */
    setupHeadOn: (aId: number, bId: number, speed = 200, gap = 70) => {
      if (!race) return
      const a = race.horses[aId], b = race.horses[bId]
      for (const h of [a, b]) { h.state = 'normal'; h.recoverTimer = 0; h.z = 0; h.boostTimer = 0; h.ai.backupTimer = 0 }
      const at = sample(race.track, a.lastS + 80)
      const tanA = Math.atan2(at.tan.y, at.tan.x)
      a.pos = { x: at.p.x - at.tan.x * gap / 2, y: at.p.y - at.tan.y * gap / 2 }; a.trackIdx = at.i
      b.pos = { x: at.p.x + at.tan.x * gap / 2, y: at.p.y + at.tan.y * gap / 2 }; b.trackIdx = at.i
      a.heading = tanA; b.heading = tanA + Math.PI
      a.vel = fromAngle(a.heading, speed); a.fwdSpeed = speed
      b.vel = fromAngle(b.heading, speed); b.fwdSpeed = speed
    },
    /** Move every horse far away except the player (clear road for tests). */
    clearRoad: () => {
      if (!race) return
      const L = race.track.length
      const me = race.player
      if (me.state !== 'normal') { me.state = 'normal'; me.z = 0; me.vel = { x: 0, y: 0 }; me.fwdSpeed = 0 }
      me.recoverTimer = 0; me.boostTimer = 0
      race.horses.forEach((h) => {
        if (h.isPlayer) return
        const s = (((race!.player.lastS + L / 2 + h.id * 90) % L) + L) % L
        const at = sample(race!.track, s)
        h.pos = { ...at.p }; h.trackIdx = at.i; h.vel = { x: 0, y: 0 }; h.fwdSpeed = 0
        h.heading = Math.atan2(at.tan.y, at.tan.x)
        h.lastS = s
        h.progress = race!.player.progress - L / 2 + h.id * 90
      })
    },
    /** Put the player just before the line on the final lap. */
    nearFinish: (dist = 260, id = 0) => {
      if (!race) return
      const p = race.horses[id]
      const L = race.track.length
      const s = L - dist
      const at = sample(race.track, s)
      p.pos = { ...at.p }; p.trackIdx = at.i; p.heading = Math.atan2(at.tan.y, at.tan.x)
      p.vel = fromAngle(p.heading, 200)
      p.lastS = s
      p.progress = race.laps * L - dist
    },
    /** Screen/world angle from the player to the centre line `ahead` units on (test autopilot). */
    aheadAngle: (ahead = 170) => {
      if (!race) return 0
      const p = race.player
      const at = sample(race.track, p.lastS + ahead)
      return Math.atan2(at.p.y - p.pos.y, at.p.x - p.pos.x)
    },
    overview: (on = true) => { overview = on },
    freezeBots: (on: boolean) => { if (race) race.horses.forEach((h) => { if (!h.isPlayer) h.frozen = on }) },
    /** Fire horse `id` sideways into the fence at top speed (fence hits must not explode). */
    /** Point a horse into the fence at a shallow angle (degrees) at full speed: a graze/slide. */
    fenceGraze: (id = 0, deg = 25) => {
      if (!race) return
      const h = race.horses[id]
      const at = sample(race.track, h.lastS)
      const lim = race.track.halfWidth - HORSE.radius - 4
      h.pos = { x: at.p.x + at.nrm.x * lim, y: at.p.y + at.nrm.y * lim }; h.trackIdx = at.i
      const tanA = Math.atan2(at.tan.y, at.tan.x), nrmA = Math.atan2(at.nrm.y, at.nrm.x)
      const into = wrapAngle(nrmA - tanA) > 0 ? 1 : -1
      h.heading = tanA + into * deg * Math.PI / 180
      h.vel = fromAngle(h.heading, h.topSpeed); h.fwdSpeed = h.topSpeed
      h.state = 'normal'; h.recoverTimer = 0; h.boostTimer = 0
    },
    fenceSlam: (id = 0) => {
      if (!race) return
      const h = race.horses[id]
      const at = sample(race.track, h.lastS)
      h.pos = { ...at.p }; h.trackIdx = at.i
      h.heading = Math.atan2(at.nrm.y, at.nrm.x)
      h.vel = fromAngle(h.heading, h.topSpeed * 1.2)
      h.fwdSpeed = h.topSpeed * 1.2
    },
  } : {}),
}
