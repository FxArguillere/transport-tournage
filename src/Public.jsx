import { useEffect, useMemo, useState } from 'react'
import AddressInput from './AddressInput.jsx'
import { supabase, TRANSPORTS, ENGINES, todayStr, titleCase, isActive, routeKm, fmtDay, daysBetween, load, save, transportLabel } from './lib.js'

const MEM = 'transport.memo'
const OTHER = '__other'
const emptyAddr = { text: '', lat: null, lon: null }

function NameSelect({ members, value, set, custom, setCustom, label }) {
  return (
  <>
    <label>{label}</label>
    <select className="in" value={value} onChange={e => set(e.target.value)}>
      <option value="">Choisir dans la liste…</option>
      {members.map(n => <option key={n}>{n}</option>)}
      <option value={OTHER}>Autre (saisir)…</option>
    </select>
    {value === OTHER && (
      <input className="in gap" placeholder="Prénom Nom" value={custom}
        onChange={e => setCustom(e.target.value)} autoComplete="name" />
    )}
  </>
)
}

export default function Public() {
  const memo = useMemo(() => load(MEM) || {}, [])
  const [members, setMembers] = useState([])
  const [locations, setLocations] = useState([])
  const [loaded, setLoaded] = useState(false)

  const [name, setName] = useState(memo.name || '')
  const [customName, setCustomName] = useState(memo.customName || '')
  const [date, setDate] = useState(todayStr())
  const [start, setStart] = useState(memo.start || emptyAddr)
  const [end, setEnd] = useState(emptyAddr)
  const [locId, setLocId] = useState('')
  const [endEdited, setEndEdited] = useState(false)
  const [round, setRound] = useState(memo.round ?? true)
  const [transport, setTransport] = useState(memo.transport || '')
  const [engine, setEngine] = useState(memo.engine || '')
  const [carpool, setCarpool] = useState(false)
  const [driver, setDriver] = useState('')
  const [customDriver, setCustomDriver] = useState('')

  const [oneWay, setOneWay] = useState(null)
  const [calc, setCalc] = useState('idle') // idle | loading | ok | error
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [extra, setExtra] = useState([])      // autres dates cochées (mêmes trajets)
  const [pickDate, setPickDate] = useState('')
  const [sent, setSent] = useState([])        // trajets déjà encodés dans cette session

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

  const active = useMemo(() => locations.filter(l => isActive(l, date)), [locations, date])

  // Dates proposées : jours du/des lieux actifs + dates ajoutées à la main
  const candidates = useMemo(() => {
    const set = new Set(extra)
    active.forEach(l => daysBetween(l.start_date, l.end_date).forEach(d => set.add(d)))
    set.delete(date)
    return [...set].sort()
  }, [active, extra, date])
  const toggleExtra = d => setExtra(x => (x.includes(d) ? x.filter(y => y !== d) : [...x, d]))
  const addPicked = () => {
    if (pickDate && pickDate !== date && !extra.includes(pickDate)) setExtra(x => [...x, pickDate])
    setPickDate('')
  }

  // Lieu actif → adresse d'arrivée (sauf si modifiée à la main par l'utilisateur)
  useEffect(() => {
    if (!active.length) { setLocId(''); if (!endEdited) setEnd(emptyAddr); return }
    const cur = active.find(l => l.id === locId) || active[0]
    setLocId(cur.id)
    if (!endEdited) setEnd({ text: cur.address, lat: cur.lat, lon: cur.lon })
  }, [active])

  const chooseLoc = id => {
    setLocId(id); setEndEdited(false)
    const l = active.find(x => x.id === id)
    if (l) setEnd({ text: l.address, lat: l.lat, lon: l.lon })
  }

  // Recalcul automatique de la distance (aller simple), côté client
  useEffect(() => {
    if (start.lat == null || end.lat == null) { setCalc('idle'); setOneWay(null); return }
    const ac = new AbortController()
    setCalc('loading')
    routeKm(start, end, transport, ac.signal)
      .then(km => { setOneWay(km); setCalc('ok') })
      .catch(e => { if (e.name !== 'AbortError') { setOneWay(null); setCalc('error') } })
    return () => ac.abort()
  }, [start.lat, start.lon, end.lat, end.lon, transport === 'velo' ? 'velo' : transport === 'pied' ? 'pied' : 'road'])

  const total = oneWay == null ? null : Math.round(oneWay * (round ? 2 : 1) * 100) / 100
  const fmt = n => n.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const finalName = name === OTHER ? titleCase(customName) : name
  const finalDriver = driver === OTHER ? titleCase(customDriver) : driver
  const isCar = transport === 'voiture'
  const ready = finalName && transport && total != null && calc === 'ok'
    && (!isCar || engine) && (!isCar || !carpool || finalDriver)

  const resetTrip = () => {
    setStart(emptyAddr); setTransport(''); setEngine(''); setCarpool(false); setDriver(''); setCustomDriver('')
    setEndEdited(false); setRound(true); setError('')
    const l = active.find(x => x.id === locId) || active[0]
    setEnd(l ? { text: l.address, lat: l.lat, lon: l.lon } : emptyAddr)
  }

  async function submit(e) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true); setError('')
    const dates = [date, ...extra.filter(d => d !== date)].sort()
    const rows = dates.map(d => {
      const loc = locations.find(l => l.id === locId && isActive(l, d)) || locations.find(l => isActive(l, d))
      return {
        member_name: finalName, trip_date: d,
        start_address: start.text, end_address: end.text, km_total: total,
        round_trip: round, transport,
        engine: isCar ? engine : null,
        carpool: isCar && carpool,
        driver_name: isCar && carpool ? finalDriver : null,
        location_id: loc ? loc.id : null
      }
    })
    const { error: err } = await supabase.from('trips').insert(rows)
    setBusy(false)
    if (err) { setError('Enregistrement impossible. Vérifier la connexion puis réessayer.'); return }
    save(MEM, { name, customName, start, transport, round, engine })
    setSent(s => [...s, { transport, km: total, round, dates, engine: isCar ? engine : null }])
    setDone(true)
  }

  if (done) return (
    <main className="wrap center">
      <div className="okc">✓</div>
      <h1>{sent.length > 1 ? `${sent.length} trajets enregistrés` : 'Trajet enregistré'}</h1>
      <p className="mut">{finalName}</p>
      <ul className="recap">
        {sent.map((t, i) => (
          <li key={i}>
            <b>{transportLabel(t.transport)}</b> · {fmt(t.km)} km{t.round ? ' (A/R)' : ''}
            <small>{t.dates.length === 1 ? fmtDay(t.dates[0]) : `${t.dates.length} dates : ${t.dates.map(d => fmtDay(d)).join(', ')}`}</small>
          </li>
        ))}
      </ul>
      <p className="hint">Un autre mode de transport (ou un autre trajet) le même jour ? Ajouter un trajet.</p>
      <button className="btn" onClick={() => { setDone(false); resetTrip() }}>Ajouter un autre trajet</button>
      <button className="btn sec" onClick={() => { setDone(false); setSent([]); setExtra([]); setDate(todayStr()); resetTrip() }}>J’ai terminé</button>
    </main>
  )

  return (
    <main className="wrap">
      <h1>Déclarer mon trajet</h1>
      <form onSubmit={submit}>
        <NameSelect members={members} label="Prénom / Nom" value={name} set={setName} custom={customName} setCustom={setCustomName} />

        <label>Date</label>
        <input type="date" className="in" value={date} onChange={e => e.target.value && setDate(e.target.value)} />

        {active.length > 1 && (
          <>
            <label>Lieu de tournage</label>
            <select className="in" value={locId} onChange={e => chooseLoc(e.target.value)}>
              {active.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </>
        )}
        {loaded && active.length === 0 && <p className="note">Aucun lieu de tournage actif à cette date. Saisir l’adresse d’arrivée.</p>}

        <label>Adresse de départ</label>
        <AddressInput value={start} onChange={setStart} placeholder="Rue, numéro, ville" />

        <label>Adresse d’arrivée</label>
        <AddressInput value={end} onChange={v => { setEndEdited(true); setEnd(v) }} placeholder="Rue, numéro, ville" />

        <label className="chk"><input type="checkbox" checked={round} onChange={e => setRound(e.target.checked)} /> Aller/retour</label>

        <div className="km" aria-live="polite">
          <small>Total km {round ? 'A/R' : 'aller simple'}</small>
          {calc === 'loading' && <b>Calcul…</b>}
          {calc === 'ok' && <b>{fmt(total)} km</b>}
          {calc === 'error' && <b className="err">Indisponible</b>}
          {calc === 'idle' && <b className="mut">—</b>}
          {calc === 'ok' && round && <small>{fmt(oneWay)} km × 2</small>}
          {calc === 'error' && <small>Vérifier les adresses (sélectionner une suggestion) ou la connexion.</small>}
        </div>

        <label>Type de transport</label>
        <select className="in" value={transport} onChange={e => setTransport(e.target.value)}>
          <option value="">Choisir…</option>
          {TRANSPORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>

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
            {carpool && <NameSelect members={members} label="Nom du chauffeur" value={driver} set={setDriver} custom={customDriver} setCustom={setCustomDriver} />}
          </>
        )}

        <fieldset className="dates">
          <legend>Avez-vous parcouru ces exacts mêmes trajets à d’autres dates ? <span className="mut">(plusieurs choix possibles)</span></legend>
          <p className="hint">Vous ne devrez donc pas réencoder ces trajets. Si de nouveaux modes de transport s’ajoutent à d’autres dates, merci de faire un nouvel encodage.</p>
          {candidates.length > 0 && (
            <div className="chips">
              {candidates.map(d => (
                <label key={d} className={extra.includes(d) ? 'on' : ''}>
                  <input type="checkbox" checked={extra.includes(d)} onChange={() => toggleExtra(d)} />{fmtDay(d)}
                </label>
              ))}
            </div>
          )}
          <div className="inline gap">
            <input type="date" className="in" value={pickDate} onChange={e => setPickDate(e.target.value)} aria-label="Autre date" />
            <button type="button" className="btn sm sec" onClick={addPicked} disabled={!pickDate}>Ajouter cette date</button>
          </div>
        </fieldset>

        {error && <p className="err">{error}</p>}
        <button className="btn" disabled={!ready || busy}>
          {busy ? 'Envoi…' : extra.filter(d => d !== date).length ? `Valider (${extra.filter(d => d !== date).length + 1} dates)` : 'Valider'}
        </button>
      </form>
    </main>
  )
}
