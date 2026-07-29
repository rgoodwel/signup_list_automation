import React, { useEffect, useState } from 'react'
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

const HOLE_OPTIONS = Array.from({ length: MAX_HOLE_COUNT }, (_, i) => i + 1)

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
    const requireEmail = toBoolean(league?.require_email, true)
    const requirePhone = toBoolean(league?.require_phone, true)
    const showEmail = requireEmail ? true : toBoolean(league?.show_email, true)
    const showPhone = requirePhone ? true : toBoolean(league?.show_phone, true)

    setForm({
      day_of_week: league?.day_of_week || 'Monday',
      description: league?.description || '',
      requires_password: toBoolean(league?.requires_password, false),
      password: league?.password || '',
      show_email: showEmail,
      require_email: requireEmail,
      show_phone: showPhone,
      require_phone: requirePhone,
      require_additional_player_info: toBoolean(league?.require_additional_player_info, true),
      default_open_holes: Number.isFinite(Number.parseInt(league?.default_open_holes, 10))
        ? Math.max(1, Math.min(Number.parseInt(league?.default_open_holes, 10), MAX_HOLE_COUNT))
        : 9,
      allow_b_groups: toBoolean(league?.allow_b_groups, true),
      b_hole_unlock_sequence: league?.b_hole_unlock_sequence || '',
    })
    setMessage('')
  }, [league])

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
      } else if (field === 'require_email') {
        setForm(prev => ({ ...prev, require_email: checked, show_email: checked ? true : prev.show_email }))
      } else if (field === 'require_phone') {
        setForm(prev => ({ ...prev, require_phone: checked, show_phone: checked ? true : prev.show_phone }))
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
    const requireEmail = !!form.require_email
    const requirePhone = !!form.require_phone
    const showEmail = requireEmail ? true : !!form.show_email
    const showPhone = requirePhone ? true : !!form.show_phone

    const payload = {
      day_of_week: DAY_OPTIONS.includes(form.day_of_week) ? form.day_of_week : 'Monday',
      description: form.description?.trim() || null,
      requires_password: !!form.requires_password,
      password: form.requires_password ? (form.password || '').trim() : null,
      show_email: showEmail,
      require_email: requireEmail,
      show_phone: showPhone,
      require_phone: requirePhone,
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
        show_email: showEmail,
        require_email: requireEmail,
        show_phone: showPhone,
        require_phone: requirePhone,
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
      <form onSubmit={handleSave} className="league-settings-form">
        <div className="league-settings-section">
          <h3>General League Setup</h3>
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

            <label className="league-settings-field league-settings-field--full">
              <span>League Description</span>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Shown to players on the signup page"
              />
              <small className="muted">
                Separate lines with a semicolon (;). Example: League starts at 5:30 PM; Please arrive 15 minutes early.
              </small>
            </label>

            <label className="league-settings-check league-settings-field--full">
              <input
                type="checkbox"
                checked={form.requires_password}
                onChange={handleCheckbox('requires_password')}
              />
              <span>Require League Password to Signup</span>
            </label>

            {form.requires_password && (
              <label className="league-settings-field league-settings-field--full">
                <span>League Password</span>
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  placeholder="Enter password players must use to signup"
                />
              </label>
            )}
          </div>
        </div>

        <div className="league-settings-section">
          <h3>Player Signup Requirements</h3>
          <div className="league-settings-grid">
            <p className="muted league-settings-subtitle league-settings-field--full">
              Email Settings: Control whether player email is requested and whether it is required.
            </p>
            <label className="league-settings-check">
              <input
                type="checkbox"
                checked={form.show_email}
                onChange={handleCheckbox('show_email')}
                disabled={form.require_email}
              />
              <span>Request Player Email</span>
            </label>

            <label className="league-settings-check">
              <input
                type="checkbox"
                checked={form.require_email}
                onChange={handleCheckbox('require_email')}
                disabled={!form.show_email}
              />
              <span>Require Player Email</span>
            </label>

            <p className="muted league-settings-subtitle league-settings-field--full">
              Phone Settings: Control whether player phone is requested and whether it is required.
            </p>
            <label className="league-settings-check">
              <input
                type="checkbox"
                checked={form.show_phone}
                onChange={handleCheckbox('show_phone')}
                disabled={form.require_phone}
              />
              <span>Request Player Phone</span>
            </label>

            <label className="league-settings-check">
              <input
                type="checkbox"
                checked={form.require_phone}
                onChange={handleCheckbox('require_phone')}
                disabled={!form.show_phone}
              />
              <span>Require Player Phone</span>
            </label>

            <p className="muted league-settings-subtitle league-settings-field--full">
              Additional Player Settings: Decide whether added golfers must provide contact details.
            </p>
            <label className="league-settings-check league-settings-field--full">
              <input
                type="checkbox"
                checked={form.require_additional_player_info}
                onChange={handleCheckbox('require_additional_player_info')}
              />
              <span>Require Additional Player Info</span>
            </label>
          </div>
        </div>

        <div className="league-settings-section">
          <h3>Hole and Group Settings</h3>
          <div className="league-settings-rows">
            <div className="league-settings-row">
              <label className="league-settings-field league-settings-field--compact">
                <span>Number of Holes</span>
                <select
                  value={form.default_open_holes}
                  onChange={(e) => updateField('default_open_holes', Number.parseInt(e.target.value, 10))}
                >
                  {HOLE_OPTIONS.map(holeCount => (
                    <option key={holeCount} value={holeCount}>
                      {holeCount}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="league-settings-row league-settings-row--hole-group">
              <div className="league-settings-bgroup-panel league-settings-field--full">
                <div className="league-settings-bgroup-header">
                  <label className="league-settings-check league-settings-check--inline">
                    <input
                      type="checkbox"
                      checked={form.allow_b_groups}
                      onChange={handleCheckbox('allow_b_groups')}
                    />
                    <span>Enable B Holes/Groups</span>
                  </label>
                </div>

                <label className={`league-settings-field league-settings-field--grow${!form.allow_b_groups ? ' league-settings-field--disabled' : ''}`}>
                  <span>B Hole/Group Unlock Sequence (comma-separated)</span>
                  <input
                    type="text"
                    value={form.b_hole_unlock_sequence}
                    onChange={(e) => updateField('b_hole_unlock_sequence', e.target.value)}
                    placeholder="Example: 5,1,3,2,4,6,7,8,9"
                    disabled={!form.allow_b_groups}
                  />
                  <small className="muted">
                    Common setup: unlock B groups on par 5s first, then par 4s, then par 3s.
                  </small>
                </label>
              </div>
            </div>
          </div>
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
