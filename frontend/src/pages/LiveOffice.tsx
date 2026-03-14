import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, MessageCircle, Send, ChevronDown, ChevronUp, Monitor, Users } from 'lucide-react'
import { orgApi, companiesApi, agentApi, workApi } from '../api/client'
import { useProviderHealth } from '../components/ProviderStatusBanner'
import type { OrgNode } from '../types'
import Meetings from './Meetings'

// Available models per provider
const PROVIDER_MODELS: Record<string, string[]> = {
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  ollama: ['qwen2.5', 'llama3.2', 'llama3.2:3b', 'llama3.2:1b', 'qwen2.5:7b', 'qwen2.5:14b', 'gemma3:4b'],
}

// ── Canvas dimensions ──────────────────────────────────────────────────────────
const CW = 960
const CH = 740
const TILE = 32

// ── Floor layout (top = high rank, bottom = low rank) ─────────────────────────
// Each floor section: { yStart, height }
const FLOOR = {
  executive:   { y: 0,   h: 148 }, // CEO / Chairman
  csuite:      { y: 156, h: 148 }, // Chief / Committee
  team:        { y: 312, h: 148 }, // Team Lead
  specialist1: { y: 468, h: 130 }, // Specialist row 1
  specialist2: { y: 606, h: 130 }, // Specialist row 2
} as const

const DIVIDER_Y = [148, 304, 460, 598] as const

// Desk Y centers per level (character stands at this y, desk drawn above)
const LEVEL_DESK_Y: Record<string, number> = {
  chairman:   104,
  committee:  240,
  ceo:        104,
  chief:      240,
  team_lead:  390,
  // specialist: dynamic (530 or 668)
}

// ── Character designs ─────────────────────────────────────────────────────────
const DESIGNS = [
  { hair: '#1a0a00', skin: '#f4c5a1', shirt: '#e74c3c',  pants: '#2c3e50' },
  { hair: '#2d1b00', skin: '#8d5524', shirt: '#3498db',  pants: '#1a252f' },
  { hair: '#e8c840', skin: '#f4c5a1', shirt: '#9b59b6',  pants: '#2c3e50' },
  { hair: '#1a1a2e', skin: '#f8e0c8', shirt: '#27ae60',  pants: '#34495e' },
  { hair: '#8b4513', skin: '#e8a87c', shirt: '#e67e22',  pants: '#2c3e50' },
  { hair: '#d3d3d3', skin: '#fde8d8', shirt: '#1abc9c',  pants: '#263238' },
  { hair: '#0a0a0a', skin: '#6b3a2a', shirt: '#e91e63',  pants: '#1a252f' },
  { hair: '#c8a96e', skin: '#f0d5b0', shirt: '#2196f3',  pants: '#37474f' },
  { hair: '#4a2060', skin: '#f4c5a1', shirt: '#8e44ad',  pants: '#2c3e50' },
  { hair: '#b8860b', skin: '#deb887', shirt: '#16a085',  pants: '#1a252f' },
  { hair: '#556b2f', skin: '#f0e0c0', shirt: '#d35400',  pants: '#2c3e50' },
  { hair: '#191970', skin: '#ffe4c4', shirt: '#2980b9',  pants: '#263238' },
]

const LEVEL_COLOR: Record<string, string> = {
  chairman: '#e24c4b', committee: '#9b59b6', ceo: '#3498db',
  chief: '#27ae60', team_lead: '#f39c12', specialist: '#7f8c8d',
}
const LEVEL_EMOJI: Record<string, string> = {
  chairman: '👔', committee: '📊', ceo: '💼',
  chief: '⚡', team_lead: '🎯', specialist: '🔧',
}
const LEVEL_KO: Record<string, string> = {
  chairman: '회장', committee: '위원회', ceo: 'CEO',
  chief: 'Chief', team_lead: '팀장', specialist: '스페셜리스트',
}
const ACTIVITIES: Record<string, string[]> = {
  chairman: ['전략 검토', '보고서 분석', '최종 결정'],
  committee: ['시장 분석', '투자 심사', '리스크 검토'],
  ceo: ['팀 관리', '로드맵 수립', 'KPI 분석'],
  chief: ['부서 조율', '예산 검토', '성과 평가'],
  team_lead: ['스프린트 리뷰', '팀 코칭', '업무 분배'],
  specialist: ['코드 작성', '데이터 분석', '문서 작성', '버그 수정'],
}
const FLOOR_LABELS: Record<string, string> = {
  executive:   'EXECUTIVE SUITE',
  csuite:      'C-SUITE',
  team:        'TEAM OFFICE',
  specialist1: 'SPECIALIST FLOOR',
  specialist2: '',
}
const FLOOR_WOOD: Record<string, string[]> = {
  executive:   ['#4a2510', '#3e200c', '#452212', '#3c1e0a', '#4e2814'],
  csuite:      ['#0e2218', '#122a1e', '#0c2016', '#142c20', '#102418'],
  team:        ['#111c34', '#162238', '#102030', '#1a2840', '#0e1a2c'],
  specialist1: ['#161622', '#1a1a28', '#12121e', '#1e1e2e', '#141420'],
  specialist2: ['#161622', '#1a1a28', '#12121e', '#1e1e2e', '#141420'],
}

type AgentMode = 'idle' | 'working' | 'thinking' | 'coffee'

interface Company {
  id: number; name: string; industry: string; status: string
}

interface LiveAgent {
  id: number; name: string; level: string; role: string
  ai_model: string; ai_provider: string
  charIdx: number; x: number; y: number; mode: AgentMode; bubble: string
  meta?: Record<string, unknown>
}

// ── Dynamic desk position computation ────────────────────────────────────────
function computePositions(agents: LiveAgent[]): Map<number, { x: number; y: number }> {
  const MIN_X = 100, MAX_X = 860
  const spreadX = (idx: number, total: number) =>
    total === 1 ? CW / 2 : MIN_X + (idx / (total - 1)) * (MAX_X - MIN_X)

  const groups: Record<string, LiveAgent[]> = {}
  const ORDER = ['chairman', 'committee', 'ceo', 'chief', 'team_lead', 'specialist']
  for (const lvl of ORDER) groups[lvl] = []
  for (const a of agents) groups[a.level]?.push(a)

  const result = new Map<number, { x: number; y: number }>()

  for (const [level, grp] of Object.entries(groups)) {
    if (!grp.length) continue
    if (level === 'specialist') {
      const row1Size = Math.ceil(grp.length / 2)
      grp.forEach((a, i) => {
        const inRow2 = i >= row1Size
        const rowIdx = inRow2 ? i - row1Size : i
        const rowCount = inRow2 ? grp.length - row1Size : row1Size
        result.set(a.id, {
          x: spreadX(rowIdx, rowCount),
          y: inRow2 ? 668 : 530,
        })
      })
    } else {
      grp.forEach((a, i) => {
        result.set(a.id, { x: spreadX(i, grp.length), y: LEVEL_DESK_Y[level] || 390 })
      })
    }
  }
  return result
}

// ── Canvas background drawing ─────────────────────────────────────────────────
function drawDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + 5, y + 57, 100, 8)
  ctx.fillStyle = '#8b5e3c'; ctx.fillRect(x, y, 100, 50)
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x, y, 100, 3)
  ctx.fillStyle = '#6b4220'; ctx.fillRect(x, y + 43, 100, 14)
  ctx.fillStyle = '#5a3818'
  ctx.fillRect(x + 4, y + 54, 9, 8); ctx.fillRect(x + 87, y + 54, 9, 8)
  ctx.fillStyle = '#1a1a2e'; ctx.fillRect(x + 28, y + 6, 44, 30)
  ctx.fillStyle = '#0d1117'; ctx.fillRect(x + 30, y + 8, 40, 26)
  ctx.fillStyle = 'rgba(40,120,200,0.35)'; ctx.fillRect(x + 30, y + 8, 40, 26)
  ctx.fillStyle = 'rgba(120,200,255,0.7)'
  ctx.fillRect(x + 33, y + 12, 22, 2); ctx.fillRect(x + 33, y + 16, 30, 2)
  ctx.fillRect(x + 33, y + 20, 18, 2); ctx.fillRect(x + 33, y + 24, 26, 2)
  ctx.fillStyle = 'rgba(120,255,180,0.5)'; ctx.fillRect(x + 33, y + 28, 14, 2)
  ctx.fillStyle = '#4a4a4a'
  ctx.fillRect(x + 46, y + 34, 8, 8); ctx.fillRect(x + 40, y + 40, 20, 4)
  ctx.fillStyle = '#c8c8c8'; ctx.fillRect(x + 24, y + 38, 36, 6)
  ctx.fillStyle = '#aaaaaa'
  for (let ki = 0; ki < 6; ki++) ctx.fillRect(x + 26 + ki * 5, y + 39, 4, 4)
}

function drawExecutiveDesk(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Larger, more prestigious desk for CEO/Chairman
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 6, y + 65, 120, 10)
  ctx.fillStyle = '#5c3010'; ctx.fillRect(x, y, 120, 58)
  ctx.fillStyle = 'rgba(255,220,150,0.12)'; ctx.fillRect(x, y, 120, 4)
  ctx.fillStyle = '#3d1e08'; ctx.fillRect(x, y + 48, 120, 17)
  ctx.strokeStyle = 'rgba(200,150,80,0.4)'; ctx.lineWidth = 1
  ctx.strokeRect(x + 3, y + 3, 114, 52)
  ctx.fillStyle = '#5a3818'
  ctx.fillRect(x + 4, y + 62, 11, 10); ctx.fillRect(x + 105, y + 62, 11, 10)
  ctx.fillStyle = '#1a1a2e'; ctx.fillRect(x + 32, y + 7, 56, 34)
  ctx.fillStyle = '#0d1117'; ctx.fillRect(x + 34, y + 9, 52, 30)
  ctx.fillStyle = 'rgba(40,100,200,0.4)'; ctx.fillRect(x + 34, y + 9, 52, 30)
  ctx.fillStyle = 'rgba(200,240,255,0.8)'
  ctx.fillRect(x + 38, y + 13, 28, 2); ctx.fillRect(x + 38, y + 18, 36, 2)
  ctx.fillRect(x + 38, y + 23, 22, 2); ctx.fillRect(x + 38, y + 28, 30, 2)
  ctx.fillStyle = 'rgba(200,255,180,0.6)'; ctx.fillRect(x + 38, y + 33, 18, 2)
  // Nameplate
  ctx.fillStyle = 'rgba(200,160,60,0.3)'; ctx.fillRect(x + 44, y + 43, 32, 5)
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#b06030'; ctx.fillRect(x + 7, y + 22, 18, 14)
  ctx.fillStyle = '#8a4820'; ctx.fillRect(x + 5, y + 20, 22, 4)
  ctx.fillStyle = '#2e7d32'
  ctx.beginPath(); ctx.ellipse(x + 16, y + 13, 15, 11, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#388e3c'
  ctx.beginPath(); ctx.ellipse(x + 9, y + 8, 8, 7, Math.PI / 5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + 23, y + 8, 8, 7, -Math.PI / 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#43a047'
  ctx.beginPath(); ctx.ellipse(x + 16, y + 7, 6, 5, 0, 0, Math.PI * 2); ctx.fill()
}

function drawHierarchicalBg(
  canvas: HTMLCanvasElement,
  deskAnchors: { x: number; y: number; level: string }[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CW, CH)

  // ── Draw floor sections ───────────────────────────────────────────────────
  for (const [key, { y: yStart, h }] of Object.entries(FLOOR)) {
    const wood = FLOOR_WOOD[key] || FLOOR_WOOD.specialist1
    for (let py = yStart; py < yStart + h; py += TILE) {
      const ci = Math.floor((py - yStart) / TILE) % wood.length
      ctx.fillStyle = wood[ci]
      ctx.fillRect(0, py, CW, TILE)
      ctx.fillStyle = 'rgba(0,0,0,0.06)'
      ctx.fillRect(0, py, CW, 1)
      // Plank lines
      const offset = (Math.floor((py - yStart) / TILE) * 53) % 100
      for (let sx = offset; sx < CW; sx += 100) {
        ctx.fillStyle = 'rgba(0,0,0,0.03)'
        ctx.fillRect(sx, py, 1, TILE)
      }
    }
    // Left wall label (rotated)
    const label = FLOOR_LABELS[key]
    if (label) {
      ctx.save()
      ctx.font = 'bold 8px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.translate(13, yStart + h / 2)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'center'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }

  // ── Dividers between floors ───────────────────────────────────────────────
  const divColors = ['#e24c4b', '#27ae60', '#f39c12', '#555']
  const divLabels = ['경영진', 'C-Suite', '팀장', '']
  DIVIDER_Y.forEach((dy, i) => {
    ctx.fillStyle = '#080808'
    ctx.fillRect(0, dy, CW, 8)
    ctx.fillStyle = divColors[i] + '60'
    ctx.fillRect(0, dy, CW, 2)
    if (divLabels[i]) {
      ctx.font = 'bold 7px monospace'
      ctx.fillStyle = divColors[i] + 'cc'
      ctx.textAlign = 'right'
      ctx.fillText('▲ ' + divLabels[i].toUpperCase(), CW - 16, dy + 6)
    }
  })

  // ── Desks at computed positions ───────────────────────────────────────────
  for (const dp of deskAnchors) {
    if (dp.level === 'ceo' || dp.level === 'chairman') {
      drawExecutiveDesk(ctx, dp.x - 60, dp.y - 62)
    } else {
      drawDesk(ctx, dp.x - 50, dp.y - 54)
    }
  }

  // ── Plants (corners of executive + team floors) ───────────────────────────
  plant(ctx, 6,    FLOOR.executive.y + 8)
  plant(ctx, CW - 46, FLOOR.executive.y + 8)
  plant(ctx, 6,    FLOOR.team.y + 8)
  plant(ctx, CW - 46, FLOOR.team.y + 8)
  plant(ctx, 6,    FLOOR.specialist1.y + 8)

  // ── Outer walls ───────────────────────────────────────────────────────────
  ctx.fillStyle = '#080604'
  ctx.fillRect(0, 0, CW, 6)
  ctx.fillRect(0, CH - 6, CW, 6)
  ctx.fillRect(0, 0, 6, CH)
  ctx.fillRect(CW - 6, 0, 6, CH)

  // ── Left wall stripe (level indicator) ───────────────────────────────────
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(6, 0, 14, CH)
  for (const [lv, color] of Object.entries({ chairman: '#e24c4b', ceo: '#3498db', chief: '#27ae60', team_lead: '#f39c12', specialist: '#7f8c8d' })) {
    const dy = lv === 'chairman' || lv === 'ceo' ? FLOOR.executive.y
      : lv === 'chief' ? FLOOR.csuite.y
      : lv === 'team_lead' ? FLOOR.team.y
      : FLOOR.specialist1.y
    const dh = lv === 'specialist' ? FLOOR.specialist1.h + 8 + FLOOR.specialist2.h
      : lv === 'chairman' || lv === 'ceo' ? FLOOR.executive.h
      : 148
    ctx.fillStyle = color + '55'
    ctx.fillRect(6, dy, 14, dh)
  }
}

// ── Pixel-art character ───────────────────────────────────────────────────────
const P = 3
const CHAR_W = 7 * P
const CHAR_H = 12 * P

function buildPixels(d: typeof DESIGNS[0]): [number, number, string][] {
  const { hair: H, skin: S, shirt: C, pants: Pt } = d
  const eye = '#222', mouth = '#c0506a', foot = '#3a3a3a'
  return [
    [1,0,H],[2,0,H],[3,0,H],[4,0,H],[5,0,H],
    [0,1,H],[1,1,H],[2,1,H],[3,1,H],[4,1,H],[5,1,H],[6,1,H],
    [0,2,S],[1,2,S],[2,2,S],[3,2,S],[4,2,S],[5,2,S],[6,2,S],
    [0,3,S],[1,3,eye],[2,3,S],[3,3,S],[4,3,eye],[5,3,S],[6,3,S],
    [0,4,S],[1,4,S],[2,4,S],[3,4,S],[4,4,S],[5,4,S],[6,4,S],
    [0,5,S],[1,5,S],[2,5,mouth],[3,5,mouth],[4,5,mouth],[5,5,S],[6,5,S],
    [0,6,C],[1,6,C],[2,6,C],[3,6,C],[4,6,C],[5,6,C],[6,6,C],
    [0,7,C],[1,7,C],[2,7,C],[3,7,C],[4,7,C],[5,7,C],[6,7,C],
    [0,8,C],[1,8,C],[2,8,C],[3,8,C],[4,8,C],[5,8,C],[6,8,C],
    [0,9,Pt],[1,9,Pt],[2,9,Pt],[4,9,Pt],[5,9,Pt],[6,9,Pt],
    [0,10,Pt],[1,10,Pt],[5,10,Pt],[6,10,Pt],
    [0,11,foot],[1,11,foot],[5,11,foot],[6,11,foot],
  ]
}

function PixelChar({
  charIdx, name, level, x, y, mode, bubble, isSelected, onClick,
}: {
  charIdx: number; name: string; level: string; x: number; y: number
  mode: AgentMode; bubble: string; isSelected: boolean; onClick: () => void
}) {
  const design = DESIGNS[charIdx % DESIGNS.length]
  const pixels = buildPixels(design)
  const lc = LEVEL_COLOR[level] || '#7f8c8d'

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x - CHAR_W / 2,
        top: y - CHAR_H,
        width: CHAR_W,
        transition: 'left 1.6s cubic-bezier(0.4,0,0.2,1), top 1.6s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 10,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {bubble && (
        <div style={{
          position: 'absolute', bottom: CHAR_H + 5, left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(8,8,18,0.94)', border: `1px solid ${lc}55`,
          borderRadius: 4, padding: '2px 7px', fontSize: 8.5, color: '#ccc',
          whiteSpace: 'nowrap', fontFamily: 'monospace', pointerEvents: 'none', zIndex: 30,
          minWidth: 60, textAlign: 'center',
        }}>
          {bubble}
          <div style={{
            position: 'absolute', bottom: -5, left: '50%', transform: 'translateX(-50%)',
            borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
            borderTop: `5px solid ${lc}55`,
          }} />
        </div>
      )}
      {isSelected && (
        <div style={{
          position: 'absolute', inset: -4, border: `2px solid ${lc}`,
          borderRadius: 4, pointerEvents: 'none', animation: 'selPulse 1.4s ease-in-out infinite',
        }} />
      )}
      <svg
        width={CHAR_W} height={CHAR_H}
        style={{ imageRendering: 'pixelated', display: 'block' }}
        shapeRendering="crispEdges"
      >
        {pixels.map(([px, py, color], i) => (
          <rect key={i} x={px * P} y={py * P} width={P} height={P} fill={color} />
        ))}
      </svg>
      <div style={{
        position: 'absolute', top: CHAR_H + 2, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.78)', border: `1px solid ${lc}44`, borderRadius: 3,
        padding: '1px 5px', fontSize: 7.5, color: '#ddd', whiteSpace: 'nowrap',
        fontFamily: 'monospace', pointerEvents: 'none', textAlign: 'center',
      }}>
        {name.length > 8 ? name.slice(0, 8) + '…' : name}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const TICK_MS = 4000

export default function LiveOffice() {
  const [activeTab, setActiveTab] = useState<'office' | 'meetings'>('office')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedId, setSelectedId] = useState<'chairman' | number>('chairman')
  const [agents, setAgents] = useState<LiveAgent[]>([])
  const [posMap, setPosMap] = useState<Map<number, { x: number; y: number }>>(new Map())
  const [selectedAgent, setSelectedAgent] = useState<LiveAgent | null>(null)
  const [ensuringSpecs, setEnsuringSpecs] = useState(false)
  const [ensureMsg, setEnsureMsg] = useState<string | null>(null)
  const tickRef = useRef(0)

  // Provider health for model dropdowns
  const { health } = useProviderHealth()

  // Model edit state for selected agent
  const [editProvider, setEditProvider] = useState('ollama')
  const [editModel, setEditModel] = useState('qwen2.5')
  const [savingModel, setSavingModel] = useState(false)
  const [savedModelMsg, setSavedModelMsg] = useState<string | null>(null)

  // Personality editor state
  const [personalityStyle, setPersonalityStyle] = useState('')
  const [personalityTraits, setPersonalityTraits] = useState('')
  const [personalitySpecialty, setPersonalitySpecialty] = useState('')
  const [savingPersonality, setSavingPersonality] = useState(false)
  const [savedPersonalityMsg, setSavedPersonalityMsg] = useState<string | null>(null)

  // Work trigger state
  const [triggeringWork, setTriggeringWork] = useState(false)
  const [workMsg, setWorkMsg] = useState<string | null>(null)

  // P2P message state
  const [p2pOpen, setP2pOpen] = useState(false)
  const [p2pTarget, setP2pTarget] = useState<number | ''>('')
  const [p2pTopic, setP2pTopic] = useState('')
  const [p2pLoading, setP2pLoading] = useState(false)
  const [p2pResult, setP2pResult] = useState<{ message: string; reply: string; from: string; to: string; from_name?: string; to_name?: string } | null>(null)
  const [p2pHistory, setP2pHistory] = useState<Array<{ from_name: string; to_name: string; topic: string; message: string; reply: string; created_at: string }>>([])
  const [p2pHistoryOpen, setP2pHistoryOpen] = useState(false)

  // Load companies list
  useEffect(() => {
    companiesApi.list().then((r) => setCompanies(r.data as Company[]))
  }, [])

  // Load agents when office changes
  const loadAgents = useCallback(async (officeId: 'chairman' | number) => {
    const companyId = officeId === 'chairman' ? undefined : (officeId as number)
    const res = await orgApi.nodes(companyId)
    const nodes = res.data as OrgNode[]
    const rawAgents: LiveAgent[] = nodes.map((n, i) => ({
      id: n.id, name: n.name, level: n.level, role: n.role || '',
      ai_model: n.ai_model || '—', ai_provider: n.ai_provider || 'mock',
      charIdx: i, x: 0, y: 0, mode: 'idle' as AgentMode, bubble: '',
      meta: n.meta || {},
    }))
    const pm = computePositions(rawAgents)
    const finalAgents = rawAgents.map((a) => {
      const pos = pm.get(a.id) || { x: CW / 2, y: 390 }
      return { ...a, x: pos.x, y: pos.y }
    })
    setAgents(finalAgents)
    setPosMap(pm)
    setSelectedAgent(null)
  }, [])

  useEffect(() => { loadAgents(selectedId) }, [selectedId, loadAgents])

  // Redraw canvas when agents/posMap change OR when switching back to office tab
  useEffect(() => {
    if (activeTab !== 'office') return
    if (!canvasRef.current) return
    const deskAnchors = Array.from(posMap.entries()).map(([id, pos]) => {
      const agent = agents.find((a) => a.id === id)
      return { x: pos.x, y: pos.y, level: agent?.level || 'specialist' }
    })
    drawHierarchicalBg(canvasRef.current, deskAnchors)
  }, [posMap, agents.length, activeTab])

  // Tick animation
  useEffect(() => {
    if (agents.length === 0) return
    const iv = setInterval(() => {
      tickRef.current += 1
      const t = tickRef.current
      setAgents((prev) =>
        prev.map((agent, i) => {
          const cycle = (t + i * 3) % 16
          const pool = ACTIVITIES[agent.level] || ACTIVITIES.specialist
          let mode: AgentMode = 'idle', bubble = ''
          const pos = posMap.get(agent.id) || { x: agent.x, y: agent.y }

          if (cycle < 5) {
            mode = 'working'
            bubble = pool[(t + i) % pool.length]
          } else if (cycle < 9) {
            mode = 'thinking'; bubble = '분석 중…'
          }
          return { ...agent, x: pos.x, y: pos.y, mode, bubble }
        })
      )
    }, TICK_MS)
    return () => clearInterval(iv)
  }, [agents.length, posMap])

  // Ensure specialists handler
  const handleEnsureSpecialists = async () => {
    if (selectedId === 'chairman') return
    setEnsuringSpecs(true)
    setEnsureMsg(null)
    try {
      const res = await orgApi.ensureSpecialists(selectedId as number)
      const { created } = res.data as { created: number }
      setEnsureMsg(created > 0 ? `✅ 스페셜리스트 ${created}명 추가 완료` : '✓ 이미 구성 완료')
      await loadAgents(selectedId)
    } catch {
      setEnsureMsg('❌ 오류 발생')
    } finally {
      setEnsuringSpecs(false)
      setTimeout(() => setEnsureMsg(null), 3000)
    }
  }

  const savePersonality = async () => {
    if (!selectedAgent) return
    setSavingPersonality(true)
    try {
      const personality = {
        style: personalityStyle,
        traits: personalityTraits.split(',').map((t) => t.trim()).filter(Boolean),
        specialty: personalitySpecialty,
      }
      await agentApi.updatePersonality(selectedAgent.id, personality)
      setAgents((prev) => prev.map((a) =>
        a.id === selectedAgent.id ? { ...a, meta: { ...(a.meta || {}), personality } } : a
      ))
      setSavedPersonalityMsg('저장됨')
    } catch { setSavedPersonalityMsg('오류') }
    setSavingPersonality(false)
    setTimeout(() => setSavedPersonalityMsg(null), 2000)
  }

  const handleP2pSend = async () => {
    if (!selectedAgent || !p2pTarget || !p2pTopic.trim()) return
    setP2pLoading(true)
    setP2pResult(null)
    try {
      const res = await workApi.p2p(selectedAgent.id, p2pTarget as number, p2pTopic)
      const data = res.data as { from_name: string; to_name: string; message: string; reply: string; from: string; to: string }
      setP2pResult(data)
      setP2pTopic('')
    } catch { /* ignore */ } finally { setP2pLoading(false) }
  }

  const loadP2pHistory = async () => {
    if (!selectedId || selectedId === 'chairman') return
    try {
      const res = await workApi.p2pList(selectedId as number)
      setP2pHistory(res.data as any[])
    } catch { /* ignore */ }
  }

  const handleWorkTrigger = async () => {
    if (selectedId === 'chairman' || typeof selectedId !== 'number') return
    setTriggeringWork(true)
    setWorkMsg(null)
    try {
      const res = await workApi.trigger(selectedId)
      const data = res.data as { total_logs: number; cycle_id: string }
      setWorkMsg(`✅ 업무 완료 (${data.total_logs}건 · 사이클 #${data.cycle_id})`)
    } catch { setWorkMsg('❌ 업무 실행 오류') }
    setTriggeringWork(false)
    setTimeout(() => setWorkMsg(null), 5000)
  }

  const selData = selectedAgent ? agents.find((a) => a.id === selectedAgent.id) : null

  // Sync model + personality edit state when selection changes
  useEffect(() => {
    if (!selData) return
    const prov = selData.ai_provider === 'mock' ? 'ollama' : (selData.ai_provider || 'ollama')
    setEditProvider(prov)
    setEditModel(selData.ai_model !== '—' ? selData.ai_model : (prov === 'ollama' ? 'qwen2.5' : ''))
    // Load personality from meta
    const p = (selData.meta?.personality || {}) as Record<string, unknown>
    setPersonalityStyle((p.style as string) || '')
    setPersonalityTraits(Array.isArray(p.traits) ? (p.traits as string[]).join(', ') : '')
    setPersonalitySpecialty((p.specialty as string) || '')
  }, [selData?.id])

  const saveAgentModel = async () => {
    if (!selData) return
    setSavingModel(true)
    try {
      const agent = agents.find((a) => a.id === selData.id)
      if (!agent) return
      await orgApi.updateNode(selData.id, {
        name: agent.name, role: agent.role, level: agent.level,
        ai_provider: editProvider, ai_model: editModel, description: '',
      })
      setAgents((prev) => prev.map((a) =>
        a.id === selData.id ? { ...a, ai_provider: editProvider, ai_model: editModel } : a
      ))
      setSavedModelMsg('저장됨')
    } catch { setSavedModelMsg('오류') }
    setSavingModel(false)
    setTimeout(() => setSavedModelMsg(null), 2000)
  }
  const officeLabel = selectedId === 'chairman'
    ? '🏛 회장실'
    : `🏢 ${companies.find((c) => c.id === selectedId)?.name || ''}`

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-bg-border pb-3">
        {([
          { id: 'office', label: '오피스 공간', icon: Monitor },
          { id: 'meetings', label: '회의실', icon: Users },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === id
                ? 'bg-brand/15 text-brand-light'
                : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'meetings' && <Meetings />}

      {activeTab === 'office' && <>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">AI 오피스 — {officeLabel}</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {agents.length}명 근무 중 · 직급 높은 순으로 위에서 아래로 배치
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Level legend */}
          {(['ceo', 'chief', 'team_lead', 'specialist'] as const).map((lv) => (
            <div key={lv} className="flex items-center gap-1">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: LEVEL_COLOR[lv] }} />
              <span className="text-[9px] text-slate-500 font-mono">{LEVEL_KO[lv]}</span>
            </div>
          ))}
          {selectedId !== 'chairman' && (
            <>
              <button
                onClick={handleEnsureSpecialists}
                disabled={ensuringSpecs}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99,102,241,0.3)',
                }}
              >
                {ensuringSpecs ? '구성 중…' : '스페셜리스트 3명 구성'}
              </button>
              <button
                onClick={handleWorkTrigger}
                disabled={triggeringWork}
                className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1.5"
                style={{
                  background: triggeringWork ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(52,211,153,0.3)',
                }}
              >
                {triggeringWork ? '실행 중…' : '⚙️ 업무 실행'}
              </button>
            </>
          )}
          {ensureMsg && (
            <span className="text-[11px] text-emerald-400">{ensureMsg}</span>
          )}
          {workMsg && (
            <span className="text-[11px]" style={{ color: workMsg.startsWith('✅') ? '#34d399' : '#f87171' }}>{workMsg}</span>
          )}
        </div>
      </div>

      {/* Office selector tabs */}
      <div className="flex gap-1.5 flex-wrap">
        <button
          onClick={() => setSelectedId('chairman')}
          className="text-xs px-3 py-1.5 rounded-lg transition-all"
          style={selectedId === 'chairman'
            ? { background: 'rgba(226,76,75,0.2)', color: '#f87171', border: '1px solid rgba(226,76,75,0.4)' }
            : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
          }
        >
          🏛 회장실
        </button>
        {companies.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className="text-xs px-3 py-1.5 rounded-lg transition-all"
            style={selectedId === c.id
              ? { background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.4)' }
              : { background: 'rgba(255,255,255,0.04)', color: '#64748b', border: '1px solid rgba(255,255,255,0.06)' }
            }
          >
            🏢 {c.name}
          </button>
        ))}
      </div>

      {/* Floor layout legend */}
      <div className="flex gap-4 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { label: '상위 (경영진)', color: '#4a2510', desc: 'CEO / 회장' },
          { label: '중간 (C-Suite)', color: '#0e2218', desc: 'Chief / 위원회' },
          { label: '팀 오피스', color: '#111c34', desc: '팀장' },
          { label: '하위 (전문가)', color: '#161622', desc: '스페셜리스트' },
        ].map((f) => (
          <div key={f.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm border border-white/10" style={{ background: f.color }} />
            <div>
              <div className="text-[9px] text-slate-400 font-medium">{f.label}</div>
              <div className="text-[8px] text-slate-600">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main canvas */}
      <div className="card overflow-hidden p-0">
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '80vh' }}>
          <div style={{ position: 'relative', width: CW, height: CH }}>
            <canvas
              ref={canvasRef} width={CW} height={CH}
              style={{ display: 'block', imageRendering: 'pixelated' }}
            />
            {agents.map((agent) => (
              <PixelChar
                key={agent.id}
                charIdx={agent.charIdx}
                name={agent.name}
                level={agent.level}
                x={agent.x}
                y={agent.y}
                mode={agent.mode}
                bubble={agent.bubble}
                isSelected={selectedAgent?.id === agent.id}
                onClick={() => setSelectedAgent((p) => p?.id === agent.id ? null : agent)}
              />
            ))}
            {agents.length === 0 && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 36 }}>🏢</div>
                <div style={{ color: '#444', fontSize: 13, fontFamily: 'monospace' }}>조직원이 없습니다</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected agent detail */}
      {selData && (
        <div className="card p-4" style={{ borderLeft: `3px solid ${LEVEL_COLOR[selData.level] || '#555'}` }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: LEVEL_COLOR[selData.level] || '#555',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
              }}>
                {LEVEL_EMOJI[selData.level] || '🤖'}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-200">{selData.name}</div>
                <div className="text-[10px] text-slate-500">
                  {LEVEL_KO[selData.level] || selData.level}
                  {selData.role && ` · ${selData.role}`}
                </div>
              </div>
            </div>
            <button onClick={() => setSelectedAgent(null)} className="text-slate-600 hover:text-slate-300 text-xs px-2">✕</button>
          </div>
          <div className="space-y-2">
            {/* Model change row */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-[9px] text-slate-500 w-14">AI 모델</div>
              {/* Provider select */}
              <select
                value={editProvider}
                onChange={(e) => {
                  setEditProvider(e.target.value)
                  const mods = e.target.value === 'ollama'
                    ? [...new Set([...(health?.ollama.models_available || []), ...PROVIDER_MODELS.ollama])]
                    : PROVIDER_MODELS[e.target.value] || []
                  setEditModel(mods[0] || '')
                }}
                className="text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300 font-mono cursor-pointer"
              >
                {['ollama', 'anthropic', 'openai'].map((p) => {
                  const ok = p === 'ollama'
                    ? health?.ollama.status === 'connected'
                    : health?.[p as 'anthropic' | 'openai']?.status === 'configured'
                  return <option key={p} value={p}>{p}{ok ? ' ✓' : ' ✗'}</option>
                })}
              </select>
              {/* Model select */}
              <select
                value={editModel}
                onChange={(e) => setEditModel(e.target.value)}
                className="flex-1 text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300 font-mono cursor-pointer"
              >
                {(editProvider === 'ollama'
                  ? [...new Set([...(health?.ollama.models_available || []), ...PROVIDER_MODELS.ollama])]
                  : PROVIDER_MODELS[editProvider] || []
                ).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {/* Connection status */}
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{
                  background: (editProvider === 'ollama'
                    ? health?.ollama.status === 'connected'
                    : health?.[editProvider as 'anthropic' | 'openai']?.status === 'configured')
                    ? '#34d399' : '#ef4444',
                }}
              />
              {/* Save button */}
              <button
                onClick={saveAgentModel}
                disabled={savingModel || (editProvider === (selData.ai_provider === 'mock' ? 'ollama' : selData.ai_provider) && editModel === selData.ai_model)}
                className="text-[9px] px-2.5 py-1 rounded font-medium transition-colors"
                style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
              >
                {savingModel ? '…' : '저장'}
              </button>
              {savedModelMsg && <span className="text-[9px] text-emerald-400">{savedModelMsg}</span>}
            </div>
            {/* Personality editor */}
            <div
              className="rounded-lg p-3 space-y-2"
              style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}
            >
              <div className="text-[10px] font-medium text-indigo-300 mb-2">🧠 에이전트 개성 설정</div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 w-16 flex-shrink-0">스타일</span>
                <input
                  value={personalityStyle}
                  onChange={(e) => setPersonalityStyle(e.target.value)}
                  placeholder="예: 분석적, 창의적, 직접적"
                  className="flex-1 text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 w-16 flex-shrink-0">특성 (,구분)</span>
                <input
                  value={personalityTraits}
                  onChange={(e) => setPersonalityTraits(e.target.value)}
                  placeholder="예: 꼼꼼함, 목표 지향적, 데이터 중심"
                  className="flex-1 text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 w-16 flex-shrink-0">전문 분야</span>
                <input
                  value={personalitySpecialty}
                  onChange={(e) => setPersonalitySpecialty(e.target.value)}
                  placeholder="예: 백엔드 아키텍처, SEO 최적화"
                  className="flex-1 text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={savePersonality}
                  disabled={savingPersonality}
                  className="text-[9px] px-2.5 py-1 rounded font-medium"
                  style={{ background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', border: '1px solid rgba(99,102,241,0.3)' }}
                >
                  {savingPersonality ? '…' : '개성 저장'}
                </button>
                {savedPersonalityMsg && <span className="text-[9px] text-emerald-400">{savedPersonalityMsg}</span>}
              </div>
            </div>
            {/* Status row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-bg-elevated rounded-lg px-3 py-2">
                <div className="text-[9px] text-slate-500 mb-1">현재 상태</div>
                <div className="text-xs">
                  {selData.mode === 'working' ? '🟢 작업 중'
                    : selData.mode === 'thinking' ? '🔵 분석 중'
                    : selData.mode === 'coffee' ? '☕ 휴식' : '⚪ 대기'}
                </div>
              </div>
              <div className="bg-bg-elevated rounded-lg px-3 py-2">
                <div className="text-[9px] text-slate-500 mb-1">연결 상태</div>
                <div className="text-[10px] font-mono" style={{
                  color: (editProvider === 'ollama'
                    ? health?.ollama.status === 'connected'
                    : health?.[editProvider as 'anthropic' | 'openai']?.status === 'configured')
                    ? '#34d399' : '#f87171',
                }}>
                  {(editProvider === 'ollama'
                    ? health?.ollama.status === 'connected' ? '✓ 연결됨' : '✗ 미연결'
                    : health?.[editProvider as 'anthropic' | 'openai']?.status === 'configured' ? '✓ 등록됨' : '✗ 키 없음'
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent roster by level */}
      {agents.length > 0 && (
        <div className="space-y-2">
          {(['chairman', 'committee', 'ceo', 'chief', 'team_lead', 'specialist'] as const)
            .map((level) => {
              const lvAgents = agents.filter((a) => a.level === level)
              if (!lvAgents.length) return null
              return (
                <div key={level}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: LEVEL_COLOR[level] + '22',
                        color: LEVEL_COLOR[level],
                        border: `1px solid ${LEVEL_COLOR[level]}44`,
                      }}
                    >
                      {LEVEL_EMOJI[level]} {LEVEL_KO[level]}
                    </div>
                    <div className="flex-1 h-px bg-bg-border" />
                    <span className="text-[9px] text-slate-600">{lvAgents.length}명</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-1.5">
                    {lvAgents.map((a) => (
                      <div
                        key={a.id}
                        onClick={() => setSelectedAgent((p) => p?.id === a.id ? null : a)}
                        className="bg-bg-elevated rounded-lg px-2.5 py-2 flex items-center gap-2 cursor-pointer hover:bg-bg-card transition-colors"
                        style={{
                          borderLeft: `2px solid ${LEVEL_COLOR[a.level] || '#555'}`,
                          background: selectedAgent?.id === a.id ? `${LEVEL_COLOR[a.level]}11` : undefined,
                        }}
                      >
                        <div style={{ fontSize: 11, flexShrink: 0 }}>{LEVEL_EMOJI[a.level] || '🤖'}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] font-medium text-slate-300 truncate">{a.name}</div>
                          <div className="text-[8px] text-slate-600 truncate">{a.role || a.ai_provider}</div>
                          <div className="text-[8px] mt-0.5">
                            {a.mode === 'working' ? '🟢' : a.mode === 'thinking' ? '🔵' : '⚪'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
        </div>
      )}

      {/* ── P2P Message Panel ── */}
      {selectedAgent && selData && (
        <div className="card p-4" style={{ borderLeft: '3px solid rgba(251,191,36,0.6)' }}>
          <button
            className="w-full flex items-center justify-between mb-0"
            onClick={() => { setP2pOpen((v) => !v); if (!p2pOpen) loadP2pHistory() }}
          >
            <div className="flex items-center gap-2">
              <MessageCircle size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-slate-200">에이전트 P2P 메시지</span>
              <span className="text-[9px] text-slate-600">— {selData.name}이(가) 다른 에이전트에게 메시지 전송</span>
            </div>
            {p2pOpen ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
          </button>

          {p2pOpen && (
            <div className="mt-3 space-y-3">
              {/* Send form */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[9px] text-slate-500 w-10 flex-shrink-0">받는 AI</span>
                <select
                  value={p2pTarget}
                  onChange={(e) => setP2pTarget(Number(e.target.value))}
                  className="text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300"
                >
                  <option value="">선택</option>
                  {agents.filter((a) => a.id !== selectedAgent.id).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
                  ))}
                </select>
                <input
                  value={p2pTopic}
                  onChange={(e) => setP2pTopic(e.target.value)}
                  placeholder="협의 주제 입력…"
                  className="flex-1 text-[10px] bg-bg-base border border-bg-border rounded px-2 py-1 text-slate-300"
                  onKeyDown={(e) => e.key === 'Enter' && handleP2pSend()}
                />
                <button
                  onClick={handleP2pSend}
                  disabled={p2pLoading || !p2pTarget || !p2pTopic.trim()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-medium"
                  style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                >
                  {p2pLoading ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                  전송
                </button>
              </div>

              {/* Result */}
              {p2pResult && (
                <div className="space-y-2 rounded-lg p-3" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
                  <div>
                    <div className="text-[9px] text-amber-400 mb-1">📤 {p2pResult.from_name}</div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{p2pResult.message}</p>
                  </div>
                  <div className="border-t border-white/[0.05] pt-2">
                    <div className="text-[9px] text-emerald-400 mb-1">📥 {p2pResult.to_name}</div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{p2pResult.reply}</p>
                  </div>
                </div>
              )}

              {/* History */}
              {p2pHistory.length > 0 && (
                <div>
                  <button
                    className="text-[9px] text-slate-500 hover:text-slate-300 flex items-center gap-1 mb-2"
                    onClick={() => setP2pHistoryOpen((v) => !v)}
                  >
                    {p2pHistoryOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                    이전 메시지 {p2pHistory.length}건
                  </button>
                  {p2pHistoryOpen && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {p2pHistory.slice(0, 10).map((m, i) => (
                        <div key={i} className="rounded-lg p-2.5 text-[10px]"
                          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="flex items-center gap-1.5 mb-1 text-[9px] text-slate-500">
                            <span className="text-amber-500">{m.from_name}</span>
                            <span>→</span>
                            <span className="text-emerald-500">{m.to_name}</span>
                            <span className="ml-auto">{new Date(m.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="text-slate-600 font-medium mb-1">{m.topic}</div>
                          <p className="text-slate-500 line-clamp-2">{m.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes selPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      </>}
    </div>
  )
}
