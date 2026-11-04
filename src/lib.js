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
  try {
    const r = await fetch(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}&lang=fr`)
    if (r.ok) { const x = fromPhoton(await r.json())[0]; if (x) return x.label }
  } catch {}
  const q = new URLSearchParams({ api_key: KEY, 'point.lat': lat, 'point.lon': lon, size: '1' })
  const r = await fetch(`${ORS}/geocode/reverse?${q}`)
  if (!r.ok) throw new Error('reverse')
  const j = await r.json()
  return j.features?.[0]?.properties?.label || null
}

// Position du téléphone → adresse { text, lat, lon }
export function locateMe() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('geo'))
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lon } = pos.coords
      let label = null
      try { label = await reverseGeo(lat, lon) } catch {}
      resolve({ text: label || 'Position actuelle', lat, lon })
    }, reject, { timeout: 8000, maximumAge: 60000 })
  })
}

export const isActive = (loc, date) => loc.start_date <= date && date <= loc.end_date

const COUNTRIES = ['BE', 'FR', 'NL', 'LU', 'DE']
const cache = new Map()

// Libellé lisible d'un résultat Photon : « Gare du Midi, Rue d'Angleterre, Saint-Gilles »
const photonLabel = p => {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ')
  const parts = [p.name && p.name !== street ? p.name : null, street || null, p.city || p.district || p.county || null]
  const label = [...new Set(parts.filter(Boolean))].join(', ')
  return p.countrycode && p.countrycode !== 'BE' ? `${label}, ${p.countrycode}` : label
}
const fromPhoton = j => {
  const all = (j.features || []).map(f => ({
    label: photonLabel(f.properties), cc: f.properties.countrycode,
    lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1]
  })).filter(r => r.label)
  const near = all.filter(r => COUNTRIES.includes(r.cc))
  const seen = new Set()
  return (near.length ? near : all).filter(r => !seen.has(r.label) && seen.add(r.label)).slice(0, 5)
}

async function photon(text, signal) {
  const q = new URLSearchParams({ q: text, limit: '8', lat: '50.85', lon: '4.35', lang: 'fr' })
  const r = await fetch(`https://photon.komoot.io/api/?${q}`, { signal })
  if (!r.ok) throw new Error('photon')
  return fromPhoton(await r.json())
}

async function orsSearch(text, signal) {
  const q = new URLSearchParams({
    api_key: KEY, text, size: '5', 'boundary.country': COUNTRIES.join(','),
    'focus.point.lat': '50.85', 'focus.point.lon': '4.35'
  })
  const r = await fetch(`${ORS}/geocode/search?${q}`, { signal })
  if (!r.ok) throw new Error('geocode')
  const j = await r.json()
  return j.features.map(f => ({ label: f.properties.label, lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }))
}

// Suggestions d'adresse : Photon d'abord (pas de quota), OpenRouteService en renfort
export async function suggest(text, signal) {
  const k = text.trim().toLowerCase()
  if (cache.has(k)) return cache.get(k)
  let res = []
  try { res = await photon(text, signal) } catch (e) { if (e.name === 'AbortError') throw e }
  if (!res.length) res = await orsSearch(text, signal)
  cache.set(k, res)
  return res
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
