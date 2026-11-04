import { useEffect, useMemo, useRef, useState } from 'react'
import AddressInput from './AddressInput.jsx'
import {
  supabase, TRANSPORTS, TRANSPORT_ICONS, ENGINES, todayStr, titleCase, norm, isActive,
  routeKm, legTotal, daysBetween, load, save, transportLabel, locateMe
} from './lib.js'

const MEM = 'transport.memo'
const MAXLEGS = 4
const emptyAddr = { text: '', lat: null, lon: null }
const fmt = n => n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`
const dayNum = d => Number(d.slice(8))
const dayShort = d => new Date(d + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short' }).replace('.', '')
const isWeekend = d => [0, 6].includes(new Date(d + 'T12:00:00').getDay())
const dayFull = d => `${dayShort(d)} ${d.slice(8)}/${d.slice(5, 7)}`
const monthLabel = ym => new Date(ym + '-01T12:00:00').toLocaleDateString('fr-BE', { month: 'long', year: 'numeric' })

/* ---------- Nom : recherche à la frappe, nom absent accepté tel quel ---------- */
function NamePicker({ members, value, onChange, label, placeholder }) {
  const [text, setText] = useState(value || '')
  const [open, setOpen] = useState(false)
  const q = norm(text)
  const list = q ? members.filter(m => norm(m).includes(q)).slice(0, 6) : []
  const exact = members.find(m => norm(m) === q)

  useEffect(() => { onChange(exact || (text.trim() ? titleCase(text) : '')) }, [text, members])

  return (
    <div className="addr">
      <label>{label}</label>
      <div className="field">
        <input className="in" value={text} placeholder={placeholder} autoComplete="off"
          onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
          onChange={e => { setText(e.target.value); setOpen(true) }} />
        {text && <button type="button" className="clear" aria-label="Effacer" onPointerDown={e => { e.preventDefault(); setText('') }}>✕</button>}
      </div>
      {open && list.length > 0 && !exact && (
        <ul className="sug">
          {list.map(m => <li key={m} onPointerDown={e => { e.preventDefault(); setText(m); setOpen(false) }}>{m}</li>)}
        </ul>
      )}
      {text.trim() && !exact && <p className="hint">Nom absent de la liste : il sera enregistré « {titleCase(text)} ».</p>}
    </div>
  )
}

/* ---------- Arrivée : lieux de tournage ou autre adresse ---------- */
const sameSpot = (a, l) => a.lat != null && a.lat === l.lat && a.lon === l.lon

function ArrivalPicker({ value, onChange, choices }) {
  const [custom, setCustom] = useState(() => value.text !== '' && !choices.some(l => sameSpot(value, l)))
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErr, setGeoErr] = useState(false)
  const sel = choices.find(l => sameSpot(value, l))
  const current = custom ? '__custom' : sel ? sel.id : ''

  const change = e => {
    const v = e.target.value
    if (v === '__custom') { setCustom(true); onChange(emptyAddr); return }
    setCustom(false)
    const l = choices.find(x => x.id === v)
    onChange(l ? { text: l.address, lat: l.lat, lon: l.lon } : emptyAddr)
  }
  const here = async () => {
    setGeoBusy(true); setGeoErr(false)
    try { const a = await locateMe(); setCustom(true); onChange(a) } catch { setGeoErr(true) }
    setGeoBusy(false)
  }

  return (
    <>
      <select className="in" value={current} onChange={change}>
        <option value="">Choisir…</option>
        {choices.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        <option value="__custom">Autre adresse…</option>
      </select>
      {sel && !custom && <p className="hint">{sel.address}</p>}
      {custom
        ? <AddressInput value={value} onChange={onChange} placeholder="Rue, numéro, ville" locate />
        : (
          <>
            <button type="button" className="locate" onClick={here} disabled={geoBusy}>
              {geoBusy ? 'Localisation…' : '📍 Utiliser ma position'}
            </button>
            {geoErr && <p className="hint">Position indisponible : choisir dans la liste ou saisir l’adresse.</p>}
          </>
        )}
    </>
  )
}

/* ---------- Une étape (un moyen de transport) ---------- */
function LegEditor({ initial, heading, pos, onPos, members, onSubmit, onBack, places, submitLabel }) {
  const [transport, setTransport] = useState(initial.transport || '')
  const [engine, setEngine] = useState(initial.engine || '')
  const [carpool, setCarpool] = useState(!!initial.carpool)
  const [driver, setDriver] = useState(initial.driver || '')
  const [start, setStart] = useState(initial.start || emptyAddr)
  const [end, setEnd] = useState(initial.end || emptyAddr)
  const [round, setRound] = useState(initial.round ?? true)
  const [oneWay, setOneWay] = useState(null)
  const [calc, setCalc] = useState('idle') // idle | loading | ok | error
  const profile = transport === 'velo' ? 'velo' : transport === 'pied' ? 'pied' : 'road'

  useEffect(() => {
    if (start.lat == null || end.lat == null) { setCalc('idle'); setOneWay(null); return }
    const ac = new AbortController()
    setCalc('loading')
    routeKm(start, end, transport, ac.signal)
      .then(km => { setOneWay(km); setCalc('ok') })
      .catch(e => { if (e.name !== 'AbortError') { setOneWay(null); setCalc('error') } })
    return () => ac.abort()
  }, [start.lat, start.lon, end.lat, end.lon, profile])

  const isCar = transport === 'voiture'
  const total = legTotal({ oneWay, round })
  const ready = transport && calc === 'ok' && oneWay != null && (!isCar || engine) && (!isCar || !carpool || driver)

  const submit = e => {
    e.preventDefault()
    if (!ready) return
    onSubmit({
      transport, engine: isCar ? engine : '', carpool: isCar && carpool,
      driver: isCar && carpool ? driver : '', start, end, round, oneWay
    })
  }

  return (
    <form onSubmit={submit}>
      <button type="button" className="back" onClick={onBack}>← Retour</button>
      <h1>{heading}</h1>

      {pos && (
        <>
          <label>Ce trajet était…</label>
          <div className="seg">
            <label className={pos === 'before' ? 'on' : ''}>
              <input type="radio" name="pos" checked={pos === 'before'} onChange={() => onPos('before')} />Avant le premier
            </label>
            <label className={pos === 'after' ? 'on' : ''}>
              <input type="radio" name="pos" checked={pos === 'after'} onChange={() => onPos('after')} />Après le dernier
            </label>
          </div>
          <p className="hint">{pos === 'before'
            ? 'Le départ est copié depuis le premier trajet. Saisir l’arrivée.'
            : 'Le départ est pré-rempli avec l’arrivée du dernier trajet. Saisir l’arrivée.'}</p>
        </>
      )}

      <label>Moyen de transport</label>
      <div className="tiles">
        {TRANSPORTS.map(([v, l]) => (
          <button type="button" key={v} className={`tile${transport === v ? ' on' : ''}`} onClick={() => setTransport(v)}>
            <b>{TRANSPORT_ICONS[v]}</b>{l}
          </button>
        ))}
      </div>

      {isCar && (
        <>
          <label>Type de moteur</label>
          <div className="seg" role="radiogroup">
            {ENGINES.map(([v, l]) => (
              <label key={v} className={engine === v ? 'on' : ''}>
                <input type="radio" name="engine" checked={engine === v} onChange={() => setEngine(v)} />{l}
              </label>
            ))}
          </div>
          <label className="chk"><input type="checkbox" checked={carpool} onChange={e => setCarpool(e.target.checked)} /> Covoiturage</label>
          {carpool && <NamePicker members={members} label="Nom du chauffeur" value={driver} onChange={setDriver} placeholder="Taper les premières lettres…" />}
        </>
      )}

      <label>Départ</label>
      <AddressInput value={start} onChange={setStart} placeholder="Rue, numéro, ville" locate />
      <label>Arrivée</label>
      <ArrivalPicker value={end} onChange={setEnd} choices={places} />

      <label className="tog">
        <span>Aller/retour</span>
        <input type="checkbox" checked={round} onChange={e => setRound(e.target.checked)} />
      </label>

      <div className="km" aria-live="polite">
        <small>Ce trajet · {round ? 'A/R' : 'aller simple'}</small>
        {calc === 'loading' && <b>Calcul…</b>}
        {calc === 'ok' && <b>{fmt(total)} km</b>}
        {calc === 'error' && <b className="err">Indisponible</b>}
        {calc === 'idle' && <b className="mut">—</b>}
        {calc === 'ok' && round && <small>{fmt(oneWay)} km × 2</small>}
        {calc === 'error' && <small>Choisir une suggestion d’adresse (avec numéro) ou vérifier la connexion.</small>}
      </div>

      <button className="btn" disabled={!ready}>{submitLabel}</button>
    </form>
  )
}

const LegLine = ({ leg, actions }) => (
  <div className="leg">
    <span>
      <b>{TRANSPORT_ICONS[leg.transport]} {transportLabel(leg.transport)}</b> · {fmt(legTotal(leg))} km{leg.round ? ' (A/R)' : ''}
      <small>{leg.start.text} → {leg.end.text}</small>
    </span>
    {actions}
  </div>
)

/* ---------- Choix des dates (période des lieux de tournage) ---------- */
function DatePicker({ days, selected, onToggle, today }) {
  const [pick, setPick] = useState('')
  const groups = {}
  days.forEach(d => { (groups[d.slice(0, 7)] ||= []).push(d) })
  const outside = selected.filter(d => !days.includes(d))
  const Chip = ({ d }) => (
    <label className={`chip${selected.includes(d) ? ' on' : ''}${isWeekend(d) ? ' we' : ''}`} title={dayFull(d)}>
      <input type="checkbox" checked={selected.includes(d)} onChange={() => onToggle(d)} />
      <small>{dayShort(d)}</small><b>{dayNum(d)}</b>{d === today && <em>auj.</em>}
    </label>
  )
  return (
    <>
      {Object.entries(groups).map(([ym, ds]) => (
        <div key={ym}>
          <p className="month">{monthLabel(ym)}</p>
          <div className="chips">{ds.map(d => <Chip key={d} d={d} />)}</div>
        </div>
      ))}
      {days.length === 0 && (
        <>
          {outside.length > 0 && <div className="chips">{outside.map(d => <Chip key={d} d={d} />)}</div>}
          <div className="inline gap">
            <input type="date" className="in" value={pick} onChange={e => setPick(e.target.value)} aria-label="Autre date" />
            <button type="button" className="btn sm sec" disabled={!pick} onClick={() => { if (!selected.includes(pick)) onToggle(pick); setPick('') }}>Ajouter cette date</button>
          </div>
        </>
      )}
    </>
  )
}

/* ---------- Application ---------- */
export default function Public() {
  const memo = useMemo(() => load(MEM) || {}, [])
  const today = todayStr()
  const [members, setMembers] = useState([])
  const [locations, setLocations] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [step, setStep] = useState(memo.name ? 'home' : 'who') // home | who | leg | more | recap | done
  const [name, setName] = useState(memo.name || '')
  const [legs, setLegs] = useState([])
  const [editIdx, setEditIdx] = useState(null)
  const [addPos, setAddPos] = useState(null)
  const [dates, setDates] = useState([])
  const [sent, setSent] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const datesInit = useRef(false)

  useEffect(() => {
    (async () => {
      const [m, l] = await Promise.all([
        supabase.from('members').select('name').order('name'),
        supabase.from('locations').select('*').order('start_date')
      ])
      setMembers((m.data || []).map(x => x.name))
      setLocations(l.data || [])
      setLoaded(true)
    })()
  }, [])

  // Période proposée = jours couverts par les lieux de tournage définis en admin
  const periodDays = useMemo(() => {
    const s = new Set()
    locations.forEach(l => daysBetween(l.start_date, l.end_date, 120).forEach(d => s.add(d)))
    return [...s].sort()
  }, [locations])

  useEffect(() => {
    if (!loaded || datesInit.current) return
    datesInit.current = true
    setDates(periodDays.includes(today) ? [today] : [])
  }, [loaded, periodDays])

  const activeToday = useMemo(() => locations.filter(l => isActive(l, today)), [locations])
  const fallbackLoc = useMemo(() => (
    locations.filter(l => l.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    || locations.filter(l => l.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date))[0]
  ), [locations])
  const loc = activeToday[0] || fallbackLoc
  // Pré-sélection de l'arrivée seulement s'il y a un seul lieu actif aujourd'hui
  const arrival = activeToday.length === 1
    ? { text: activeToday[0].address, lat: activeToday[0].lat, lon: activeToday[0].lon }
    : emptyAddr

  const toggleDate = d => setDates(x => (x.includes(d) ? x.filter(y => y !== d) : [...x, d].sort()))
  const totalDay = legs.reduce((a, l) => a + legTotal(l), 0)

  const resetAll = () => {
    setLegs([]); setEditIdx(null); setAddPos(null); setError('')
    setDates(periodDays.includes(today) ? [today] : [])
  }
  const startNewLeg = () => { setEditIdx(null); setAddPos(null); setStep('leg') }

  function saveLeg(leg) {
    if (editIdx != null) {
      setLegs(ls => ls.map((l, i) => (i === editIdx ? leg : l)))
      setEditIdx(null); setStep('recap'); return
    }
    const next = addPos === 'before' ? [leg, ...legs] : addPos === 'after' ? [...legs, leg] : [leg]
    setLegs(next); setAddPos(null)
    setStep(next.length < MAXLEGS ? 'more' : 'recap')
  }

  async function reuse() {
    const saved = (memo.legs || []).map(l => ({ ...l, start: l.start || emptyAddr, end: l.end || emptyAddr }))
    setBusy(true)
    const fresh = await Promise.all(saved.map(l =>
      routeKm(l.start, l.end, l.transport).then(km => ({ ...l, oneWay: km })).catch(() => l)))
    setBusy(false)
    setLegs(fresh); setStep('recap')
  }

  async function submit() {
    if (busy || !dates.length || !legs.length) return
    setBusy(true); setError('')
    const sorted = [...dates].sort()
    const rows = sorted.flatMap(d => {
      const l = locations.find(x => isActive(x, d) && legs.some(g => sameSpot(g.end, x))) || locations.find(x => isActive(x, d))
      return legs.map((g, i) => ({
        member_name: name, trip_date: d,
        start_address: g.start.text, end_address: g.end.text, km_total: legTotal(g),
        round_trip: g.round, transport: g.transport,
        engine: g.transport === 'voiture' ? g.engine : null,
        carpool: g.transport === 'voiture' && !!g.carpool,
        driver_name: g.transport === 'voiture' && g.carpool ? g.driver : null,
        location_id: l ? l.id : null,
        leg: i + 1, legs_total: legs.length
      }))
    })
    const { error: err } = await supabase.from('trips').insert(rows)
    setBusy(false)
    if (err) { setError('Enregistrement impossible. Vérifier la connexion puis réessayer.'); return }
    save(MEM, { name, legs: legs.map(({ transport, engine, carpool, driver, start, end, round, oneWay }) => ({ transport, engine, carpool, driver, start, end, round, oneWay })) })
    setSent(s => [...s, { legs, dates: sorted }])
    setStep('done')
  }

  const Prog = ({ n }) => <div className="prog">{[1, 2, 3].map(i => <i key={i} className={i <= n ? 'on' : ''} />)}</div>

  /* --- Écrans --- */
  if (step === 'home') return (
    <main className="wrap">
      <h1>Bonjour {name.split(' ')[0]} 👋</h1>
      {loc && <p className="mut">Lieu de tournage : <span className="badge">{loc.name}</span></p>}
      {memo.legs?.length > 0 && (
        <div className="card hl">
          <b>Reprendre mon dernier trajet</b>
          {memo.legs.map((l, i) => <LegLine key={i} leg={{ ...l, start: l.start || emptyAddr, end: l.end || emptyAddr }} />)}
          <button className="btn" onClick={reuse} disabled={busy || !loaded}>{busy ? 'Calcul…' : 'Oui, même trajet'}</button>
        </div>
      )}
      <button className={`btn${memo.legs?.length ? ' sec' : ''}`} onClick={startNewLeg}>
        {memo.legs?.length ? 'Un trajet différent' : 'Commencer'}
      </button>
      <p className="hint center-t"><button className="link ac" onClick={() => { setName(''); setStep('who') }}>Ce n’est pas moi · Changer de nom</button></p>
    </main>
  )

  if (step === 'who') return (
    <main className="wrap">
      <Prog n={1} />
      <h1>Déclarer mon trajet</h1>
      {loc && <p className="mut">Lieu de tournage : <span className="badge">{loc.name}</span></p>}
      <NamePicker members={members} label="Prénom / Nom" value={name} onChange={setName} placeholder="Taper les premières lettres…" />
      <button className="btn" disabled={!name.trim()} onClick={startNewLeg}>Continuer</button>
    </main>
  )

  if (step === 'leg') {
    const editing = editIdx != null
    const first = !editing && addPos == null
    const initial = editing ? legs[editIdx]
      : first ? { start: memo.legs?.[0]?.start || memo.start || emptyAddr, end: arrival }
      : addPos === 'before' ? { start: legs[0].start, end: emptyAddr }
      : { start: legs[legs.length - 1].end, end: emptyAddr }
    const heading = editing ? 'Modifier ce trajet' : first ? 'Comment êtes-vous venu·e ?' : 'Autre moyen de transport'
    const back = () => {
      if (editing) { setEditIdx(null); setStep('recap') }
      else if (legs.length) { setAddPos(null); setStep('more') }
      else setStep(memo.name ? 'home' : 'who')
    }
    return (
      <main className="wrap">
        <Prog n={2} />
        <LegEditor key={`${editIdx}-${addPos}-${legs.length}`} initial={initial} heading={heading}
          pos={editing ? null : addPos} onPos={setAddPos} members={members} onBack={back}
          places={locations}
          onSubmit={saveLeg} submitLabel={editing ? 'Enregistrer' : 'Continuer'} />
      </main>
    )
  }

  if (step === 'more') return (
    <main className="wrap">
      <Prog n={2} />
      <h1>{legs.length === 1 ? 'Avez-vous utilisé un autre moyen de transport pour ce trajet ?' : 'Avez-vous utilisé encore un autre moyen de transport ?'}</h1>
      <p className="hint">Par exemple un taxi, un bus ou un vélo pour rejoindre la gare.</p>
      <div className="card hl">
        <small className="mut">{legs.length === 1 ? 'Trajet saisi' : 'Trajets saisis'}</small>
        {legs.map((l, i) => <LegLine key={i} leg={l} />)}
      </div>
      <div className="big">
        <button className="btn" onClick={() => { setEditIdx(null); setAddPos('before'); setStep('leg') }}>Oui, ajouter un autre moyen</button>
        <button className="btn sec" onClick={() => setStep('recap')}>Non, c’est tout</button>
      </div>
      <button className="back" onClick={() => { setEditIdx(legs.length - 1); setStep('leg') }}>← Modifier le dernier trajet</button>
    </main>
  )

  if (step === 'recap') {
    const n = dates.length
    return (
      <main className="wrap">
        <Prog n={3} />
        <h1>Récapitulatif</h1>
        {legs.map((l, i) => (
          <LegLine key={i} leg={l} actions={
            <span className="acts">
              <button className="link ac" onClick={() => { setEditIdx(i); setStep('leg') }}>Modifier</button>
              {legs.length > 1 && <button className="link" onClick={() => setLegs(ls => ls.filter((_, j) => j !== i))}>Supprimer</button>}
            </span>} />
        ))}
        {legs.length < MAXLEGS && (
          <button className="link ac" onClick={() => { setEditIdx(null); setAddPos('before'); setStep('leg') }}>+ Ajouter un moyen de transport</button>
        )}
        <div className="km"><small>Total par jour</small><b>{fmt(totalDay)} km</b></div>

        <h2 className="q2">Avez-vous parcouru ces exacts mêmes trajets à d’autres dates ? <span className="mut">(plusieurs choix possibles)</span></h2>
        <p className="hint">Vous ne devrez donc pas réencoder ces trajets. Si de nouveaux modes de transport s’ajoutent à d’autres dates, merci de faire un nouvel encodage.</p>
        <DatePicker days={periodDays} selected={dates} onToggle={toggleDate} today={today} />
        {!n && <p className="err">Cocher au moins un jour.</p>}
        {error && <p className="err">{error}</p>}
        <button className="btn" disabled={!n || !legs.length || busy} onClick={submit}>
          {busy ? 'Envoi…' : `Valider (${plural(n, 'jour')} · ${plural(legs.length, 'trajet')})`}
        </button>
      </main>
    )
  }

  // done
  const last = sent[sent.length - 1]
  return (
    <main className="wrap center">
      <div className="okc">✓</div>
      <h1>{last && last.legs.length > 1 ? 'Trajets enregistrés' : 'Trajet enregistré'}</h1>
      <p className="mut">{name}</p>
      <ul className="recap">
        {sent.map((b, i) => (
          <li key={i}>
            <b>{b.legs.map(l => `${TRANSPORT_ICONS[l.transport]} ${transportLabel(l.transport)}`).join(' + ')}</b>
            {' · '}{fmt(b.legs.reduce((a, l) => a + legTotal(l), 0))} km/jour
            <small>{plural(b.dates.length, 'jour')} : {b.dates.map(d => `${dayNum(d)}/${d.slice(5, 7)}`).join(', ')}</small>
          </li>
        ))}
      </ul>
      <button className="btn" onClick={() => { resetAll(); startNewLeg() }}>Encoder d’autres jours (autres trajets)</button>
      <button className="btn sec" onClick={() => { resetAll(); setSent([]); setStep('home') }}>J’ai terminé</button>
    </main>
  )
}
