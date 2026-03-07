import { useEffect, useRef, useState } from 'react'
import { meetingsApi, orgApi } from '../api/client'
import type { OrgNode } from '../types'

// ── Layout ────────────────────────────────────────────────────────────────────
const CW = 900
const CH = 580
const TILE = 32

// Zone bounds (px)
const ZONES = {
  main:    { x: 0,   y: 220, w: 900, h: 360 },
  breakR:  { x: 0,   y: 0,   w: 390, h: 220 },
  meetR:   { x: 510, y: 0,   w: 390, h: 220 },
  corridor:{ x: 390, y: 0,   w: 120, h: 220 },
}

// Desk anchor positions (character stands at this y, desk drawn above)
const DESK_ANCHORS = [
  { x: 130, y: 310 }, { x: 310, y: 310 }, { x: 490, y: 310 }, { x: 670, y: 310 },
  { x: 130, y: 400 }, { x: 310, y: 400 }, { x: 490, y: 400 }, { x: 670, y: 400 },
  { x: 130, y: 490 }, { x: 310, y: 490 }, { x: 490, y: 490 }, { x: 670, y: 490 },
]
const MEETING_TABLE_CENTER = { x: 705, y: 110 }
const MEETING_SEATS = [
  { x: 638, y: 78 }, { x: 772, y: 78 },
  { x: 638, y: 142 }, { x: 772, y: 142 },
]
const BREAK_SPOTS = [{ x: 200, y: 130 }, { x: 200, y: 185 }]

const TICK_MS = 4000

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
  chairman: ['전략 검토', '보고서 분석', '의사결정'],
  committee: ['시장 분석', '투자 심사', '거버넌스'],
  ceo: ['팀 관리', '로드맵 수립', 'KPI 분석'],
  general: ['작업 처리', '분석 중', '검토 중'],
}
const MEETING_MSGS = ['전략 방향 논의', '시장 진입 검토', '리소스 배분', '분기 목표 조율']

type AgentMode = 'idle' | 'working' | 'thinking' | 'meeting' | 'coffee'

// ── Canvas drawing ─────────────────────────────────────────────────────────────
function drawBg(canvas: HTMLCanvasElement, meetingActive: boolean) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, CW, CH)

  const { main, breakR, meetR, corridor } = ZONES

  // ─ Main office: warm wooden plank floor ─
  const planks = ['#c09560', '#b8895a', '#ba915e', '#bf9762', '#b58854', '#c29862']
  for (let py = main.y; py < main.y + main.h; py += TILE) {
    const ci = Math.floor((py - main.y) / TILE) % planks.length
    ctx.fillStyle = planks[ci]
    ctx.fillRect(main.x, py, main.w, TILE)
    ctx.fillStyle = 'rgba(0,0,0,0.055)'
    ctx.fillRect(main.x, py, main.w, 1)
    const offset = (Math.floor((py - main.y) / TILE) * 47) % 80
    for (let sx = offset; sx < main.w; sx += 80) {
      ctx.fillStyle = 'rgba(0,0,0,0.035)'
      ctx.fillRect(main.x + sx, py, 1, TILE)
    }
  }

  // ─ Break room: cool dark tiles ─
  for (let ty = breakR.y; ty < breakR.y + breakR.h; ty += TILE) {
    for (let tx = breakR.x; tx < breakR.x + breakR.w; tx += TILE) {
      const alt = (Math.floor(tx / TILE) + Math.floor(ty / TILE)) % 2 === 0
      ctx.fillStyle = alt ? '#536170' : '#4a5564'
      ctx.fillRect(tx, ty, TILE, TILE)
    }
  }
  for (let ty = breakR.y; ty < breakR.y + breakR.h; ty += TILE) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fillRect(breakR.x, ty, breakR.w, 1)
  }
  for (let tx = breakR.x; tx < breakR.x + breakR.w; tx += TILE) {
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(tx, breakR.y, 1, breakR.h)
  }

  // ─ Meeting room: lighter wood ─
  for (let py = meetR.y; py < meetR.y + meetR.h; py += TILE) {
    const ci = Math.floor((py - meetR.y) / TILE) % 3
    ctx.fillStyle = meetingActive
      ? ['#d4b896', '#c8aa82', '#d0b48e'][ci]
      : ['#c4a27c', '#b8966e', '#c0a07a'][ci]
    ctx.fillRect(meetR.x, py, meetR.w, TILE)
    ctx.fillStyle = 'rgba(0,0,0,0.045)'; ctx.fillRect(meetR.x, py, meetR.w, 1)
  }
  if (meetingActive) {
    const g = ctx.createRadialGradient(
      MEETING_TABLE_CENTER.x, MEETING_TABLE_CENTER.y, 0,
      MEETING_TABLE_CENTER.x, MEETING_TABLE_CENTER.y, 130,
    )
    g.addColorStop(0, 'rgba(155,89,182,0.18)')
    g.addColorStop(1, 'rgba(155,89,182,0)')
    ctx.fillStyle = g
    ctx.fillRect(meetR.x, meetR.y, meetR.w, meetR.h)
  }

  // ─ Corridor: dark passage ─
  ctx.fillStyle = '#312418'; ctx.fillRect(corridor.x, corridor.y, corridor.w, corridor.h)
  ctx.fillStyle = '#3a2c1e'; ctx.fillRect(corridor.x + 16, corridor.y, corridor.w - 32, corridor.h)
  for (let ky = corridor.y + 16; ky < corridor.y + corridor.h - 16; ky += 48) {
    ctx.fillStyle = 'rgba(255,220,120,0.12)'
    ctx.beginPath(); ctx.arc(corridor.x + corridor.w / 2, ky, 4, 0, Math.PI * 2); ctx.fill()
  }

  // ─ Walls ─
  ctx.fillStyle = '#221610'
  ctx.fillRect(0, 0, CW, 10); ctx.fillRect(0, CH - 6, CW, 6)
  ctx.fillRect(0, 0, 6, CH); ctx.fillRect(CW - 6, 0, 6, CH)
  ctx.fillStyle = '#1a1008'
  ctx.fillRect(0, main.y - 14, CW, 14)
  // doorways
  ctx.fillStyle = planks[0]; ctx.fillRect(breakR.w - 28, main.y - 14, 56, 14)
  ctx.fillStyle = meetingActive ? '#d4b896' : '#c4a27c'
  ctx.fillRect(meetR.x + 24, main.y - 14, 56, 14)

  // ─ Bookshelves ─
  shelf(ctx, 6,      main.y,       76, 52)
  shelf(ctx, 820,    main.y,       74, 52)
  shelf(ctx, 210,    main.y,       100, 52)
  shelf(ctx, 590,    main.y,       100, 52)
  shelf(ctx, CW-76,  10,           70, 96)
  shelf(ctx, CW-76,  112,          70, 88)
  shelf(ctx, 6,      10,           70, 88)
  shelf(ctx, 6,      104,          70, 96)

  // ─ Desks ─
  for (const dp of DESK_ANCHORS) drawDesk(ctx, dp.x - 52, dp.y - 54)

  // ─ Meeting table ─
  drawMeetTable(ctx, MEETING_TABLE_CENTER.x, MEETING_TABLE_CENTER.y, meetingActive)

  // ─ Plants ─
  plant(ctx, 8,        main.y + 12)
  plant(ctx, CW - 48,  main.y + 12)
  plant(ctx, 8,        main.y + 300)
  plant(ctx, CW - 48,  main.y + 300)
  plant(ctx, meetR.x + 6, 8)

  // ─ Coffee machine ─
  coffeeMachine(ctx, 300, 34)

  // ─ Clock ─
  drawClock(ctx, meetR.x + 44, 20)

  // ─ Picture frame ─
  picture(ctx, meetR.x + 155, 18)

  // ─ Wall labels ─
  ctx.font = 'bold 9px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillText('BREAK ROOM', 106, 14)
  ctx.fillStyle = meetingActive ? 'rgba(200,140,255,0.5)' : 'rgba(255,255,255,0.18)'
  ctx.fillText('MEETING ROOM', meetR.x + 80, 14)
}

function shelf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#5a3818'; ctx.fillRect(x, y, w, h)
  ctx.fillStyle = '#3e2610'; ctx.fillRect(x, y + Math.floor(h / 2) - 2, w, 4)
  const bc = ['#e74c3c','#3498db','#27ae60','#f39c12','#9b59b6','#e67e22','#1abc9c','#e91e63']
  const bw = 9, halfH = Math.floor(h / 2)
  for (let bx = x + 3; bx < x + w - 3; bx += bw) {
    const c = bc[Math.floor((bx - x) / bw) % bc.length]
    ctx.fillStyle = c
    ctx.fillRect(bx, y + 4, bw - 2, halfH - 6)
    ctx.fillRect(bx, y + halfH + 2, bw - 2, halfH - 6)
  }
  ctx.strokeStyle = '#2a1808'; ctx.lineWidth = 1; ctx.strokeRect(x, y, w, h)
}

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

function drawMeetTable(ctx: CanvasRenderingContext2D, cx: number, cy: number, active: boolean) {
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.beginPath(); ctx.ellipse(cx + 4, cy + 5, 72, 44, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = active ? '#a07848' : '#8b6340'
  ctx.beginPath(); ctx.ellipse(cx, cy, 72, 44, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = active ? '#b8905a' : '#9e7248'
  ctx.beginPath(); ctx.ellipse(cx, cy - 4, 65, 38, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.beginPath(); ctx.ellipse(cx - 22, cy - 16, 28, 16, -Math.PI / 4, 0, Math.PI * 2); ctx.fill()
  if (active) {
    ctx.strokeStyle = 'rgba(155,89,182,0.7)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(cx, cy, 74, 46, 0, 0, Math.PI * 2); ctx.stroke()
  }
  // chairs
  for (const cp of [
    { x: cx - 80, y: cy - 10 }, { x: cx + 80, y: cy - 10 },
    { x: cx - 52, y: cy + 42 }, { x: cx + 52, y: cy + 42 },
  ]) {
    ctx.fillStyle = '#5d3a1a'; ctx.fillRect(cp.x - 14, cp.y - 8, 28, 18)
    ctx.fillStyle = '#7a4e28'; ctx.fillRect(cp.x - 12, cp.y - 6, 24, 14)
  }
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#b06030'; ctx.fillRect(x + 7, y + 22, 18, 14)
  ctx.fillStyle = '#8a4820'; ctx.fillRect(x + 5, y + 20, 22, 4)
  ctx.fillStyle = '#2e7d32'
  ctx.beginPath(); ctx.ellipse(x + 16, y + 13, 15, 11, 0, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#388e3c'
  ctx.beginPath(); ctx.ellipse(x + 9,  y + 8, 8, 7,  Math.PI / 5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + 23, y + 8, 8, 7, -Math.PI / 5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#43a047'
  ctx.beginPath(); ctx.ellipse(x + 16, y + 7, 6, 5, 0, 0, Math.PI * 2); ctx.fill()
}

function coffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(x + 4, y + 4, 44, 62)
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x, y, 44, 62)
  ctx.fillStyle = '#333'; ctx.fillRect(x, y, 44, 8)
  ctx.fillStyle = '#0d4a28'; ctx.fillRect(x + 6, y + 10, 32, 18)
  ctx.fillStyle = '#1a8a4a'; ctx.fillRect(x + 8, y + 12, 8, 3)
  ctx.fillStyle = '#0d6638'; ctx.fillRect(x + 8, y + 17, 20, 3)
  ctx.fillStyle = '#1aaa5a'; ctx.fillRect(x + 8, y + 22, 10, 2)
  ctx.fillStyle = '#444'; ctx.fillRect(x + 10, y + 38, 24, 16)
  ctx.fillStyle = '#f5f5dc'; ctx.fillRect(x + 14, y + 40, 16, 12)
  ctx.fillStyle = '#c8a060'; ctx.fillRect(x + 16, y + 44, 12, 4)
  ctx.strokeStyle = 'rgba(220,220,220,0.5)'; ctx.lineWidth = 1.5
  for (let si = 0; si < 2; si++) {
    ctx.beginPath(); ctx.moveTo(x + 18 + si * 8, y + 34)
    ctx.quadraticCurveTo(x + 14 + si * 8, y + 28, x + 18 + si * 8, y + 22); ctx.stroke()
  }
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x - 2, y + 58, 48, 8)
}

function drawClock(ctx: CanvasRenderingContext2D, x: number, y: number) {
  const now = new Date(), h = now.getHours() % 12, m = now.getMinutes()
  ctx.fillStyle = '#e8e0d0'
  ctx.beginPath(); ctx.arc(x + 20, y + 20, 18, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#5d3a1a'; ctx.lineWidth = 2.5; ctx.stroke()
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    ctx.fillStyle = i % 3 === 0 ? '#333' : '#888'
    ctx.fillRect(x + 20 + Math.cos(a) * 14 - 1, y + 20 + Math.sin(a) * 14 - 1, 2, 2)
  }
  const ha = (h / 12 + m / 720) * Math.PI * 2 - Math.PI / 2
  const ma = (m / 60) * Math.PI * 2 - Math.PI / 2
  ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x + 20, y + 20)
  ctx.lineTo(x + 20 + Math.cos(ha) * 10, y + 20 + Math.sin(ha) * 10); ctx.stroke()
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x + 20, y + 20)
  ctx.lineTo(x + 20 + Math.cos(ma) * 14, y + 20 + Math.sin(ma) * 14); ctx.stroke()
  ctx.fillStyle = '#333'
  ctx.beginPath(); ctx.arc(x + 20, y + 20, 2, 0, Math.PI * 2); ctx.fill()
}

function picture(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#5d3a1a'; ctx.fillRect(x, y, 64, 44)
  ctx.fillStyle = '#4a90e2'; ctx.fillRect(x + 4, y + 4, 56, 22)
  ctx.fillStyle = '#27ae60'; ctx.fillRect(x + 4, y + 26, 56, 14)
  ctx.fillStyle = '#2ecc71'
  for (let ti = 0; ti < 3; ti++) {
    ctx.beginPath()
    ctx.moveTo(x + 10 + ti * 18, y + 28); ctx.lineTo(x + 19 + ti * 18, y + 14); ctx.lineTo(x + 28 + ti * 18, y + 28)
    ctx.fill()
  }
  ctx.fillStyle = '#f1c40f'
  ctx.beginPath(); ctx.arc(x + 50, y + 12, 6, 0, Math.PI * 2); ctx.fill()
}

// ── SVG pixel-art character ────────────────────────────────────────────────────
const P = 3

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

const CHAR_W = 7 * P
const CHAR_H = 12 * P

interface LiveAgent {
  id: number; name: string; level: string; ai_model: string; ai_provider: string
  charIdx: number; deskIdx: number; x: number; y: number; mode: AgentMode; bubble: string
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
        zIndex: mode === 'meeting' ? 20 : 10,
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
        background: 'rgba(0,0,0,0.75)', border: `1px solid ${lc}44`, borderRadius: 3,
        padding: '1px 5px', fontSize: 7.5, color: '#ddd', whiteSpace: 'nowrap',
        fontFamily: 'monospace', pointerEvents: 'none', textAlign: 'center',
      }}>
        {name.length > 7 ? name.slice(0, 7) + '…' : name}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LiveOffice() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [agents, setAgents] = useState<LiveAgent[]>([])
  const [meetingActive, setMeetingActive] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<LiveAgent | null>(null)
  const tickRef = useRef(0)
  const meetRef = useRef(false)

  useEffect(() => {
    orgApi.nodes().then((res) => {
      const nodes = res.data as OrgNode[]
      setAgents(nodes.map((n, i) => {
        const dp = DESK_ANCHORS[i % DESK_ANCHORS.length]
        return {
          id: n.id, name: n.name, level: n.level,
          ai_model: n.ai_model || '—', ai_provider: n.ai_provider || 'mock',
          charIdx: i, deskIdx: i % DESK_ANCHORS.length,
          x: dp.x, y: dp.y,
          mode: 'idle' as AgentMode, bubble: '',
        }
      }))
    })
  }, [])

  useEffect(() => {
    const check = () => {
      meetingsApi.list().then((res) => {
        const open = (res.data as { status: string }[]).some((m) => m.status === 'open')
        setMeetingActive(open); meetRef.current = open
      }).catch(() => {})
    }
    check(); const iv = setInterval(check, 10000); return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (canvasRef.current) drawBg(canvasRef.current, meetingActive)
  }, [meetingActive, agents.length])

  useEffect(() => {
    const iv = setInterval(() => {
      if (canvasRef.current) drawBg(canvasRef.current, meetRef.current)
    }, 60000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (agents.length === 0) return
    const timer = setInterval(() => {
      tickRef.current += 1
      const t = tickRef.current
      setAgents((prev) =>
        prev.map((agent, i) => {
          if (meetRef.current && i < 4) {
            const seat = MEETING_SEATS[i % MEETING_SEATS.length]
            return {
              ...agent, x: seat.x, y: seat.y, mode: 'meeting' as AgentMode,
              bubble: t % 4 === i % 4 ? MEETING_MSGS[t % MEETING_MSGS.length] : '',
            }
          }
          const cycle = (t + i * 2) % 14
          let mode: AgentMode = 'idle', bubble = ''
          const dp = DESK_ANCHORS[agent.deskIdx]
          let x = dp.x, y = dp.y

          if (cycle < 5) {
            mode = 'working'
            const pool = ACTIVITIES[agent.level] || ACTIVITIES.general
            bubble = pool[(t + i) % pool.length]
          } else if (cycle < 8) {
            mode = 'thinking'; bubble = '분석 중…'
          } else if (cycle === 10 && i % 4 === 0) {
            mode = 'coffee'
            const bp = BREAK_SPOTS[i % BREAK_SPOTS.length]
            x = bp.x; y = bp.y; bubble = '☕'
          }
          return { ...agent, x, y, mode, bubble }
        })
      )
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [agents.length])

  const selData = selectedAgent ? agents.find((a) => a.id === selectedAgent.id) : null

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">AI 픽셀 오피스</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {agents.length}명 근무 중
            {meetingActive && <span className="ml-2 text-purple-400 animate-pulse">● 회의 진행 중</span>}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {(['chairman','committee','ceo','chief','team_lead'] as const).map((lv) => (
            <div key={lv} className="flex items-center gap-1">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: LEVEL_COLOR[lv] }} />
              <span className="text-[9px] text-slate-500 font-mono">{LEVEL_KO[lv]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas + characters */}
      <div className="card overflow-hidden p-0">
        <div style={{ overflowX: 'auto' }}>
          <div style={{ position: 'relative', width: CW, height: CH }}>
            <canvas
              ref={canvasRef} width={CW} height={CH}
              style={{ display: 'block', imageRendering: 'pixelated' }}
            />
            {agents.map((agent) => (
              <PixelChar
                key={agent.id}
                charIdx={agent.charIdx} name={agent.name} level={agent.level}
                x={agent.x} y={agent.y} mode={agent.mode} bubble={agent.bubble}
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
                <div style={{ color: '#555', fontSize: 13, fontFamily: 'monospace' }}>조직원이 없습니다</div>
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
                <div className="text-[10px] text-slate-500 font-mono">{LEVEL_KO[selData.level] || selData.level}</div>
              </div>
            </div>
            <button onClick={() => setSelectedAgent(null)} className="text-slate-600 hover:text-slate-300 text-xs px-2">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-bg-elevated rounded-lg px-3 py-2">
              <div className="text-[9px] text-slate-500 mb-1">AI 프로바이더</div>
              <div className="text-xs font-mono text-brand-light">{selData.ai_provider}</div>
            </div>
            <div className="bg-bg-elevated rounded-lg px-3 py-2">
              <div className="text-[9px] text-slate-500 mb-1">AI 모델</div>
              <div className="text-xs font-mono text-emerald-400 truncate">{selData.ai_model}</div>
            </div>
            <div className="bg-bg-elevated rounded-lg px-3 py-2">
              <div className="text-[9px] text-slate-500 mb-1">현재 상태</div>
              <div className="text-xs">
                {selData.mode === 'meeting' ? '🟣 회의 중'
                  : selData.mode === 'working' ? '🟢 작업 중'
                  : selData.mode === 'thinking' ? '🔵 분석 중'
                  : selData.mode === 'coffee' ? '☕ 휴식' : '⚪ 대기'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Agent cards */}
      {agents.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {agents.map((a) => (
            <div
              key={a.id}
              onClick={() => setSelectedAgent((p) => p?.id === a.id ? null : a)}
              className="bg-bg-elevated rounded-lg px-3 py-2 flex items-center gap-2 cursor-pointer hover:bg-bg-card transition-colors"
              style={{ borderLeft: `3px solid ${LEVEL_COLOR[a.level] || '#555'}` }}
            >
              <div style={{ fontSize: 13, flexShrink: 0 }}>{LEVEL_EMOJI[a.level] || '🤖'}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-medium text-slate-300 truncate">{a.name}</div>
                <div className="text-[9px] text-slate-600 font-mono truncate">
                  {a.ai_provider}/{a.ai_model !== '—' ? a.ai_model : '미지정'}
                </div>
                <div className="text-[9px] mt-0.5">
                  {a.mode === 'meeting' ? '🟣' : a.mode === 'working' ? '🟢'
                    : a.mode === 'thinking' ? '🔵' : a.mode === 'coffee' ? '☕' : '⚪'}
                  <span className="text-slate-600 ml-1">
                    {a.mode === 'meeting' ? '회의' : a.mode === 'working' ? '작업'
                      : a.mode === 'thinking' ? '분석' : a.mode === 'coffee' ? '휴식' : '대기'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes selPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
