import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'http://localhost',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'missing'
)
const ORS = 'https://api.openrouteservice.org'
const KEY = import.meta.env.VITE_ORS_KEY

export const TRANSPORTS = [
  ['voiture', 'Voiture'], ['bus', 'Bus'], ['train', 'Train'],
  ['tram', 'Tram'], ['velo', 'Vélo'], ['pied', 'À pied'],
  ['taxi', 'Taxi'], ['moto', 'Moto']
]
export const TRANSPORT_ICONS = {
  voiture: '🚗', bus: '🚌', train: '🚆', tram: '🚋', velo: '🚲', pied: '🚶', taxi: '🚕', moto: '🛵'
}
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

export const fmtDay = d => {
  const [y, m, j] = d.split('-').map(Number)
  const w = new Date(y, m - 1, j).toLocaleDateString('fr-BE', { weekday: 'short' })
  return `${w} ${String(j).padStart(2, '0')}/${String(m).padStart(2, '0')}`
}
// Toutes les dates (YYYY-MM-DD) de a à b inclus, plafonné à max jours
export const daysBetween = (a, b, max = 62) => {
  const out = []
  const d = new Date(a + 'T12:00:00'), e = new Date(b + 'T12:00:00')
  while (d <= e && out.length < max) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1) }
  return out
}

// Comparaison de noms sans accents ni casse
export const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
export const legTotal = l => (l.oneWay == null ? 0 : Math.round(l.oneWay * (l.round ? 2 : 1) * 100) / 100)

export async function reverseGeo(lat, lon) {
  const q = new URLSearchParams({ api_key: KEY, 'point.lat': lat, 'point.lon': lon, size: '1' })
  const r = await fetch(`${ORS}/geocode/reverse?${q}`)
  if (!r.ok) throw new Error('reverse')
  const j = await r.json()
  return j.features?.[0]?.properties?.label || null
}

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
