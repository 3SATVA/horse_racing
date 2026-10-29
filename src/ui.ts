import { ABILITIES, abilityDef, type AbilityId, type Save } from './abilities'
import { HORSE, SLOTS } from './config'
import { ordinal, type Race } from './race'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T

export type Screen = 'menu' | 'race' | 'pause' | 'results' | 'shop'

/** DOM menus and the in-race HUD. */
export class UI {
  app = $('app')
  hud = $('hud')
  menu = $('screenMenu')
  pause = $('screenPause')
  results = $('screenResults')
  shop = $('screenShop')
  abilityBar = $('abilityBar')
  private barKey = ''
  countdownEl = $('countdown')
  toastEl = $('toast')
  status = $('status')
  btnMute = $<HTMLButtonElement>('btnMute')

  show(s: Screen) {
    this.app.dataset.mode = s
    this.menu.hidden = s !== 'menu'
    this.pause.hidden = s !== 'pause'
    this.results.hidden = s !== 'results'
    this.shop.hidden = s !== 'shop'
    this.hud.hidden = s === 'menu' || s === 'shop'
    if (s === 'menu' || s === 'results' || s === 'shop') { this.countdownEl.hidden = true; this.toastEl.hidden = true }
  }

  on(id: string, fn: () => void) { $(id).addEventListener('click', (e) => { e.preventDefault(); fn() }) }

  setMuted(m: boolean) { this.btnMute.textContent = m ? '🔇' : '🔊'; this.btnMute.setAttribute('aria-label', m ? 'Unmute' : 'Mute') }

  /** Coin balance + equipped ability on the menu and shop. */
  updateWallet(save: Save, bump = false) {
    for (const id of ['menuCoins', 'shopCoins']) {
      const el = $(id)
      el.textContent = String(save.coins)
      if (bump) { const chip = el.parentElement!; chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump') }
    }
    const eq = save.equipped.filter(Boolean) as AbilityId[]
    $('menuEquippedName').textContent = eq.length ? eq.map((id) => `${abilityDef(id).icon} ${abilityDef(id).name} ×${save.inv[id]}`).join(', ') : 'nothing - visit the Magic Shop'
  }

  /** Draw the magic shop. */
  renderShop(save: Save, onBuy: (id: AbilityId) => void, onEquip: (id: AbilityId) => void, flash?: AbilityId) {
    this.updateWallet(save)
    $('shopSlotsText').textContent = SLOTS === 1 ? 'one ability' : `${SLOTS} abilities`
    const slots = $('shopSlots')
    slots.innerHTML = ''
    save.equipped.forEach((id, i) => {
      const d = document.createElement('div')
      d.className = 'slot-box' + (id ? '' : ' empty')
      d.dataset.slot = String(i)
      d.innerHTML = id
        ? `<span class="ico">${abilityDef(id).icon}</span><span>Slot ${i + 1}: ${abilityDef(id).name} ×${save.inv[id]}</span>`
        : `<span class="ico">⬚</span><span>Slot ${i + 1}: empty</span>`
      slots.appendChild(d)
    })
    const list = $('shopList')
    list.innerHTML = ''
    for (const a of ABILITIES) {
      const owned = save.inv[a.id]
      const isEq = save.equipped.includes(a.id)
      const card = document.createElement('div')
      card.className = 'shop-item' + (isEq ? ' equipped' : '') + (save.coins < a.price ? ' cant' : '') + (flash === a.id ? ' bought' : '')
      card.dataset.id = a.id
      card.innerHTML = `
        ${isEq ? '<span class="badge">EQUIPPED</span>' : ''}
        <div class="top"><span class="ico">${a.icon}</span><div><div class="name">${a.name}</div><div class="owned">Owned: <b class="cnt">${owned}</b></div></div></div>
        <p class="desc">${a.desc}</p>
        <div class="acts">
          <button class="btn buy" type="button" ${save.coins < a.price ? 'disabled' : ''}>Buy 🪙${a.price}</button>
          <button class="btn eq" type="button" ${owned > 0 && !isEq ? '' : 'disabled'}>${isEq ? 'Equipped' : 'Equip'}</button>
        </div>`
      card.querySelector('.buy')!.addEventListener('click', (e) => { e.preventDefault(); onBuy(a.id) })
      card.querySelector('.eq')!.addEventListener('click', (e) => { e.preventDefault(); onEquip(a.id) })
      list.appendChild(card)
    }
  }

  /** The in-race ability slot(s): icon + charges, tap to use. */
  updateAbilityBar(race: Race, onUse: (slot: number) => void) {
    const key = race.slots.map((id) => `${id}:${id ? race.charges[id] ?? 0 : 0}`).join('|')
    if (key === this.barKey) return
    const rebuild = this.abilityBar.children.length !== race.slots.length
    this.barKey = key
    if (rebuild) {
      this.abilityBar.innerHTML = ''
      race.slots.forEach((_, i) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'ability-slot'
        b.dataset.slot = String(i)
        b.innerHTML = '<span class="ico"></span><span class="n"></span><span class="key"></span>'
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); onUse(i) })
        this.abilityBar.appendChild(b)
      })
    }
    race.slots.forEach((id, i) => {
      const b = this.abilityBar.children[i] as HTMLElement
      const n = id ? race.charges[id] ?? 0 : 0
      b.classList.toggle('empty', !id)
      b.classList.toggle('out', !!id && n <= 0)
      b.dataset.ability = id ?? ''
      b.setAttribute('aria-label', id ? `Use ${abilityDef(id).name} (${n} left)` : 'No ability equipped')
      b.querySelector('.ico')!.textContent = id ? abilityDef(id).icon : '✨'
      b.querySelector('.n')!.textContent = id ? String(n) : '–'
      b.querySelector('.key')!.textContent = i === 0 ? 'E' : String(i + 1)
    })
  }

  flashSlot(i: number) {
    const b = this.abilityBar.children[i] as HTMLElement | undefined
    if (!b) return
    b.classList.add('fired')
    setTimeout(() => b.classList.remove('fired'), 140)
  }

  resetAbilityBar() { this.barKey = ''; this.abilityBar.innerHTML = '' }

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

  showResults(race: Race, reward?: { base: number; bonus: number; total: number; kills: number; coins: number }) {
    const list = $('resultList')
    list.innerHTML = ''
    const order = race.standings()
    const me = order.indexOf(race.player) + 1
    const won = race.winner === race.player
    const last = !won && me === order.length
    const who = race.winner ? race.winner.name : 'A rival'
    // Only last place is a loss; any other spot shows your placement.
    $('resultTitle').textContent = won ? 'You won! 🏆' : last ? 'You lose!' : `You placed ${ordinal(me)}!`
    $('resultSub').textContent = won
      ? 'First across the line!'
      : last
        ? `${who} crossed the line first and you were last of ${order.length}.`
        : `${who} crossed the line first. You finished ${ordinal(me)} of ${order.length}.`
    const rc = $('resultCoins')
    rc.innerHTML = reward
      ? `+🪙${reward.total} coins <small>${ordinal(me)} place: ${reward.base}${reward.kills ? ` · ${reward.kills} blown up: +${reward.bonus}` : ''} · balance 🪙${reward.coins}</small>`
      : ''
    const scr = $('screenResults')
    scr.classList.toggle('lost', last)
    scr.classList.toggle('placed', !won && !last)
    order.forEach((h, i) => {
      const li = document.createElement('li')
      if (h.isPlayer) li.className = 'me'
      const remaining = Math.max(0, race.laps * race.L - h.progress)
      const t = h.finished ? fmtTime(h.finishTime) : `${Math.max(0, Math.min(99, Math.round((1 - remaining / (race.laps * race.L)) * 100)))}% done`
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
