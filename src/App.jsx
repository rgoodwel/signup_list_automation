import React, { useState, useEffect } from 'react'

const STORAGE_KEY = 'signup_list_automation.signups'

export default function App() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [signups, setSignups] = useState([])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) setSignups(JSON.parse(raw))
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(signups))
  }, [signups])

  function addSignup(e) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setSignups(prev => [{ id: Date.now(), name: name.trim(), email: email.trim() }, ...prev])
    setName('')
    setEmail('')
  }

  function removeSignup(id) {
    setSignups(prev => prev.filter(s => s.id !== id))
  }

  function clearAll() {
    if (!confirm('Clear all signups?')) return
    setSignups([])
  }

  return (
    <div className="container">
      <header>
        <h1>Signup List Automation</h1>
        <p>A tiny React app you can deploy as a static site to AWS.</p>
      </header>

      <main>
        <form onSubmit={addSignup} className="form">
          <input
            placeholder="Name"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <input
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>

        <section className="list">
          <div className="list-header">
            <h2>Signups ({signups.length})</h2>
            <button className="clear" onClick={clearAll}>Clear</button>
          </div>

          {signups.length === 0 ? (
            <p className="empty">No signups yet.</p>
          ) : (
            <ul>
              {signups.map(s => (
                <li key={s.id}>
                  <div className="info">
                    <strong>{s.name}</strong>
                    <small>{s.email}</small>
                  </div>
                  <button className="remove" onClick={() => removeSignup(s.id)}>Remove</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer>
        <small>Stored in browser localStorage. Build with Vite for production.</small>
      </footer>
    </div>
  )
}
