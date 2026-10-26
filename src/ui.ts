import { HORSE } from './config'
import { ordinal, type Race } from './race'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export type Screen = 'menu' | 'race' | 'pause' | 'results'

/** DOM menus and the in-race HUD. */
export class UI {
  app = $('app')
  hud = $('hud')
  menu = $('screenMenu')
  pause = $('screenPause')
  results = $('screenResults')
  countdownEl = $('countdown')
  toastEl = $('toast')
  status = $('status')
  btnMute = $<HTMLButtonElement>('btnMute')

  show(s: Screen) {
    this.app.dataset.mode = s
    this.menu.hidden = s !== 'menu'
    this.pause.hidden = s !== 'pause'
    this.results.hidden = s !== 'results'
    this.hud.hidden = s === 'menu'
    if (s === 'menu' || s === 'results') { this.countdownEl.hidden = true; this.toastEl.hidden = true }
  }

  on(id: string, fn: () => void) { $(id).addEventListener('click', (e) => { e.preventDefault(); fn() }) }

  setMuted(m: boolean) { this.btnMute.textContent = m ? '🔇' : '🔊'; this.btnMute.setAttribute('aria-label', m ? 'Unmute' : 'Mute') }

  updateHud(race: Race) {
    const p = race.player
    $('hudLap').textContent = `${Math.min(p.lap, race.laps)}/${race.laps}`
    $('hudPos').textContent = ordinal(race.placeOf(p))
    $('hudOf').textContent = `/${race.horses.length}`
    $('hudTime').textContent = fmtTime(race.time)
    const frac = Math.min(1, Math.abs(p.fwdSpeed) / p.topSpeed)
    const fill = $('speedFill')
    fill.style.width = `${frac * 100}%`
    fill.classList.toggle('reverse', p.fwdSpeed < -2)
    fill.classList.toggle('boost', p.boostTimer > 0)
    $('speedLabel').textContent = p.fwdSpeed < -2 ? 'REV' : p.boostTimer > 0 && p.fwdSpeed > p.topSpeed ? 'BOOST!' : frac > 0.97 ? 'TOP!' : `${Math.round(frac * 100)}%`
    // Today's top speed vs. the average horse (it wanders for everyone).
    const pct = Math.round((p.topTarget / HORSE.topSpeed - 1) * 100)
    const top = $('speedTop')
    top.textContent = `TOP ${pct > 0 ? '▲ +' : pct < 0 ? '▼ ' : '● '}${pct}%`
    top.className = 'speed-top ' + (pct > 0 ? 'up' : pct < 0 ? 'down' : '')

    // Countdown.
    if (race.phase === 'countdown') {
      this.countdownEl.hidden = false
      this.countdownEl.textContent = String(Math.max(1, Math.ceil(race.countdown)))
    } else if (race.time < 0.8) {
      this.countdownEl.hidden = false
      this.countdownEl.textContent = 'GO!'
    } else this.countdownEl.hidden = true

    // Status banner.
    let text = '', cls = ''
    if (p.state === 'flying') { text = 'KABOOM!'; cls = 'stun' }
    else if (p.state === 'stunned') { text = `STUNNED ${p.stunTimer.toFixed(1)}s · boost next!`; cls = 'stun' }
    else if (p.boostTimer > 0) { text = `⚡ CATCH-UP BOOST ${p.boostTimer.toFixed(1)}s`; cls = 'boost' }
    else if (p.fwdSpeed < -6) { text = 'REVERSING'; cls = 'rev' }
    else if (p.wrongWayTimer > 0.8) { text = 'WRONG WAY'; cls = '' }
    this.status.hidden = !text
    this.status.textContent = text
    this.status.className = 'status ' + cls

    const t = race.toasts[race.toasts.length - 1]
    this.toastEl.hidden = !t
    if (t) this.toastEl.textContent = t.text
  }

  showResults(race: Race) {
    const list = $('resultList')
    list.innerHTML = ''
    const order = race.standings()
    const me = order.indexOf(race.player) + 1
    $('resultTitle').textContent = me === 1 ? 'You won! 🏆' : `You finished ${ordinal(me)}`
    order.forEach((h, i) => {
      const li = document.createElement('li')
      if (h.isPlayer) li.className = 'me'
      const remaining = Math.max(0, race.laps * race.L - h.progress)
      const t = h.finished ? fmtTime(h.finishTime) : `${Math.round((1 - remaining / (race.laps * race.L)) * 100)}% done`
      li.innerHTML = `<span class="place">${ordinal(i + 1)}</span><span class="chip" style="background:${h.colors.silk}"></span><span>${h.isPlayer ? 'You' : h.name}</span><span class="t">${t}</span>`
      list.appendChild(li)
    })
    this.show('results')
  }
}

export function fmtTime(t: number) {
  const m = Math.floor(t / 60), s = t - m * 60
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`
}
