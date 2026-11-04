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
  const typed = useRef(false)
  const input = useRef(null)

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

  const pick = s => {
    typed.current = false
    onChange({ text: s.label, lat: s.lat, lon: s.lon })
    setList([]); setOpen(false)
  }
  const clear = () => {
    typed.current = false
    onChange({ text: '', lat: null, lon: null })
    setList([]); setSearchErr(false)
    input.current?.focus()
  }
  const here = async () => {
    setGeoBusy(true); setGeoErr(false)
    try { const a = await locateMe(); typed.current = false; onChange(a) } catch { setGeoErr(true) }
    setGeoBusy(false)
  }

  return (
    <div className="addr">
      <div className="field">
        <input
          ref={input} className="in" value={value.text} placeholder={placeholder}
          autoComplete="off" inputMode="text"
          onFocus={() => setOpen(true)}
          onChange={e => { typed.current = true; setOpen(true); onChange({ text: e.target.value, lat: null, lon: null }) }}
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
        <button type="button" className="locate" onClick={here} disabled={geoBusy}>
          {geoBusy ? 'Localisation…' : '📍 Utiliser ma position'}
        </button>
      )}
      {geoErr && <p className="hint">Position indisponible : saisir l’adresse.</p>}
    </div>
  )
}
