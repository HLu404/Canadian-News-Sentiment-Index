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

// dot spots come in three grids, coarse to fine: [spacing, border margin] in canvas pixels.
// A province uses the coarsest grid that has room for all of its articles.
const LEVELS = [[16, 5], [10, 3], [7, 1]]

// dot sizes are a % of the map width (1.1% is about 9px on a typical window)
const DOT_MAX = 1.1          // full size
const DOT_MIN = 0.55         // smallest a dot gets (about 4.5px)
const FULL_SIZE_COUNT = 10   // a province keeps full-size dots up to this many articles

// the About tab only shows text, so its `days` just sets which dots stay on the map
const TABS = [
  { id: 'national', label: 'National', days: 7 },
  { id: 'today', label: 'Today', days: 1 },
  { id: 'week', label: 'This week', days: 7 },
  { id: 'month', label: 'This month', days: 30 },
  { id: 'about', label: 'About', days: 30 },
]

const ABOUT_TEXT =
  'The Canadian News Index measures how stressful Canadian news is. A script collects ' +
  'recent English-language articles from Canadian publishers and scores each headline ' +
  'with a pretrained sentiment model. That score is weighted by topic, so a negative ' +
  'story about politics or the economy counts for more than a negative story about ' +
  'sports or gaming, and each article ends up with a stress rating from 0 (calm) to 10 ' +
  '(high). Articles are placed on the map by province, based on the cities and provinces ' +
  'named in their title or text, and articles that name no place are counted as ' +
  'national. Each dot is colored from green to red by its score. The topic weights are ' +
  'hand-picked, so treat the index as a rough, informal gauge of the news mood and not ' +
  'a scientific measurement.'

// score colors, evenly spaced from 0 to 10: green, yellow-green, yellow, orange, red
const STOPS = [
  [96, 180, 84],   // #60B454
  [143, 190, 87],  // #8FBE57
  [250, 190, 50],  // #FABE32
  [232, 108, 36],  // #E86C24
  [224, 57, 47],   // #E0392F
]

/* ---------- helpers ---------- */

function scoreToColor(score) {
  const t = Math.min(Math.max(score / 10, 0), 1)
  const pos = t * (STOPS.length - 1)
  const i = Math.min(Math.floor(pos), STOPS.length - 2)
  const f = pos - i
  const [r, g, b] = STOPS[i].map((v, k) => Math.round(v + (STOPS[i + 1][k] - v) * f))
  return `rgb(${r}, ${g}, ${b})`
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

// Dot size for one province, as a % of the map width.
// It shrinks as the count grows, and never gets bigger than the gap between spots.
function dotSize(count, spacing) {
  const crowd = Math.sqrt(FULL_SIZE_COUNT / Math.max(count, FULL_SIZE_COUNT))
  return Math.max(DOT_MIN, Math.min(DOT_MAX * crowd, spacing * 0.85))
}

// For each province, build up to three lists of valid dot positions (as % of the map),
// each sorted from the anchor outward. Every list also records its spacing.
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

    const levels = []
    for (const [step, edge] of LEVELS) {
      const points = []
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          if (
            inRegion(x, y) &&
            inRegion(x + edge, y) && inRegion(x - edge, y) &&
            inRegion(x, y + edge) && inRegion(x, y - edge)
          ) points.push([x, y])
        }
      }
      if (points.length === 0) continue

      points.sort((a, b) =>
        Math.hypot(a[0] - start[0], a[1] - start[1]) -
        Math.hypot(b[0] - start[0], b[1] - start[1]))
      levels.push({
        spacing: step / w * 100, // gap between spots, as a % of the map width
        points: points.map(([x, y]) => [x / w * 100, y / h * 100]),
      })
    }
    if (levels.length) slots[province] = levels
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
              stroke="#2b1d17" strokeWidth="4" strokeLinecap="round" />
        <circle cx="100" cy="100" r="8" fill="#f7f1e3" stroke="#2b1d17" strokeWidth="3" />
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
  const [layout, setLayout] = useState(null)
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
      setLayout(buildSlots(e.currentTarget))
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

  // Group the articles by province, newest first. Each province picks the coarsest
  // grid with room for all its articles and sizes its dots by how many it has.
  // If even the finest grid is full, the oldest extras get no dot; they still
  // count in the summary and the headline list.
  const dots = []
  if (layout) {
    const groups = {}
    const sorted = [...onMap].sort(
      (a, b) => b.Date.localeCompare(a.Date) || a.URL.localeCompare(b.URL))
    for (const article of sorted) {
      if (!groups[article.Province]) groups[article.Province] = []
      groups[article.Province].push(article)
    }

    for (const [province, list] of Object.entries(groups)) {
      const levels = layout[province]
      if (!levels) continue // no map spots for this province
      const level = levels.find(l => l.points.length >= list.length) || levels[levels.length - 1]
      const count = Math.min(list.length, level.points.length)
      const size = dotSize(count, level.spacing)
      list.slice(0, count).forEach((article, i) => {
        const [x, y] = level.points[i]
        dots.push({ article, x, y, size })
      })
    }
  }

  return (
    <div className="webpage">
      <div className="header">
        <h1>Canadian News Index</h1>
        <p className="subtitle">Stress Levels in Canadian News</p>
      </div>

      <div className="map">
        <img src={canadaMap} alt="Map of Canada" onLoad={handleMapLoad} />
        {dots.map(({ article, x, y, size }) => (
          <button
            key={article.URL}
            className={selected?.URL === article.URL ? 'dot selected' : 'dot'}
            style={{
              left: `${x}%`,
              top: `${y}%`,
              '--size': `${size}%`,
              '--c': scoreToColor(article.SCORE),
            }}
            onClick={() => setSelected(article)}
          />
        ))}
      </div>

      <div className="side-panel">
        <div className="tabs">
          {TABS.map(t => (
            <button
              key={t.id}
              className={
                'tab' + (t.id === tab ? ' active' : '') + (t.id === 'about' ? ' info' : '')
              }
              onClick={() => changeTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* key={tab} remounts this block when the tab changes, which replays the fade-in */}
        <div className="panel-body" key={tab}>
          {error && <p className="error">Couldn't load articles: {error}</p>}

          {tab !== 'about' && (
            <section className="card">
              <h2>{heading}</h2>
              <Gauge score={mean(shown)} />
              <p className="stats">
                <b>{shown.length}</b> articles
                {tab !== 'national' && <> · <b>{national.length}</b> national</>}
              </p>
            </section>
          )}

          {selected && (
            <section className="card article-card" key={selected.URL}>
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

          {tab === 'about' ? (
            <section className="card">
              <h2>About this site</h2>
              <p className="about">{ABOUT_TEXT}</p>
            </section>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  )
}

export default App