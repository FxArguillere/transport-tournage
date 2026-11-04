import { useEffect, useRef, useState } from 'react'
import { suggest, reverseGeo } from './lib.js'

// value = { text, lat, lon }. Coordonnées null tant qu'aucune suggestion n'est choisie.
export default function AddressInput({ value, onChange, placeholder, locate }) {
  const [list, setList] = useState([])
  const [open, setOpen] = useState(false)
  const typed = useRef(false)
  const [geoBusy, setGeoBusy] = useState(false)
  const [geoErr, setGeoErr] = useState(false)

  const here = () => {
    if (!navigator.geolocation) { setGeoErr(true); return }
    setGeoBusy(true); setGeoErr(false)
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords
      let label = null
      try { label = await reverseGeo(lat, lon) } catch {}
      typed.current = false
      onChange({ text: label || 'Position actuelle', lat, lon })
      setGeoBusy(false)
    }, () => { setGeoBusy(false); setGeoErr(true) }, { timeout: 8000, maximumAge: 60000 })
  }

  useEffect(() => {
    if (!typed.current || value.text.trim().length < 3) { setList([]); return }
    const ac = new AbortController()
    const t = setTimeout(async () => {
      try { setList(await suggest(value.text, ac.signal)) } catch {}
    }, 300)
    return () => { clearTimeout(t); ac.abort() }
  }, [value.text])

  const pick = s => {
    typed.current = false
    onChange({ text: s.label, lat: s.lat, lon: s.lon })
    setList([]); setOpen(false)
  }

  return (
    <div className="addr">
      <input
        className="in" value={value.text} placeholder={placeholder}
        autoComplete="off" inputMode="text"
        onFocus={() => setOpen(true)}
        onChange={e => { typed.current = true; setOpen(true); onChange({ text: e.target.value, lat: null, lon: null }) }}
        onBlur={() => { setOpen(false); if (value.lat == null && list[0]) pick(list[0]) }}
      />
      {open && list.length > 0 && (
        <ul className="sug">
          {list.map(s => (
            <li key={s.label + s.lat} onPointerDown={e => { e.preventDefault(); pick(s) }}>{s.label}</li>
          ))}
        </ul>
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
