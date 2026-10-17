import { useState, useEffect } from 'react'
import './App.css'
import canadaMap from './assets/Canada_provinces-blank-map_XMLcomments-CSSclasses-SVGids_green.svg'

// Anywhere INSIDE each province, as [x%, y%] of the map image.
// Keys match what your script saves. If you calibrated these earlier,
// paste your own numbers over these.
const ANCHORS = {
  'yukon': [7, 40],
  'northwest territories': [19, 43],
  'nunavut': [35, 43],
  'bc': [10, 69],
  'alberta': [15, 69],
  'saskatchewan': [22, 71],
  'manitoba': [30, 69],
  'ontario': [39, 77],
  'quebec': [52, 69],
  'newfoundland': [65, 75],
  'new brunswick': [58, 86],
  'nova scotia': [62, 88],
  'pei': [61, 82],
}

const CANVAS_W = 1200 // resolution used to find each province's land
const STEP = 16       // distance between dots, in canvas pixels
const EDGE = 5        // how far dots stay from a border, in canvas pixels

const TABS = [
  { id: 'national', label: 'National', days: 7 },
  { id: 'today', label: 'Today', days: 1 },
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 30 },
]

/* ---------- helpers ---------- */

function scoreToColor(score) {
  const t = Math.min(Math.max(score / 10, 0), 1)
  return `hsl(${120 - t * 120}, 55%, 48%)` // muted green to red
}

// local midnight, going back (days - 1) days; days = 1 means "since midnight today"
function startOf(days) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return d
}

function mean(list) {
  return list.length ? list.reduce((sum, a) => sum + a.SCORE, 0) / list.length : null
}

function prettyProvince(p) {
  if (p === 'bc') return 'BC'
  if (p === 'pei') return 'PEI'
  return p.replace(/\b\w/g, c => c.toUpperCase())
}

function levelOf(score) {
  if (score < 4) return 'LOW'
  if (score < 7) return 'MEDIUM'
  return 'HIGH'
}

// For each province, build a list of valid dot positions (as % of the map),
// sorted from the anchor outward.
function buildSlots(img) {
  const rect = img.getBoundingClientRect()
  const w = CANVAS_W
  const h = Math.round(w * rect.height / rect.width)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, w, h)
  const alpha = ctx.getImageData(0, 0, w, h).data

  // land is opaque; sea and the lines between provinces are transparent
  const isLand = (x, y) =>
    x >= 0 && y >= 0 && x < w && y < h && alpha[(y * w + x) * 4 + 3] > 128

  function nearestLand(x, y) {
    for (let r = 0; r <= 15; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && isLand(x + dx, y + dy))
            return [x + dx, y + dy]
    return null
  }

  // spreads outward from the start pixel across connected land
  function floodFill(sx, sy) {
    const region = new Uint8Array(w * h)
    const stack = [sy * w + sx]
    region[stack[0]] = 1
    const visit = (nx, ny) => {
      if (!isLand(nx, ny)) return
      const j = ny * w + nx
      if (region[j]) return
      region[j] = 1
      stack.push(j)
    }
    while (stack.length) {
      const i = stack.pop()
      const x = i % w
      const y = (i - x) / w
      visit(x + 1, y); visit(x - 1, y); visit(x, y + 1); visit(x, y - 1)
    }
    return region
  }

  const slots = {}
  for (const [province, [ax, ay]] of Object.entries(ANCHORS)) {
    const start = nearestLand(Math.round(ax / 100 * w), Math.round(ay / 100 * h))
    if (!start) {
      console.warn(`No land near the anchor for "${province}". Move its anchor.`)
      continue
    }
    const region = floodFill(start[0], start[1])
    const inRegion = (x, y) => x >= 0 && y >= 0 && x < w && y < h && region[y * w + x] === 1

    // small provinces get finer spacing if the first pass finds too few spots
    let points = []
    for (const [step, edge] of [[STEP, EDGE], [10, 3], [7, 1]]) {
      points = []
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (
            inRegion(x, y) &&
            inRegion(x + edge, y) && inRegion(x - edge, y) &&
            inRegion(x, y + edge) && inRegion(x, y - edge)
          ) points.push([x, y])
        }
      }
      if (points.length >= 8) break
    }

    points.sort((a, b) =>
      Math.hypot(a[0] - start[0], a[1] - start[1]) -
      Math.hypot(b[0] - start[0], b[1] - start[1]))
    slots[province] = points.map(([x, y]) => [x / w * 100, y / h * 100])
  }
  return slots
}

// SVG arc from one angle to another (180 = left end, 0 = right end)
function arcPath(cx, cy, r, fromDeg, toDeg) {
  const point = deg => {
    const a = deg * Math.PI / 180
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)]
  }
  const [x1, y1] = point(fromDeg)
  const [x2, y2] = point(toDeg)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

const SEGMENTS = 5

// semicircle meter, used for the average of the selected tab
function Gauge({ score }) {
  const valid = typeof score === 'number' && !Number.isNaN(score)
  const t = valid ? Math.min(Math.max(score / 10, 0), 1) : 0
  const angle = Math.PI * (1 - t)
  const tipX = 100 + 64 * Math.cos(angle)
  const tipY = 100 - 64 * Math.sin(angle)

  return (
    <div className="gauge">
      <div className="gauge-level" style={{ color: valid ? scoreToColor(score) : '#8a8a8a' }}>
        {valid ? levelOf(score) : 'NO DATA'}
      </div>
      <svg viewBox="0 0 200 112" role="img"
           aria-label={valid ? `Cortisol ${score.toFixed(1)} out of 10` : 'No data'}>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <path
            key={i}
            d={arcPath(100, 100, 78,
              180 - i * (180 / SEGMENTS) - 1.5,
              180 - (i + 1) * (180 / SEGMENTS) + 1.5)}
            fill="none"
            stroke={scoreToColor(((i + 0.5) / SEGMENTS) * 10)}
            strokeWidth="18"
          />
        ))}
        <line x1="100" y1="100" x2={tipX} y2={tipY}
              stroke="#e6e6e6" strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="100" r="8" fill="#444" stroke="#e6e6e6" strokeWidth="3" />
      </svg>
      <div className="gauge-foot">
        <span>LOW</span>
        <strong>{valid ? score.toFixed(2) : '–'}</strong>
        <span>HIGH</span>
      </div>
    </div>
  )
}

// green-to-red bar from 0 to 10, used for a single article
function ScoreBar({ score }) {
  const valid = typeof score === 'number' && !Number.isNaN(score)
  const pct = valid ? Math.min(Math.max(score / 10, 0), 1) * 100 : 0

  return (
    <div className="scorebar">
      <div className="scorebar-top">
        <span style={{ color: valid ? scoreToColor(score) : '#8a8a8a' }}>
          {valid ? levelOf(score) : 'NO DATA'}
        </span>
        <strong>{valid ? score.toFixed(1) : '–'}</strong>
      </div>
      <div className="scorebar-track" role="img"
           aria-label={valid ? `Cortisol ${score.toFixed(1)} out of 10` : 'No data'}>
        {valid && <div className="scorebar-marker" style={{ left: `${pct}%` }} />}
      </div>
      <div className="scorebar-scale">
        <span>0</span><span>5</span><span>10</span>
      </div>
    </div>
  )
}

/* ---------- the page ---------- */

function App() {
  const [articles, setArticles] = useState([])
  const [slots, setSlots] = useState(null)
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('national')
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('http://localhost:8000/articles')
        if (!res.ok) throw new Error(`Request failed: ${res.status}`)
        setArticles(await res.json())
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [])

  function handleMapLoad(e) {
    try {
      setSlots(buildSlots(e.currentTarget))
    } catch (err) {
      console.error('Could not read the map image', err)
    }
  }

  function changeTab(id) {
    setTab(id)
    setSelected(null)
  }

  const current = TABS.find(t => t.id === tab)
  const since = startOf(current.days)
  const inPeriod = articles.filter(a => new Date(a.Date) >= since)
  const national = inPeriod.filter(a => a.Province === 'National')
  const onMap = inPeriod.filter(a => a.Province !== 'National')
  const shown = tab === 'national' ? national : inPeriod
  const headlines = [...shown].sort((a, b) => b.SCORE - a.SCORE).slice(0, 20)
  const heading = tab === 'national' ? 'National articles' : `Canada · ${current.label}`

  // next free spot in each province, newest articles first. If a province is
  // full, the extra articles still count in the summary but get no dot.
  const dots = []
  if (slots) {
    const used = {}
    const sorted = [...onMap].sort(
      (a, b) => b.Date.localeCompare(a.Date) || a.URL.localeCompare(b.URL))
    for (const article of sorted) {
      const list = slots[article.Province]
      if (!list || list.length === 0) continue
      const i = used[article.Province] || 0
      if (i >= list.length) continue
      used[article.Province] = i + 1
      const [x, y] = list[i]
      dots.push({ article, x, y })
    }
  }

  return (
    <div className="webpage">
      <div className="header">
        <h1>World Cortisol Index</h1>
      </div>

      <div className="map">
        <img src={canadaMap} alt="Map of Canada" onLoad={handleMapLoad} />
        {dots.map(({ article, x, y }) => (
          <button
            key={article.URL}
            className={selected?.URL === article.URL ? 'dot selected' : 'dot'}
            style={{ left: `${x}%`, top: `${y}%`, '--c': scoreToColor(article.SCORE) }}
            onClick={() => setSelected(article)}
          />
        ))}
      </div>

      <div className="side-panel">
        <div className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={t.id === tab ? 'tab active' : 'tab'}
              onClick={() => changeTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="panel-body">
          {error && <p className="error">Couldn't load articles: {error}</p>}

          <section className="card">
            <h2>{heading}</h2>
            <Gauge score={mean(shown)} />
            <p className="stats">
              <b>{shown.length}</b> articles
              {tab !== 'national' && <> · <b>{national.length}</b> national</>}
            </p>
          </section>

          {selected && (
            <section className="card article-card">
              {selected.Thumbnail && (
                <a href={selected.URL} target="_blank" rel="noreferrer">
                  <img
                    className="thumb"
                    src={selected.Thumbnail}
                    alt=""
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                </a>
              )}
              <h3>
                <a href={selected.URL} target="_blank" rel="noreferrer">{selected.Name}</a>
              </h3>
              <p className="meta">
                {selected.Publisher} · {selected.Topic} · {prettyProvince(selected.Province)}
              </p>
              <ScoreBar score={selected.SCORE} />
            </section>
          )}

          <section className="card">
            <h2>Most stressful headlines</h2>
            {headlines.length === 0 ? (
              <p className="muted">No articles in this period yet.</p>
            ) : (
              <ul className="article-list">
                {headlines.map(a => (
                  <li key={a.URL}>
                    <button
                      className={selected?.URL === a.URL ? 'selected' : ''}
                      onClick={() => setSelected(a)}
                    >
                      <span className="swatch" style={{ background: scoreToColor(a.SCORE) }} />
                      <span className="list-title">{a.Name}</span>
                      <span className="list-score">{a.SCORE.toFixed(1)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

export default App