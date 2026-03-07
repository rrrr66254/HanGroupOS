import { useEffect, useState, useRef } from 'react'
import { meetingsApi, orgApi } from '../api/client'

// ── Constants ──────────────────────────────────────────────────────────────
const CELL = 48       // grid cell size px
const COLS = 18
const ROWS = 12
const TICK_MS = 3500  // state update interval

const LEVEL_COLORS: Record<string, string> = {
  chairman: '#e24c4b',
  committee: '#9b59b6',
  ceo: '#3498db',
  chief: '#27ae60',
  team_lead: '#f39c12',
  specialist: '#7f8c8d',
}
const LEVEL_EMOJI: Record<string, string> = {
  chairman: '👔',
  committee: '📊',
  ceo: '💼',
  chief: '⚡',
  team_lead: '🎯',
  specialist: '🔧',
}

// Office zones (grid coords)
const MEETING_ZONE = { x: 1, y: 1, w: 7, h: 4 }
const COFFEE_ZONE = { x: 14, y: 1, w: 3, h: 3 }

const ACTIVITIES: Record<string, string[]> = {
  chairman: ['전략 검토 중…', '보고서 분석 중…', '의사결정 준비…', '데이터 검토…'],
  committee: ['시장 분석 중…', '투자 심사 중…', '거버넌스 확인…', '리포트 작성…'],
  ceo: ['팀 관리 중…', '로드맵 수립…', 'KPI 분석 중…', '운영 최적화…'],
  general: ['작업 처리 중…', '분석 중…', '검토 중…', '대기 중…'],
}
const MEETING_MSGS = [
  '전략 방향을 논의합니다.',
  '시장 진입 시나리오를 검토합니다.',
  '리소스 배분 안건입니다.',
  '분기 목표를 조율합니다.',
  '리스크 평가를 공유합니다.',
]

type AgentMode = 'idle' | 'working' | 'thinking' | 'meeting' | 'coffee'

interface PixelAgent {
  id: number
  name: string
  level: string
  emoji: string
  color: string
  x: number
  y: number
  mode: AgentMode
  activity: string
  bubble: string
  deskX: number
  deskY: number
}

// ── Pixel character component ──────────────────────────────────────────────
function PixelChar({ agent }: { agent: PixelAgent }) {
  const isMeeting = agent.mode === 'meeting'
  const isWorking = agent.mode === 'working'
  const isThinking = agent.mode === 'thinking'

  return (
    <div
      style={{
        position: 'absolute',
        left: agent.x,
        top: agent.y,
        transition: 'left 1.8s cubic-bezier(0.4,0,0.2,1), top 1.8s cubic-bezier(0.4,0,0.2,1)',
        zIndex: isMeeting ? 20 : 5,
        width: 44,
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      {/* Speech bubble */}
      {agent.bubble && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(15,15,30,0.97)',
          border: `1px solid ${agent.color}55`,
          borderRadius: 3,
          padding: '2px 7px',
          fontSize: 9,
          color: '#ccc',
          whiteSpace: 'nowrap',
          marginBottom: 5,
          maxWidth: 130,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontFamily: 'monospace',
          letterSpacing: 0,
        }}>
          {agent.bubble}
          <div style={{
            position: 'absolute',
            bottom: -4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: `4px solid ${agent.color}55`,
          }} />
        </div>
      )}

      {/* Character head */}
      <div style={{
        width: 32,
        height: 32,
        margin: '0 auto',
        background: agent.color,
        border: `2px solid ${agent.color}cc`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 16,
        imageRendering: 'pixelated',
        boxShadow: isWorking
          ? `0 0 14px ${agent.color}88, 0 0 4px ${agent.color}`
          : isMeeting
          ? `0 0 10px ${agent.color}66`
          : 'none',
        animation: isThinking
          ? 'charPulse 1.4s ease-in-out infinite'
          : agent.mode === 'idle'
          ? 'charBob 2.2s ease-in-out infinite'
          : 'none',
      }}>
        {agent.emoji}
      </div>

      {/* Body */}
      <div style={{
        width: 24,
        height: 10,
        background: agent.color,
        opacity: 0.55,
        margin: '2px auto 0',
        borderRadius: '0 0 3px 3px',
      }} />

      {/* Name tag */}
      <div style={{
        fontSize: 8,
        color: '#94a3b8',
        marginTop: 3,
        fontFamily: 'monospace',
        lineHeight: 1.2,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {agent.name.length > 6 ? agent.name.slice(0, 6) + '…' : agent.name}
      </div>
    </div>
  )
}

// ── Meeting room label ─────────────────────────────────────────────────────
function MeetingRoom({ active, msg }: { active: boolean; msg: string }) {
  return (
    <div style={{
      position: 'absolute',
      left: MEETING_ZONE.x * CELL,
      top: MEETING_ZONE.y * CELL,
      width: MEETING_ZONE.w * CELL,
      height: MEETING_ZONE.h * CELL,
      border: active ? '2px solid #9b59b6' : '1px dashed #333',
      borderRadius: 4,
      background: active ? 'rgba(155,89,182,0.08)' : 'rgba(255,255,255,0.01)',
      transition: 'all 0.8s ease',
      boxShadow: active ? '0 0 24px rgba(155,89,182,0.25) inset' : 'none',
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute',
        top: 6,
        left: 10,
        fontSize: 9,
        color: active ? '#9b59b6' : '#444',
        fontFamily: 'monospace',
        letterSpacing: 1,
        textTransform: 'uppercase',
        transition: 'color 0.5s',
      }}>
        {active ? '● 회의 진행 중' : '회의실'}
      </div>

      {/* Meeting table */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -30%)',
        width: 100,
        height: 44,
        background: active ? 'rgba(155,89,182,0.2)' : 'rgba(255,255,255,0.04)',
        border: '1px solid #333',
        borderRadius: 22,
        transition: 'all 0.5s',
      }} />

      {/* Meeting message */}
      {active && msg && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontSize: 9,
          color: '#c4a0e8',
          fontFamily: 'monospace',
          padding: '0 8px',
        }}>
          "{msg}"
        </div>
      )}
    </div>
  )
}

// ── Coffee zone ─────────────────────────────────────────────────────────────
function CoffeeZone() {
  return (
    <div style={{
      position: 'absolute',
      left: COFFEE_ZONE.x * CELL,
      top: COFFEE_ZONE.y * CELL,
      width: COFFEE_ZONE.w * CELL,
      height: COFFEE_ZONE.h * CELL,
      border: '1px dashed #2a2a3a',
      borderRadius: 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 2,
      pointerEvents: 'none',
    }}>
      <div style={{ fontSize: 18 }}>☕</div>
      <div style={{ fontSize: 8, color: '#444', fontFamily: 'monospace' }}>휴식</div>
    </div>
  )
}

// ── Floor tile grid ─────────────────────────────────────────────────────────
function FloorGrid() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundImage: `
        linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)
      `,
      backgroundSize: `${CELL}px ${CELL}px`,
      pointerEvents: 'none',
    }} />
  )
}

// ── Desk ───────────────────────────────────────────────────────────────────
function Desk({ x, y, active }: { x: number; y: number; active: boolean }) {
  return (
    <div style={{
      position: 'absolute',
      left: x * CELL + 4,
      top: y * CELL + 14,
      width: CELL - 8,
      height: CELL * 0.6,
      background: active ? 'rgba(52,152,219,0.12)' : 'rgba(255,255,255,0.04)',
      border: active ? '1px solid rgba(52,152,219,0.3)' : '1px solid #2a2a3a',
      borderRadius: 3,
      transition: 'all 0.5s',
      pointerEvents: 'none',
    }} />
  )
}

// ── Main component ──────────────────────────────────────────────────────────
export default function LiveOffice() {
  const [agents, setAgents] = useState<PixelAgent[]>([])
  const [meetingActive, setMeetingActive] = useState(false)
  const [meetingMsg, setMeetingMsg] = useState('')
  const [tick, setTick] = useState(0)
  const tickRef = useRef(0)

  // Load org nodes once
  useEffect(() => {
    orgApi.nodes().then((res) => {
      const nodes = res.data as { id: number; name: string; level: string }[]
      // Assign desk positions row by row
      const deskPositions = buildDeskPositions(nodes.length)
      const built: PixelAgent[] = nodes.map((n, i) => {
        const dp = deskPositions[i] || { col: (i % 8) + 2, row: 7 }
        const px = dp.col * CELL
        const py = dp.row * CELL - 36  // character sits above desk
        return {
          id: n.id,
          name: n.name,
          level: n.level,
          emoji: LEVEL_EMOJI[n.level] || '🤖',
          color: LEVEL_COLORS[n.level] || '#7f8c8d',
          x: px,
          y: py,
          mode: 'idle',
          activity: '',
          bubble: '',
          deskX: dp.col,
          deskY: dp.row,
        }
      })
      setAgents(built)
    })
  }, [])

  // Check for open meetings
  useEffect(() => {
    const checkMeetings = () => {
      meetingsApi.list().then((res) => {
        const open = (res.data as { status: string }[]).some((m) => m.status === 'open')
        setMeetingActive(open)
        if (open) {
          setMeetingMsg(MEETING_MSGS[Math.floor(Math.random() * MEETING_MSGS.length)])
        }
      }).catch(() => {})
    }
    checkMeetings()
    const interval = setInterval(checkMeetings, 10000)
    return () => clearInterval(interval)
  }, [])

  // Animation tick - update agent states
  useEffect(() => {
    if (agents.length === 0) return

    const timer = setInterval(() => {
      tickRef.current += 1
      const t = tickRef.current
      setTick(t)

      setAgents((prev) =>
        prev.map((agent, i) => {
          // If meeting is active, some agents go to meeting room
          if (meetingActive && i < 4) {
            const meetingPositions = [
              { x: (MEETING_ZONE.x + 1) * CELL + 10, y: (MEETING_ZONE.y + 1) * CELL },
              { x: (MEETING_ZONE.x + 3) * CELL - 10, y: (MEETING_ZONE.y + 1) * CELL },
              { x: (MEETING_ZONE.x + 1) * CELL + 10, y: (MEETING_ZONE.y + 2) * CELL + 4 },
              { x: (MEETING_ZONE.x + 3) * CELL - 10, y: (MEETING_ZONE.y + 2) * CELL + 4 },
            ]
            const pos = meetingPositions[i]
            const actPool = ACTIVITIES[agent.level] || ACTIVITIES.general
            return {
              ...agent,
              x: pos.x,
              y: pos.y,
              mode: 'meeting',
              bubble: t % 3 === i % 3 ? MEETING_MSGS[t % MEETING_MSGS.length] : '',
            }
          }

          // Normal desk work with occasional coffee break
          const cycle = (t + i * 3) % 12
          let mode: AgentMode = 'idle'
          let bubble = ''

          if (cycle < 5) {
            mode = 'working'
            const pool = ACTIVITIES[agent.level] || ACTIVITIES.general
            bubble = pool[(t + i) % pool.length]
          } else if (cycle < 8) {
            mode = 'thinking'
            bubble = '...'
          } else if (cycle === 9 && i % 3 === 0) {
            mode = 'coffee'
          }

          // Coffee break position
          const deskX = agent.deskX * CELL
          const deskY = agent.deskY * CELL - 36
          let x = deskX
          let y = deskY
          if (mode === 'coffee') {
            x = (COFFEE_ZONE.x + 1) * CELL
            y = (COFFEE_ZONE.y + 0.5) * CELL
          }

          return { ...agent, x, y, mode, bubble }
        })
      )
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [agents.length, meetingActive])

  const W = COLS * CELL
  const H = ROWS * CELL

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">AI 픽셀 오피스</h2>
          <p className="text-[10px] text-slate-600 mt-0.5">
            {agents.length}명의 AI가 실시간으로 근무 중입니다
            {meetingActive && (
              <span className="ml-2 text-purple-400 animate-pulse">● 회의 진행 중</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {Object.entries(LEVEL_COLORS).slice(0, 4).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1">
              <div style={{ width: 8, height: 8, background: color, borderRadius: 2 }} />
              <span className="text-[9px] text-slate-500 font-mono">
                {level === 'chairman' ? '회장' : level === 'committee' ? '위원회' : level === 'ceo' ? 'CEO' : level}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Office canvas */}
      <div
        className="card overflow-hidden"
        style={{ width: '100%', overflowX: 'auto' }}
      >
        <div
          style={{
            position: 'relative',
            width: W,
            height: H,
            background: 'linear-gradient(135deg, #0d0d1a 0%, #0a0a14 100%)',
            imageRendering: 'pixelated',
            minWidth: W,
          }}
        >
          <FloorGrid />

          {/* Zones */}
          <MeetingRoom active={meetingActive} msg={meetingMsg} />
          <CoffeeZone />

          {/* Desks */}
          {agents.map((a) => (
            <Desk key={a.id} x={a.deskX} y={a.deskY} active={a.mode === 'working' || a.mode === 'thinking'} />
          ))}

          {/* Characters */}
          {agents.map((a) => (
            <PixelChar key={a.id} agent={a} />
          ))}

          {/* Empty state */}
          {agents.length === 0 && (
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}>
              <div style={{ fontSize: 32 }}>🏢</div>
              <div style={{ color: '#444', fontSize: 12, fontFamily: 'monospace' }}>
                조직원이 없습니다
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agent status list */}
      {agents.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {agents.map((a) => (
            <div
              key={a.id}
              className="bg-bg-elevated rounded-lg px-3 py-2 flex items-center gap-2"
            >
              <div
                style={{
                  width: 20,
                  height: 20,
                  background: a.color,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  flexShrink: 0,
                }}
              >
                {a.emoji}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-medium text-slate-300 truncate">{a.name}</div>
                <div className="text-[9px] text-slate-600 font-mono truncate">
                  {a.mode === 'meeting' ? '🟣 회의 중' :
                   a.mode === 'working' ? '🟢 작업 중' :
                   a.mode === 'thinking' ? '🔵 분석 중' :
                   a.mode === 'coffee' ? '☕ 휴식' : '⚪ 대기'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes charBob {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
        }
        @keyframes charPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(0.95); }
        }
      `}</style>
    </div>
  )
}

function buildDeskPositions(count: number): { col: number; row: number }[] {
  const positions: { col: number; row: number }[] = []
  const rowConfigs = [
    { row: 7, startCol: 2, maxCount: 8 },
    { row: 9, startCol: 2, maxCount: 8 },
    { row: 11, startCol: 2, maxCount: 8 },
  ]
  let idx = 0
  for (const cfg of rowConfigs) {
    for (let c = 0; c < cfg.maxCount && idx < count; c++, idx++) {
      positions.push({ col: cfg.startCol + c * 2, row: cfg.row })
    }
  }
  return positions
}
