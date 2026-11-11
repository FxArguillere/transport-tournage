import { useEffect, useRef, useState } from 'react'
import { suggest, locateMe } from './lib.js'

// Protection anti « clic fantôme » : un appui sur « Utiliser ma position » juste après le choix
// d'une suggestion est ignoré (sur mobile, le clic peut retomber sur le bouton situé dessous).
let lastPickAt = 0
export const markPick = () => { lastPickAt = Date.now() }
export const recentlyPicked = () => Date.now() - lastPickAt < 500

// Localisation du téléphone. La réponse est abandonnée si l'utilisateur a modifié le champ
// (ou appelé cancel) entre-temps, car elle peut arriver plusieurs secondes plus tard.
export function useLocate(text, apply) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const tok = useRef(0)
  const latest = useRef(text)
  latest.current = text
  const cancel = () => { tok.current++; setBusy(false) }
  const run = async () => {
    if (recentlyPicked()) return
    const t = ++tok.current
    const start = text
    setBusy(true); setErr(false)
    try {
      const a = await locateMe()
      if (t === tok.current && latest.current === start) apply(a)
    } catch { if (t === tok.current) setErr(true) }
    if (t === tok.current) setBusy(false)
  }
  return { busy, err, run, cancel }
}

// En-tête d'un champ : libellé à gauche, bouton de localisation à droite (hors de la zone des suggestions)
export function FieldHead({ label, geo }) {
  return (
    <div className="fhead">
      <label>{label}</label>
      {geo && (
        <button type="button" className="locate" onClick={geo.busy ? geo.cancel : geo.run}>
          {geo.busy ? 'Localisation… Annuler' : '📍 Utiliser ma position'}
        </button>
      )}
    </div>
  )
}

// value = { text, lat, lon }. Coordonnées null tant qu'aucune suggestion n'est choisie.
export default function AddressInput({ value, onChange, placeholder, label, locate }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [searchErr, setSearchErr] = useState(false)
  const [noResult, setNoResult] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fromPos, setFromPos] = useState(false)
  const typed = useRef(false)
  const input = useRef(null)
  const blurTimer = useRef(null)

  const geo = useLocate(value.text, a => { typed.current = false; setFromPos(true); onChange(a) })

  useEffect(() => {
    if (!typed.current || value.lat != null || value.text.trim().length < 3) { setList([]); setSearchErr(false); setNoResult(false); setLoading(false); return }
    setNoResult(false)
    const ac = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try { const r = await suggest(value.text, ac.signal); setList(r); setSearchErr(false); setNoResult(!r.length) }
      catch (e) { if (e.name !== 'AbortError') { setList([]); setSearchErr(true) } }
      setLoading(false)
    }, 350)
    return () => { clearTimeout(t); ac.abort() }
  }, [value.text])

  useEffect(() => () => clearTimeout(blurTimer.current), [])

  const pick = s => {
    clearTimeout(blurTimer.current)
    markPick(); geo.cancel(); setFromPos(false)
    typed.current = false
    onChange({ text: s.label, lat: s.lat, lon: s.lon })
    setList([]); setOpen(false)
  }
  const clear = () => {
    geo.cancel(); setFromPos(false)
    typed.current = false
    onChange({ text: '', lat: null, lon: null })
    setList([]); setSearchErr(false)
    input.current?.focus()
  }
  // Fermeture différée : laisse au clic sur une suggestion le temps d'aboutir avant de fermer la liste
  const onBlur = () => {
    clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => {
      setOpen(false)
      if (latest.current.lat == null && listRef.current[0]) pick(listRef.current[0])
    }, 250)
  }
  const latest = useRef(value); latest.current = value
  const listRef = useRef(list); listRef.current = list

  return (
    <div className="addr">
      {label && <FieldHead label={label} geo={locate ? geo : null} />}
      <div className="field">
        <input
          ref={input} className="in" value={value.text} placeholder={placeholder}
          autoComplete="off" inputMode="text"
          onFocus={() => { clearTimeout(blurTimer.current); setOpen(true) }}
          onChange={e => { geo.cancel(); setFromPos(false); typed.current = true; setOpen(true); onChange({ text: e.target.value, lat: null, lon: null }) }}
          onBlur={onBlur}
        />
        {value.text && (
          <button type="button" className="clear" aria-label="Effacer l’adresse"
            onPointerDown={e => e.preventDefault()} onClick={clear}>✕</button>
        )}
      </div>
      {open && list.length > 0 && (
        <ul className="sug">
          {list.map(s => (
            <li key={s.label + s.lat} onPointerDown={e => e.preventDefault()} onClick={() => pick(s)}>{s.label}</li>
          ))}
        </ul>
      )}
      {loading && !list.length && <p className="hint">Recherche…</p>}
      {searchErr && <p className="hint">Recherche d’adresse momentanément indisponible. Réessayer dans un instant.</p>}
      {noResult && value.lat == null && (
        <p className="hint">Aucune adresse trouvée : essayer avec le numéro et la ville.</p>
      )}
      {fromPos && value.lat != null && <p className="hint">Adresse issue de votre position. Taper pour la modifier ou ✕ pour l’effacer.</p>}
      {locate && geo.err && <p className="hint">Position indisponible : saisir l’adresse.</p>}
    </div>
  )
}
