import React, { useEffect, useMemo, useState } from 'react'
import { useLeague } from './contexts/LeagueContext'
import { supabase } from './utils/supabaseClient'
import { MAX_HOLE_COUNT, parseBHoleUnlockSequence } from './storage'

const DAY_OPTIONS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value
  return fallback
}

export default function LeagueSettingsPanel({ onSaved }) {
  const league = useLeague()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('success')

  const [form, setForm] = useState({
    day_of_week: 'Monday',
    description: '',
    requires_password: false,
    password: '',
    show_email: true,
    require_email: true,
    show_phone: true,
    require_phone: true,
    require_additional_player_info: true,
    default_open_holes: 9,
    allow_b_groups: true,
    b_hole_unlock_sequence: '',
  })

  useEffect(() => {
    setForm({
      day_of_week: league?.day_of_week || 'Monday',
      description: league?.description || '',
      requires_password: toBoolean(league?.requires_password, false),
      password: league?.password || '',
      show_email: toBoolean(league?.show_email, true),
      require_email: toBoolean(league?.require_email, true),
      show_phone: toBoolean(league?.show_phone, true),
      require_phone: toBoolean(league?.require_phone, true),
      require_additional_player_info: toBoolean(league?.require_additional_player_info, true),
      default_open_holes: Number.isFinite(Number.parseInt(league?.default_open_holes, 10))
        ? Math.max(1, Math.min(Number.parseInt(league?.default_open_holes, 10), MAX_HOLE_COUNT))
        : 9,
      allow_b_groups: toBoolean(league?.allow_b_groups, true),
      b_hole_unlock_sequence: league?.b_hole_unlock_sequence || '',
    })
    setMessage('')
  }, [league])

  const normalizedSequencePreview = useMemo(() => {
    const seq = parseBHoleUnlockSequence(form.b_hole_unlock_sequence, form.default_open_holes)
    return seq.join(',')
  }, [form.b_hole_unlock_sequence, form.default_open_holes])

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setMessage('')
  }

  function handleCheckbox(field) {
    return (e) => {
      const checked = e.target.checked
      if (field === 'show_email' && !checked) {
        setForm(prev => ({ ...prev, show_email: false, require_email: false }))
      } else if (field === 'show_phone' && !checked) {
        setForm(prev => ({ ...prev, show_phone: false, require_phone: false }))
      } else {
        updateField(field, checked)
      }
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!league?.id) return

    const defaultOpenHoles = Math.max(
      1,
      Math.min(Number.parseInt(form.default_open_holes, 10) || 9, MAX_HOLE_COUNT),
    )
    const normalizedSequence = parseBHoleUnlockSequence(form.b_hole_unlock_sequence, defaultOpenHoles).join(',')

    const payload = {
      day_of_week: DAY_OPTIONS.includes(form.day_of_week) ? form.day_of_week : 'Monday',
      description: form.description?.trim() || null,
      requires_password: !!form.requires_password,
      password: form.requires_password ? (form.password || '').trim() : null,
      show_email: !!form.show_email,
      require_email: form.show_email ? !!form.require_email : false,
      show_phone: !!form.show_phone,
      require_phone: form.show_phone ? !!form.require_phone : false,
      require_additional_player_info: !!form.require_additional_player_info,
      default_open_holes: defaultOpenHoles,
      allow_b_groups: !!form.allow_b_groups,
      b_hole_unlock_sequence: normalizedSequence,
    }

    try {
      setSaving(true)
      const { error } = await supabase
        .from('leagues')
        .update(payload)
        .eq('id', league.id)

      if (error) throw error

      setForm(prev => ({
        ...prev,
        default_open_holes: defaultOpenHoles,
        b_hole_unlock_sequence: normalizedSequence,
      }))

      setMessageType('success')
      setMessage('League settings saved.')
      window.dispatchEvent(new CustomEvent('league-settings-updated'))
      if (onSaved) await onSaved()
    } catch (err) {
      console.error('Error saving league settings:', err)
      setMessageType('error')
      setMessage('Could not save league settings. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>League Settings</h2>
      </div>

      <form onSubmit={handleSave} className="league-settings-form">
        <div className="league-settings-grid">
          <label className="league-settings-field">
            <span>League Day</span>
            <select
              value={form.day_of_week}
              onChange={(e) => updateField('day_of_week', e.target.value)}
            >
              {DAY_OPTIONS.map(day => (
                <option key={day} value={day}>{day}</option>
              ))}
            </select>
          </label>

          <label className="league-settings-field">
            <span>Default Open A Holes</span>
            <input
              type="number"
              min={1}
              max={MAX_HOLE_COUNT}
              value={form.default_open_holes}
              onChange={(e) => updateField('default_open_holes', e.target.value)}
            />
          </label>

          <label className="league-settings-field league-settings-field--full">
            <span>League Description</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Shown to players on the signup page"
            />
          </label>

          <label className="league-settings-check">
            <input
              type="checkbox"
              checked={form.requires_password}
              onChange={handleCheckbox('requires_password')}
            />
            <span>Require League Password</span>
          </label>

          <label className="league-settings-field">
            <span>League Password</span>
            <input
              type="text"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              disabled={!form.requires_password}
              placeholder="Optional when password gate is disabled"
            />
          </label>

          <label className="league-settings-check">
            <input type="checkbox" checked={form.show_email} onChange={handleCheckbox('show_email')} />
            <span>Show Email Field</span>
          </label>

          <label className="league-settings-check">
            <input
              type="checkbox"
              checked={form.require_email}
              onChange={handleCheckbox('require_email')}
              disabled={!form.show_email}
            />
            <span>Require Email</span>
          </label>

          <label className="league-settings-check">
            <input type="checkbox" checked={form.show_phone} onChange={handleCheckbox('show_phone')} />
            <span>Show Phone Field</span>
          </label>

          <label className="league-settings-check">
            <input
              type="checkbox"
              checked={form.require_phone}
              onChange={handleCheckbox('require_phone')}
              disabled={!form.show_phone}
            />
            <span>Require Phone</span>
          </label>

          <label className="league-settings-check">
            <input
              type="checkbox"
              checked={form.require_additional_player_info}
              onChange={handleCheckbox('require_additional_player_info')}
            />
            <span>Require Additional Player Info</span>
          </label>

          <label className="league-settings-check">
            <input
              type="checkbox"
              checked={form.allow_b_groups}
              onChange={handleCheckbox('allow_b_groups')}
            />
            <span>Allow B Holes</span>
          </label>

          <label className="league-settings-field league-settings-field--full">
            <span>B Hole Unlock Sequence (comma-separated)</span>
            <input
              type="text"
              value={form.b_hole_unlock_sequence}
              onChange={(e) => updateField('b_hole_unlock_sequence', e.target.value)}
              placeholder="Example: 5,1,3,2,4,6,7,8,9"
            />
            <small className="muted">Effective sequence: {normalizedSequencePreview}B</small>
          </label>
        </div>

        <div className="league-settings-actions">
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save League Settings'}
          </button>
        </div>
        {message && (
          <p className={`form-msg ${messageType === 'error' ? 'form-msg--error' : 'form-msg--success'}`}>
            {message}
          </p>
        )}
      </form>
    </section>
  )
}
