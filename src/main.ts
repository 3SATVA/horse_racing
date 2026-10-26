import { Audio } from './audio'
import { HORSE, RACE } from './config'
import { Effects } from './effects'
import { Input } from './input'
import { fromAngle } from './math'
import { Race } from './race'
import { Renderer } from './render'
import { sample } from './track'
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

input.onGesture = () => audio.unlock()
audio.setMuted(localStorage.getItem('derby.muted') === '1')
ui.setMuted(audio.muted)

function setScreen(s: Screen) {
  screen = s
  ui.show(s)
  input.enabled = s === 'race'
  if (s !== 'race') input.reset()
}

function startRace() {
  audio.unlock()
  fx.clear()
  const laps = Number(params.get('laps')) || RACE.laps
  race = new Race(fx, audio, laps)
  renderer.snapCamera(race.player)
  doneTimer = 0
  setScreen('race')
}

function toMenu() {
  race = null
  fx.clear()
  menuRace = new Race(fx, audio)
  setScreen('menu')
}

ui.on('btnPlay', startRace)
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
    for (let i = 0; i < steps; i++) race.update(dt / steps, input)
    fx.update(dt)
    renderer.updateCamera(race.player, dt)
    if (race.player.finished) {
      doneTimer += dt
      if (doneTimer > RACE.finishLinger) { race.phase = 'done'; ui.showResults(race); screen = 'results'; input.enabled = false }
    }
    ui.updateHud(race)
  } else if (screen === 'menu') {
    // Idle flyover of a fresh track behind the menu.
    const t = now / 1000
    const at = sample(menuRace.track, t * 160)
    renderer.cam.x = at.p.x; renderer.cam.y = at.p.y
    renderer.cam.zoom = Math.min(window.innerWidth, window.innerHeight) / 700
  } else if (screen === 'results' && race) {
    // Keep the world alive behind the results card.
    race.update(dt, input)
    fx.update(dt)
    renderer.updateCamera(race.player, dt)
  }
  const r = race ?? menuRace
  renderer.draw({ track: r.track, horses: r.horses, player: r.player, fx, drag: input.drag, maxDrag: input.maxDrag, time: now / 1000, showArrow: screen === 'race' })
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
      laps: r?.laps,
      beeping: audio.beeping,
      beepCount: audio.beepCount,
      particles: fx.particles.length,
      flash: fx.flash,
      shake: fx.shake,
      horses: r?.horses.map((h) => ({
        id: h.id, name: h.name, isPlayer: h.isPlayer, x: h.pos.x, y: h.pos.y, heading: h.heading,
        speed: h.fwdSpeed, state: h.state, stun: h.stunTimer, lap: h.lap, progress: h.progress,
        finished: h.finished, place: r.placeOf(h), mode: h.ctrl.mode,
      })),
    }
  },
  ...(debug ? {
    /** Skip the countdown. */
    go: () => { if (race && race.phase === 'countdown') race.countdown = 0.001 },
    /**
     * Put bot `id` right behind the target horse at top speed, aimed at it,
     * so it rams on the next frames. target defaults to the player.
     */
    setupRam: (attackerId: number, victimId = 0) => {
      if (!race) return
      const a = race.horses[attackerId], v = race.horses[victimId]
      const at = sample(race.track, v.lastS + 60)
      v.pos = { ...at.p }
      v.heading = Math.atan2(at.tan.y, at.tan.x)
      v.vel = { x: 0, y: 0 }
      v.trackIdx = at.i
      const back = sample(race.track, v.lastS + 60 - 40)
      a.pos = { ...back.p }
      a.trackIdx = back.i
      a.heading = v.heading
      a.vel = fromAngle(a.heading, HORSE.topSpeed)
      a.fwdSpeed = HORSE.topSpeed
      a.ai.backupTimer = 0
    },
    /** Move every horse far away except the player (clear road for tests). */
    clearRoad: () => {
      if (!race) return
      const L = race.track.length
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
    nearFinish: (dist = 260) => {
      if (!race) return
      const p = race.player
      const L = race.track.length
      const s = L - dist
      const at = sample(race.track, s)
      p.pos = { ...at.p }; p.trackIdx = at.i; p.heading = Math.atan2(at.tan.y, at.tan.x)
      p.vel = fromAngle(p.heading, 200)
      p.lastS = s
      p.progress = race.laps * L - dist
    },
    freezeBots: (on: boolean) => { if (race) race.horses.forEach((h) => { if (!h.isPlayer) h.topSpeed = on ? 0 : HORSE.topSpeed * h.ai.skill }) },
  } : {}),
}
