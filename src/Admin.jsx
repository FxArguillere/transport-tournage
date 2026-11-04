import { useCallback, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import AddressInput from './AddressInput.jsx'
import { supabase, todayStr, titleCase, isActive, transportLabel, engineLabel } from './lib.js'

const fr = d => d.split('-').reverse().join('/')

export default function Admin() {
  const [session, setSession] = useState(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (session === undefined) return <main className="wrap"><p className="mut">Chargement…</p></main>
  return session ? <Console /> : <Login />
}

function Login() {
  const [email, setEmail] = useState('')
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState('')
  async function go(e) {
    e.preventDefault(); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd })
    if (error) setErr('Identifiant ou mot de passe incorrect.')
  }
  return (
    <main className="wrap narrow">
      <h1>Console admin</h1>
      <form onSubmit={go}>
        <label>Identifiant</label>
        <input className="in" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
        <label>Mot de passe</label>
        <input className="in" type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoComplete="current-password" required />
        {err && <p className="err">{err}</p>}
        <button className="btn">Se connecter</button>
      </form>
    </main>
  )
}

function Console() {
  const [tab, setTab] = useState('team')
  return (
    <main className="wrap wide">
      <div className="top">
        <h1>Console admin</h1>
        <button className="btn sm sec" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
      <nav className="tabs">
        {[['team', 'Équipe'], ['places', 'Lieux'], ['export', 'Export'], ['qr', 'QR code']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </nav>
      {tab === 'team' && <Team />}
      {tab === 'places' && <Places />}
      {tab === 'export' && <Export />}
      {tab === 'qr' && <QrCode />}
    </main>
  )
}

function Team() {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const refresh = useCallback(async () => {
    const { data } = await supabase.from('members').select('*').order('name')
    setRows(data || [])
  }, [])
  useEffect(() => { refresh() }, [refresh])

  async function add(e) {
    e.preventDefault()
    const n = titleCase(name); if (!n) return
    const { error } = await supabase.from('members').upsert({ name: n }, { onConflict: 'name', ignoreDuplicates: true })
    setMsg(error ? error.message : ''); setName(''); refresh()
  }
  async function del(id) { await supabase.from('members').delete().eq('id', id); refresh() }

  async function importCsv(e) {
    const f = e.target.files[0]; e.target.value = ''
    if (!f) return
    const lines = (await f.text()).replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const names = lines.map(l => l.split(/[;,\t]/).map(c => c.replace(/^"|"$/g, '').trim()).filter(Boolean).join(' '))
      .filter((n, i) => !(i === 0 && /^(nom|pr[eé]nom|name)\b/i.test(n)))
      .map(titleCase).filter(Boolean)
    const uniq = [...new Set(names)]
    const { error } = await supabase.from('members').upsert(uniq.map(name => ({ name })), { onConflict: 'name', ignoreDuplicates: true })
    setMsg(error ? error.message : `${uniq.length} nom(s) traité(s).`); refresh()
  }

  return (
    <section>
      <div className="top">
        <form onSubmit={add} className="inline">
          <input className="in" placeholder="Prénom Nom" value={name} onChange={e => setName(e.target.value)} />
          <button className="btn sm">Ajouter</button>
        </form>
        <label className="btn sm sec">Importer un CSV<input type="file" accept=".csv,text/csv,text/plain" hidden onChange={importCsv} /></label>
      </div>
      {msg && <p className="mut">{msg}</p>}
      <table><thead><tr><th>Nom ({rows.length})</th><th /></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.name}</td><td className="r"><button className="link" onClick={() => del(r.id)}>Supprimer</button></td></tr>
        ))}</tbody></table>
      <p className="hint">CSV : un nom par ligne, ou deux colonnes prénom;nom. La casse est normalisée (Initiale majuscule).</p>
    </section>
  )
}

function Places() {
  const [rows, setRows] = useState([])
  const [name, setName] = useState('')
  const [addr, setAddr] = useState({ text: '', lat: null, lon: null })
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [err, setErr] = useState('')
  const refresh = useCallback(async () => {
    const { data } = await supabase.from('locations').select('*').order('start_date')
    setRows(data || [])
  }, [])
  useEffect(() => { refresh() }, [refresh])

  async function add(e) {
    e.preventDefault(); setErr('')
    if (addr.lat == null) return setErr('Choisir une adresse dans les suggestions.')
    if (to < from) return setErr('La date de fin précède la date de début.')
    const { error } = await supabase.from('locations').insert({
      name: name.trim(), address: addr.text, lat: addr.lat, lon: addr.lon, start_date: from, end_date: to
    })
    if (error) return setErr(error.message)
    setName(''); setAddr({ text: '', lat: null, lon: null }); refresh()
  }
  async function del(id) { await supabase.from('locations').delete().eq('id', id); refresh() }
  const today = todayStr()

  return (
    <section>
      <form onSubmit={add} className="grid">
        <div><label>Nom du lieu</label><input className="in" required value={name} onChange={e => setName(e.target.value)} /></div>
        <div><label>Adresse</label><AddressInput value={addr} onChange={setAddr} placeholder="Rue, numéro, ville" /></div>
        <div><label>Du</label><input className="in" type="date" required value={from} onChange={e => { setFrom(e.target.value); if (to < e.target.value) setTo(e.target.value) }} /></div>
        <div><label>Au</label><input className="in" type="date" required value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        <button className="btn sm">Ajouter le lieu</button>
      </form>
      {err && <p className="err">{err}</p>}
      <table><thead><tr><th>Nom</th><th>Adresse</th><th>Dates</th><th>Statut</th><th /></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.name}</td><td>{r.address}</td>
            <td>{r.start_date === r.end_date ? fr(r.start_date) : `${fr(r.start_date)} → ${fr(r.end_date)}`}</td>
            <td>{isActive(r, today) ? <span className="badge">Actif</span> : r.start_date > today ? 'À venir' : 'Terminé'}</td>
            <td className="r"><button className="link" onClick={() => del(r.id)}>Supprimer</button></td></tr>
        ))}</tbody></table>
    </section>
  )
}

async function fetchTrips(from, to) {
  const all = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from('trips').select('*')
      .gte('trip_date', from).lte('trip_date', to)
      .order('trip_date').order('member_name').order('created_at').order('leg').range(i, i + 999)
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

function Export() {
  const [from, setFrom] = useState(todayStr())
  const [to, setTo] = useState(todayStr())
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')

  async function preview() {
    setErr('')
    try { setRows(await fetchTrips(from, to)) } catch (e) { setErr(e.message) }
  }
  function download() {
    const oui = b => (b ? 'Oui' : 'Non')
    const data = rows.map(t => ({
      'Nom': t.member_name, 'Date': fr(t.trip_date), 'Étape': `${t.leg}/${t.legs_total}`,
      'Adresse départ': t.start_address, 'Adresse arrivée': t.end_address,
      'Km calculés': Number(t.km_total), 'Aller/retour': oui(t.round_trip),
      'Type de transport': transportLabel(t.transport), 'Type de moteur': engineLabel(t.engine),
      'Covoiturage': oui(t.carpool), 'Nom du chauffeur': t.driver_name || ''
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [22, 11, 8, 40, 40, 12, 12, 16, 20, 12, 22].map(wch => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Transports')
    XLSX.writeFile(wb, `transports_${from}_${to}.xlsx`)
  }

  return (
    <section>
      <div className="inline end">
        <div><label>Du</label><input className="in" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label>Au</label><input className="in" type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
        <button className="btn sm" onClick={preview}>Afficher</button>
        <button className="btn sm sec" disabled={!rows?.length} onClick={download}>Exporter .xlsx</button>
      </div>
      {err && <p className="err">{err}</p>}
      {rows && (
        <>
          <p className="hint">{rows.length} trajet(s). Aperçu des 50 premiers.</p>
          <div className="scroll"><table><thead><tr><th>Nom</th><th>Date</th><th>Étape</th><th>Km</th><th>A/R</th><th>Transport</th><th>Covoit.</th></tr></thead>
            <tbody>{rows.slice(0, 50).map(t => (
              <tr key={t.id}><td>{t.member_name}</td><td>{fr(t.trip_date)}</td><td>{t.leg}/{t.legs_total}</td><td>{Number(t.km_total).toFixed(2)}</td>
                <td>{t.round_trip ? 'Oui' : 'Non'}</td>
                <td>{transportLabel(t.transport)}{t.engine ? ` (${engineLabel(t.engine)})` : ''}</td>
                <td>{t.carpool ? `Oui – ${t.driver_name}` : 'Non'}</td></tr>
            ))}</tbody></table></div>
        </>
      )}
    </section>
  )
}

function download(url, filename) {
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
}

function QrCode() {
  const [url, setUrl] = useState(location.origin + import.meta.env.BASE_URL)
  const [title, setTitle] = useState('Déclarez votre trajet')
  const [sub, setSub] = useState('Scanner ce QR code avec l’appareil photo du téléphone')
  const [png, setPng] = useState('')

  useEffect(() => {
    let off = false
    import('qrcode').then(Q => Q.toDataURL(url || ' ', { width: 1200, margin: 4, errorCorrectionLevel: 'M' }))
      .then(d => { if (!off) setPng(d) })
    return () => { off = true }
  }, [url])

  function jpg() {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0)
      download(c.toDataURL('image/jpeg', 0.95), 'qr-transport-tournage.jpg')
    }
    img.src = png
  }
  async function pdf() {
    const { jsPDF } = await import('jspdf')
    const d = new jsPDF({ unit: 'mm', format: 'a4' })
    d.setFont('helvetica', 'bold'); d.setFontSize(30)
    d.text(d.splitTextToSize(title, 170), 105, 50, { align: 'center' })
    d.addImage(png, 'PNG', 40, 85, 130, 130)
    d.setFont('helvetica', 'normal'); d.setFontSize(16)
    d.text(d.splitTextToSize(sub, 160), 105, 232, { align: 'center' })
    d.setFontSize(11); d.setTextColor(90)
    d.text(url, 105, 280, { align: 'center' })
    d.save('affiche-qr-transport.pdf')
  }

  return (
    <section>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div><label>Adresse de l’app</label><input className="in" value={url} onChange={e => setUrl(e.target.value)} /></div>
        <div><label>Titre de l’affiche</label><input className="in" value={title} onChange={e => setTitle(e.target.value)} /></div>
        <div style={{ gridColumn: '1/-1' }}><label>Sous-titre</label><input className="in" value={sub} onChange={e => setSub(e.target.value)} /></div>
      </div>
      <div className="inline" style={{ marginTop: 16 }}>
        <button className="btn sm" onClick={jpg} disabled={!png}>Télécharger le QR (JPG)</button>
        <button className="btn sm" onClick={() => download(png, 'qr-transport-tournage.png')} disabled={!png}>QR (PNG)</button>
        <button className="btn sm sec" onClick={pdf} disabled={!png}>Affiche A4 prête à imprimer (PDF)</button>
      </div>
      <div style={{ textAlign: 'center', marginTop: 20 }}>{png && <img src={png} alt="QR code" style={{ width: 260, background: '#fff', border: '1px solid var(--line)' }} />}</div>
      <p className="hint">Le QR pointe vers l’adresse ci-dessus. Si l’adresse de l’app change, régénérer le QR.</p>
    </section>
  )
}
