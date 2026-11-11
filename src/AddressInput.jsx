import { useEffect, useRef, useState } from 'react'
import { suggest, locateMe } from './lib.js'

// value = { text, lat, lon }. Coordonnées null tant qu'aucune suggestion n'est choisie.
export default function AddressInput({ value, onChange, placeholder, locate }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const [searchErr, setSearchErr] = useState(false)
  const [noResult, setNoResult] = useState(false)
  const [loading, setLoading] = useState(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErr, setGeoErr] = useState(false)
  const [fromPos, setFromPos] = useState(false)
  const typed = useRef(false)
  const input = useRef(null)
  const latest = useRef(value)
  const geoTok = useRef(0)
  latest.current = value

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

  // Toute action de l'utilisateur annule une localisation encore en attente
  const cancelGeo = () => { geoTok.current++; setGeoBusy(false) }

  const pick = s => {
    cancelGeo(); setFromPos(false)
    typed.current = false
    onChange({ text: s.label, lat: s.lat, lon: s.lon })
    setList([]); setOpen(false)
  }
  const clear = () => {
    cancelGeo(); setFromPos(false)
    typed.current = false
    onChange({ text: '', lat: null, lon: null })
    setList([]); setSearchErr(false)
    input.current?.focus()
  }
  const here = async () => {
    const tok = ++geoTok.current
    const startText = value.text
    setGeoBusy(true); setGeoErr(false)
    try {
      const a = await locateMe()
      // Réponse ignorée si l'utilisateur a entre-temps tapé, choisi ou annulé
      if (tok === geoTok.current && latest.current.text === startText) { typed.current = false; setFromPos(true); onChange(a) }
    } catch { if (tok === geoTok.current) setGeoErr(true) }
    if (tok === geoTok.current) setGeoBusy(false)
  }

  return (
    <div className="addr">
      <div className="field">
        <input
          ref={input} className="in" value={value.text} placeholder={placeholder}
          autoComplete="off" inputMode="text"
          onFocus={() => setOpen(true)}
          onChange={e => { cancelGeo(); setFromPos(false); typed.current = true; setOpen(true); onChange({ text: e.target.value, lat: null, lon: null }) }}
          onBlur={() => { setOpen(false); if (value.lat == null && list[0]) pick(list[0]) }}
        />
        {value.text && (
          <button type="button" className="clear" aria-label="Effacer l’adresse"
            onPointerDown={e => { e.preventDefault(); clear() }}>✕</button>
        )}
      </div>
      {open && list.length > 0 && (
        <ul className="sug">
          {list.map(s => (
            <li key={s.label + s.lat} onPointerDown={e => { e.preventDefault(); pick(s) }}>{s.label}</li>
          ))}
        </ul>
      )}
      {loading && !list.length && <p className="hint">Recherche…</p>}
      {searchErr && <p className="hint">Recherche d’adresse momentanément indisponible. Réessayer dans un instant.</p>}
      {noResult && value.lat == null && (
        <p className="hint">Aucune adresse trouvée : essayer avec le numéro et la ville.</p>
      )}
      {locate && (
        <button type="button" className="locate" onClick={geoBusy ? cancelGeo : here}>
          {geoBusy ? 'Localisation en cours… Annuler' : '📍 Utiliser ma position'}
        </button>
      )}
      {fromPos && value.lat != null && <p className="hint">Adresse issue de votre position. Taper pour la modifier ou ✕ pour l’effacer.</p>}
      {geoErr && <p className="hint">Position indisponible : saisir l’adresse.</p>}
    </div>
  )
}
