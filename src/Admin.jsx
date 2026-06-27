import React, { useState } from 'react'

export default function AdminPanel({ profiles = {}, groups = [], onClose, onSaveGroups }) {
  const [localGroups, setLocalGroups] = useState(groups)

  function removeGroup(id) {
    if (!confirm('Remove this entire group?')) return
    const updated = localGroups.filter(g => g.id !== id)
    setLocalGroups(updated)
  }

  function save() {
    if (!confirm('Save changes to groups?')) return
    onSaveGroups(localGroups)
    onClose()
  }

  return (
    <div className="container se-brand">
      <header>
        <h1>Admin Panel</h1>
        <p>Admin-only view: player names and emails. Make changes and save.</p>
      </header>

      <main>
        <section style={{marginTop:12}}>
          <h2>Profiles ({Object.keys(profiles).length})</h2>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr>
                <th style={{textAlign:'left'}}>Name</th>
                <th style={{textAlign:'left'}}>Email</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(profiles).map(p => (
                <tr key={p.email + p.name}>
                  <td style={{padding:6}}>{p.name}</td>
                  <td style={{padding:6}}>{p.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section style={{marginTop:16}}>
          <h2>Groups ({localGroups.length})</h2>
          {localGroups.map(g => (
            <div key={g.id} style={{padding:8,marginBottom:8,borderRadius:6,background:'var(--card)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>Group ID: {g.id}</div>
                <div>
                  <button onClick={() => removeGroup(g.id)}>Remove Group</button>
                </div>
              </div>
              <div style={{marginTop:8}}>
                {g.players.map(p => (
                  <div key={p.email + p.name} style={{display:'flex',justifyContent:'space-between'}}>
                    <div>{p.name}</div>
                    <div>{p.email}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        <div style={{marginTop:12,display:'flex',gap:8}}>
          <button onClick={save}>Save and Close</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </main>
    </div>
  )
}
