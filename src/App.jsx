import { useEffect, useMemo, useRef, useState } from 'react'

const API_BASE = 'http://127.0.0.1:8000'
const PAGE_SIZE = 15

const PAGES = [
  { id: 'login', label: 'Login' },
  { id: 'patients', label: 'Patients' },
  { id: 'consultations', label: 'Consultations' },
]

const COOKIE_ACCESS = 'access_token'
const COOKIE_REFRESH = 'refresh_token'

function setCookie(name, value, days = 1) {
  const expires = new Date(Date.now() + days * 86400000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`
}

function getCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
  if (!match) return ''
  return decodeURIComponent(match.split('=')[1] || '')
}

function clearCookie(name) {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`
}

function formatDate(value) {
  if (!value) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}

function buildQuery(paramsObj) {
  const params = new URLSearchParams()
  Object.entries(paramsObj).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.set(key, value)
    }
  })
  return params.toString()
}

export default function App() {
  const [page, setPage] = useState('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [status, setStatus] = useState('')

  const [patients, setPatients] = useState([])
  const [consultations, setConsultations] = useState([])

  const [patientForm, setPatientForm] = useState({
    full_name: '',
    date_of_birth: '',
    email: '',
  })

  const [consultationForm, setConsultationForm] = useState({
    patient: '',
    symptoms: '',
    diagnosis: '',
  })

  const [patientFilters, setPatientFilters] = useState({
    full_name: '',
    email: '',
    date_of_birth_from: '',
    date_of_birth_to: '',
  })

  const [consultationFilters, setConsultationFilters] = useState({
    patient_id: '',
    created_at_from: '',
    created_at_to: '',
  })

  const [patientPage, setPatientPage] = useState(1)
  const [patientMeta, setPatientMeta] = useState({ count: 0, next: null, previous: null })

  const [consultationPage, setConsultationPage] = useState(1)
  const [consultationMeta, setConsultationMeta] = useState({ count: 0, next: null, previous: null })

  const [summaryDialog, setSummaryDialog] = useState({
    open: false,
    message: '',
    id: null,
  })

  const [initialLoaded, setInitialLoaded] = useState(false)

  const pollingRef = useRef(null)

  const authHeaders = useMemo(() => {
    return accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
  }, [accessToken])

  const isLoggedIn = Boolean(accessToken)

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  async function request(method, path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }

    if (!res.ok) {
      const message = data?.detail || data?.error || 'Request failed'
      setStatus(`Error: ${message}`)
    }

    return { ok: res.ok, data }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setStatus('')
    const { data } = await request('POST', '/accounts/login/', {
      username,
      password,
    })
    if (data?.access) {
      setAccessToken(data.access)
      setRefreshToken(data.refresh)
      setCookie(COOKIE_ACCESS, data.access, 1)
      setCookie(COOKIE_REFRESH, data.refresh, 7)
      setPage('patients')
      setStatus('Logged in.')
    }
  }

  function handleLogout() {
    setAccessToken('')
    setRefreshToken('')
    clearCookie(COOKIE_ACCESS)
    clearCookie(COOKIE_REFRESH)
    setPatients([])
    setConsultations([])
    setInitialLoaded(false)
    setPage('login')
    setStatus('Logged out.')
  }

  async function loadPatients(pageNumber = patientPage, filters = patientFilters) {
    setStatus('')
    const query = buildQuery({
      page: pageNumber,
      full_name: filters.full_name,
      email: filters.email,
      date_of_birth_from: filters.date_of_birth_from,
      date_of_birth_to: filters.date_of_birth_to,
    })
    const { data } = await request('GET', `/patients/?${query}`)
    if (Array.isArray(data)) {
      setPatients(data)
      setPatientMeta({ count: data.length, next: null, previous: null })
      setPatientPage(1)
      return
    }
    if (data?.results) {
      setPatients(data.results)
      setPatientMeta({ count: data.count ?? 0, next: data.next, previous: data.previous })
      setPatientPage(pageNumber)
    }
  }

  async function createPatient(e) {
    e.preventDefault()
    setStatus('')
    const { data } = await request('POST', '/patients/', patientForm)
    if (data?.id) {
      setPatients((prev) => [data, ...prev])
      setStatus('Patient created.')
      setPatientForm({ full_name: '', date_of_birth: '', email: '' })
    }
  }

  async function loadConsultations(pageNumber = consultationPage, filters = consultationFilters) {
    setStatus('')
    const query = buildQuery({
      page: pageNumber,
      patient_id: filters.patient_id,
      created_at_from: filters.created_at_from,
      created_at_to: filters.created_at_to,
    })
    const { data } = await request('GET', `/consultations/?${query}`)
    if (Array.isArray(data)) {
      setConsultations(data)
      setConsultationMeta({ count: data.length, next: null, previous: null })
      setConsultationPage(1)
      return
    }
    if (data?.results) {
      setConsultations(data.results)
      setConsultationMeta({ count: data.count ?? 0, next: data.next, previous: data.previous })
      setConsultationPage(pageNumber)
    }
  }

  async function createConsultation(e) {
    e.preventDefault()
    setStatus('')
    const { data } = await request('POST', '/consultations/', consultationForm)
    if (data?.id) {
      setConsultations((prev) => [data, ...prev])
      setStatus('Consultation created.')
      setConsultationForm({ patient: '', symptoms: '', diagnosis: '' })
    }
  }

  async function startSummaryPolling(consultationId) {
    stopPolling()
    setSummaryDialog({
      open: true,
      message: 'AI is generating the summary. This may take a few seconds.',
      id: consultationId,
    })

    pollingRef.current = setInterval(async () => {
      const { data } = await request('GET', `/consultations/${consultationId}/summary_status/`)
      if (data?.status && data.status !== 'processing') {
        stopPolling()
        setSummaryDialog((prev) => ({
          ...prev,
          message: 'Summary ready. Refreshing list...',
        }))
        await loadConsultations(consultationPage, consultationFilters)
        setTimeout(() => {
          setSummaryDialog({ open: false, message: '', id: null })
        }, 800)
      }
    }, 3000)
  }

  async function generateSummary(consultationId) {
    setStatus('')
    const { ok } = await request('POST', `/consultations/generate-summary/${consultationId}/`)
    if (ok) {
      startSummaryPolling(consultationId)
    }
  }

  function applyPatientFilters() {
    loadPatients(1, patientFilters)
  }

  function clearPatientFilters() {
    const cleared = { full_name: '', email: '', date_of_birth_from: '', date_of_birth_to: '' }
    setPatientFilters(cleared)
    loadPatients(1, cleared)
  }

  function applyConsultationFilters() {
    loadConsultations(1, consultationFilters)
  }

  function clearConsultationFilters() {
    const cleared = { patient_id: '', created_at_from: '', created_at_to: '' }
    setConsultationFilters(cleared)
    loadConsultations(1, cleared)
  }

  const patientTotalPages = Math.max(1, Math.ceil((patientMeta.count || 0) / PAGE_SIZE))
  const consultationTotalPages = Math.max(1, Math.ceil((consultationMeta.count || 0) / PAGE_SIZE))

  useEffect(() => {
    const savedAccess = getCookie(COOKIE_ACCESS)
    const savedRefresh = getCookie(COOKIE_REFRESH)
    if (savedAccess) {
      setAccessToken(savedAccess)
      setRefreshToken(savedRefresh)
      setPage('patients')
    }
  }, [])

  useEffect(() => {
    if (accessToken && !initialLoaded) {
      loadPatients(1, patientFilters)
      loadConsultations(1, consultationFilters)
      setInitialLoaded(true)
    }
  }, [accessToken, initialLoaded])

  useEffect(() => {
    if (page === 'consultations' && accessToken && patients.length === 0) {
      loadPatients(1, patientFilters)
    }
  }, [page, accessToken, patients.length])

  useEffect(() => () => stopPolling(), [])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="dot" />
          <div>
            <div className="brand-title">Consultation</div>
            <div className="brand-sub">Simple Frontend</div>
          </div>
        </div>

        <nav className="nav">
          {PAGES.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        {isLoggedIn && (
          <button type="button" className="secondary" onClick={handleLogout}>
            Logout
          </button>
        )}
      </aside>

      <main className="main">
        <header className="page-header">
          <div>
            <h1>{PAGES.find((p) => p.id === page)?.label}</h1>
            <p>Manage patients and consultations.</p>
          </div>
          {status && <div className="status">{status}</div>}
        </header>

        {page === 'login' && (
          <section className="card">
            <div className="section-head">
              <h2>Login</h2>
              {isLoggedIn && (
                <button type="button" className="secondary" onClick={handleLogout}>
                  Logout
                </button>
              )}
            </div>
            {!isLoggedIn ? (
              <form onSubmit={handleLogin} className="stack">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="username"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="password"
                />
                <button type="submit">Login</button>
              </form>
            ) : (
              <div className="note">You are logged in.</div>
            )}
            {refreshToken && <div className="note">Refresh token saved.</div>}
          </section>
        )}

        {page === 'patients' && (
          <section className="card">
            <div className="section-head">
              <h2>Patients</h2>
              <button onClick={() => loadPatients(1, patientFilters)}>Load Patients</button>
            </div>

            <div className="filters">
              <div className="filter-grid">
                <input
                  value={patientFilters.full_name}
                  onChange={(e) => setPatientFilters({ ...patientFilters, full_name: e.target.value })}
                  placeholder="Full name contains"
                />
                <input
                  value={patientFilters.email}
                  onChange={(e) => setPatientFilters({ ...patientFilters, email: e.target.value })}
                  placeholder="Email equals"
                />
                <input
                  type="date"
                  value={patientFilters.date_of_birth_from}
                  onChange={(e) => setPatientFilters({ ...patientFilters, date_of_birth_from: e.target.value })}
                />
                <input
                  type="date"
                  value={patientFilters.date_of_birth_to}
                  onChange={(e) => setPatientFilters({ ...patientFilters, date_of_birth_to: e.target.value })}
                />
              </div>
              <div className="filter-actions">
                <button type="button" onClick={applyPatientFilters}>Apply Filters</button>
                <button type="button" className="secondary" onClick={clearPatientFilters}>Clear</button>
              </div>
            </div>

            {patients.length > 0 ? (
              <div className="card-grid">
                {patients.map((patient) => (
                  <div className="patient-card" key={patient.id}>
                    <div className="patient-name">{patient.full_name}</div>
                    <div className="muted">{patient.email}</div>
                    <div className="muted">DOB: {formatDate(patient.date_of_birth)}</div>
                    <div className="muted">ID: {patient.id}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No patients loaded yet.</div>
            )}

            <div className="pagination">
              <button
                type="button"
                className="secondary"
                disabled={!patientMeta.previous}
                onClick={() => loadPatients(Math.max(1, patientPage - 1), patientFilters)}
              >
                Previous
              </button>
              <div className="pagination-info">
                Page {patientPage} of {patientTotalPages} · Total {patientMeta.count}
              </div>
              <button
                type="button"
                className="secondary"
                disabled={!patientMeta.next}
                onClick={() => loadPatients(patientPage + 1, patientFilters)}
              >
                Next
              </button>
            </div>

            <div className="divider" />

            <h3>Create Patient</h3>
            <form onSubmit={createPatient} className="stack">
              <input
                value={patientForm.full_name}
                onChange={(e) => setPatientForm({ ...patientForm, full_name: e.target.value })}
                placeholder="full name"
              />
              <input
                type="date"
                value={patientForm.date_of_birth}
                onChange={(e) => setPatientForm({ ...patientForm, date_of_birth: e.target.value })}
              />
              <input
                type="email"
                value={patientForm.email}
                onChange={(e) => setPatientForm({ ...patientForm, email: e.target.value })}
                placeholder="email"
              />
              <button type="submit">Create Patient</button>
            </form>
          </section>
        )}

        {page === 'consultations' && (
          <section className="card">
            <div className="section-head">
              <h2>Consultations</h2>
              <div className="section-actions">
                <button onClick={() => loadConsultations(1, consultationFilters)}>Load Consultations</button>
                <button className="secondary" onClick={() => loadPatients(1, patientFilters)}>
                  Refresh Patients
                </button>
              </div>
            </div>

            <div className="filters">
              <div className="filter-grid">
                <select
                  value={consultationFilters.patient_id}
                  onChange={(e) => setConsultationFilters({ ...consultationFilters, patient_id: e.target.value })}
                >
                  <option value="">All patients</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} ({formatDate(patient.date_of_birth)})
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={consultationFilters.created_at_from}
                  onChange={(e) => setConsultationFilters({ ...consultationFilters, created_at_from: e.target.value })}
                />
                <input
                  type="date"
                  value={consultationFilters.created_at_to}
                  onChange={(e) => setConsultationFilters({ ...consultationFilters, created_at_to: e.target.value })}
                />
              </div>
              <div className="filter-actions">
                <button type="button" onClick={applyConsultationFilters}>Apply Filters</button>
                <button type="button" className="secondary" onClick={clearConsultationFilters}>Clear</button>
              </div>
            </div>

            {consultations.length > 0 ? (
              <div className="consultation-grid">
                {consultations.map((item) => (
                  <div className="consultation-card" key={item.id}>
                    <div className="consultation-head">
                      <div>
                        <div className="consultation-id">ID: {item.id}</div>
                        <div className="muted">Patient: {item.patient}</div>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => generateSummary(item.id)}
                      >
                        Generate Summary
                      </button>
                    </div>

                    <div className="consultation-body">
                      <div>
                        <strong>Symptoms</strong>
                        <p>{item.symptoms || '-'}</p>
                      </div>
                      <div>
                        <strong>Diagnosis</strong>
                        <p>{item.diagnosis || '-'}</p>
                      </div>
                    </div>

                    <div className="consultation-meta">
                      Created: {formatDate(item.created_at)}
                    </div>

                    {item.ai_summary && (
                      <div className="summary">
                        <div><strong>Brief:</strong> {item.ai_summary.brief_summary}</div>
                        <div><strong>Symptoms:</strong> {(item.ai_summary.key_symptoms || []).join(', ')}</div>
                        <div><strong>Urgent:</strong> {String(item.ai_summary.requires_urgent_care)}</div>
                        <div><strong>Plan:</strong> {item.ai_summary.suggested_treatment_plan}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">No consultations loaded yet.</div>
            )}

            <div className="pagination">
              <button
                type="button"
                className="secondary"
                disabled={!consultationMeta.previous}
                onClick={() => loadConsultations(Math.max(1, consultationPage - 1), consultationFilters)}
              >
                Previous
              </button>
              <div className="pagination-info">
                Page {consultationPage} of {consultationTotalPages} · Total {consultationMeta.count}
              </div>
              <button
                type="button"
                className="secondary"
                disabled={!consultationMeta.next}
                onClick={() => loadConsultations(consultationPage + 1, consultationFilters)}
              >
                Next
              </button>
            </div>

            <div className="divider" />

            <h3>Create Consultation</h3>
            <form onSubmit={createConsultation} className="stack">
              <label>
                Patient
                <select
                  value={consultationForm.patient}
                  onChange={(e) => setConsultationForm({ ...consultationForm, patient: e.target.value })}
                >
                  <option value="">Select patient</option>
                  {patients.map((patient) => (
                    <option key={patient.id} value={patient.id}>
                      {patient.full_name} ({formatDate(patient.date_of_birth)})
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                value={consultationForm.symptoms}
                onChange={(e) => setConsultationForm({ ...consultationForm, symptoms: e.target.value })}
                placeholder="symptoms"
                rows={3}
              />
              <textarea
                value={consultationForm.diagnosis}
                onChange={(e) => setConsultationForm({ ...consultationForm, diagnosis: e.target.value })}
                placeholder="diagnosis"
                rows={3}
              />
              <button type="submit">Create Consultation</button>
            </form>
          </section>
        )}
      </main>

      {summaryDialog.open && (
        <div
          className="modal-backdrop"
          onClick={() => {
            stopPolling()
            setSummaryDialog({ open: false, message: '', id: null })
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Generating Summary</h3>
            <p>{summaryDialog.message}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  stopPolling()
                  setSummaryDialog({ open: false, message: '', id: null })
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
