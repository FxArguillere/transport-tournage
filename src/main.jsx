import React from 'react'
import { createRoot } from 'react-dom/client'
import Public from './Public.jsx'
import Admin from './Admin.jsx'
import './styles.css'

const isAdmin = location.pathname.replace(/\/$/, '').endsWith('/admin')
createRoot(document.getElementById('root')).render(
  <>
    {isAdmin ? <Admin /> : <Public />}
    <footer className="ver">Version {__APP_VERSION__}</footer>
  </>
)
