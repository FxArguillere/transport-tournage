import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'http://localhost',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing'
)
const ORS = 'https://api.openrouteservice.org'
const KEY = import.meta.env.VITE_ORS_KEY

export const TRANSPORTS = [
  ['voiture', 'Voiture'], ['bus', 'Bus'], ['train', 'Train'],
  ['tram', 'Tram'], ['velo', 'Vélo'], ['pied', 'À pied']
]
export const ENGINES = [
  ['thermique_hybride', 'Thermique / hybride'], ['essence', 'Essence'], ['diesel', 'Diesel']
]
export const transportLabel = v => (TRANSPORTS.find(t => t[0] === v) || [, v])[1]
export const engineLabel = v => (ENGINES.find(t => t[0] === v) || [, ''])[1]

export const todayStr = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Initiale majuscule + minuscules, accents conservés
export const titleCase = s =>
  s.trim().replace(/\s+/g, ' ').toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

export const isActive = (loc, date) => loc.start_date <= date && date <= loc.end_date

const geo = async (endpoint, text, signal) => {
  const q = new URLSearchParams({
    api_key: KEY, text, size: '5', 'boundary.country': 'BE,FR,NL,LU,DE',
    'focus.point.lat': '50.85', 'focus.point.lon': '4.35'
  })
  const r = await fetch(`${ORS}/geocode/${endpoint}?${q}`, { signal })
  if (!r.ok) throw new Error('geocode')
  const j = await r.json()
  return j.features.map(f => ({
    label: f.properties.label,
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1]
  }))
}

// Autocomplétion ; recherche classique en secours si aucun résultat
export async function suggest(text, signal) {
  const a = await geo('autocomplete', text, signal)
  return a.length ? a : geo('search', text, signal)
}

// Distance en km (aller simple). Profil : voiture/bus/train/tram → route, vélo, à pied.
export async function routeKm(a, b, transport, signal) {
  const profile = transport === 'velo' ? 'cycling-regular' : transport === 'pied' ? 'foot-walking' : 'driving-car'
  const r = await fetch(`${ORS}/v2/directions/${profile}`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ coordinates: [[a.lon, a.lat], [b.lon, b.lat]] })
  })
  if (!r.ok) throw new Error('route')
  const j = await r.json()
  const m = j.routes?.[0]?.summary?.distance
  if (m == null) throw new Error('route')
  return m / 1000
}

export const load = k => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } }
export const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }
