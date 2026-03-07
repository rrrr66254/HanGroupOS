import { useEffect, useRef, useState } from 'react'
import { Plus, Send, Trash2, Zap, MessageSquare, ChevronRight } from 'lucide-react'
import { chatApi, orgApi } from '../api/client'
import type { ChatSession, ChatMessage } from '../types'
import { format } from 'date-fns'

interface OrgNode {
  id: number
  name: string
  role: string
  level: string
  description: string
  company_id: number | null
}

const LEVEL_COLORS: Record<string, string> = {
  chairman: '#e24c4b',
  committee: '#9b59b6',
  ceo: '#3498db',
  chief: '#27ae60',
  team_lead: '#f39c12',
  specialist: '#7f8c8d',
}
const LEVEL_LABELS: Record<string, string> = {
  chairman: '회장',
  committee: '위원회',
  ceo: 'CEO',
  chief: 'Chief',
  team_lead: '팀장',
  specialist: '스페셜리스트',
}
const LEVEL_EMOJI: Record<string, string> = {
  chairman: '👔',
  committee: '📊',
  ceo: '💼',
  chief: '⚡',
  team_lead: '🎯',
  specialist: '🔧',
}

const SESSION_TYPE_MAP: Record<string, string> = {
  chairman: 'chairman',
  committee: 'committee',
  ceo: 'ceo',
  chief: 'ceo',
  team_lead: 'ceo',
  specialist: 'general',
}

const QUICK_PROMPTS: Record<string, string[]> = {
  chairman: ['현재 그룹 전략을 분석해줘', 'AI 계열사 설립 방향을 제안해줘', '수출입 데이터 사업 검토해줘', '우선순위 투자 분야를 알려줘'],
  committee: ['시장 분석 결과를 알려줘', '투자 심사 기준을 설명해줘', '데이터 거버넌스 현황을 알려줘'],
  ceo: ['팀 운영 현황을 알려줘', 'Q2 목표를 설정해줘', '경쟁사 분석을 해줘'],
  general: ['현재 상태를 알려줘', '지원이 필요한 사항을 말해줘'],
}

export default function Chairman() {
  const [agents, setAgents] = useState<OrgNode[]>([])
  const [selectedAgent, setSelectedAgent] = useState<OrgNode | null>(null)
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load all group-level org nodes (no company_id)
  useEffect(() => {
    orgApi.nodes().then((r) => {
      const nodes = (r.data as OrgNode[]).filter((n) => n.company_id === null)
      setAgents(nodes)
      if (nodes.length > 0) selectAgent(nodes[0])
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectAgent = async (agent: OrgNode) => {
    setSelectedAgent(agent)
    setActiveSession(null)
    setMessages([])
    // Load sessions for this agent
    const sessionType = SESSION_TYPE_MAP[agent.level] || 'general'
    const res = await chatApi.sessions(sessionType)
    // Filter sessions by agent name stored in title
    const agentSessions = (res.data as ChatSession[]).filter(
      (s) => s.agent_name === agent.name || s.title.startsWith(agent.name)
    )
    setSessions(agentSessions)
    if (agentSessions.length > 0) loadSession(agentSessions[0])
  }

  const loadSession = async (session: ChatSession) => {
    setActiveSession(session)
    const res = await chatApi.messages(session.id)
    setMessages(res.data)
  }

  const newSession = async () => {
    if (!selectedAgent) return
    const sessionType = SESSION_TYPE_MAP[selectedAgent.level] || 'general'
    const res = await chatApi.createSession({
      session_type: sessionType,
      title: `${selectedAgent.name} ${new Date().toLocaleTimeString('ko-KR')}`,
      agent_name: selectedAgent.name,
    })
    const session = res.data as ChatSession
    setSessions((prev) => [session, ...prev])
    setActiveSession(session)
    setMessages([])
  }

  const deleteSession = async (id: number) => {
    await chatApi.deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (activeSession?.id === id) {
      setActiveSession(null)
      setMessages([])
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || !activeSession || loading) return
    const content = input.trim()
    setInput('')
    setLoading(true)

    const tempUser: ChatMessage = {
      id: Date.now(),
      session_id: activeSession.id,
      role: 'user',
      content,
      sender_name: 'You',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUser])

    try {
      const res = await chatApi.send({ session_id: activeSession.id, content })
      const aiMsg = res.data
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUser.id), tempUser, aiMsg])
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempUser.id))
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const agentColor = selectedAgent ? (LEVEL_COLORS[selectedAgent.level] || '#64748b') : '#64748b'
  const prompts = selectedAgent
    ? (QUICK_PROMPTS[selectedAgent.level] || QUICK_PROMPTS.general)
    : []

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-3 animate-fade-in">
      {/* Column 1: Agent list */}
      <div className="w-44 flex-shrink-0 flex flex-col gap-2">
        <div className="text-[10px] text-slate-500 uppercase tracking-widest px-1 font-mono mb-1">AI 구성원</div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {agents.map((agent) => (
            <div
              key={agent.id}
              onClick={() => selectAgent(agent)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all text-xs ${
                selectedAgent?.id === agent.id
                  ? 'bg-bg-elevated border border-bg-border text-slate-100'
                  : 'hover:bg-bg-elevated text-slate-500 hover:text-slate-300'
              }`}
            >
              <div
                style={{ width: 24, height: 24, background: LEVEL_COLORS[agent.level] || '#555', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                {LEVEL_EMOJI[agent.level] || '🤖'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{agent.name}</div>
                <div className="text-[9px] text-slate-600 truncate">{LEVEL_LABELS[agent.level] || agent.level}</div>
                {agent.ai_model && (
                  <div className="text-[8px] font-mono truncate mt-0.5"
                    style={{ color: LEVEL_COLORS[agent.level] ? `${LEVEL_COLORS[agent.level]}cc` : '#6b7280' }}>
                    {agent.ai_model}
                  </div>
                )}
              </div>
              {selectedAgent?.id === agent.id && <ChevronRight size={10} className="ml-auto flex-shrink-0 text-slate-400" />}
            </div>
          ))}
        </div>
      </div>

      {/* Column 2: Sessions list */}
      <div className="w-48 flex-shrink-0 flex flex-col gap-2">
        <button
          onClick={newSession}
          disabled={!selectedAgent}
          className="btn-primary flex items-center gap-2 w-full justify-center py-2 text-xs disabled:opacity-40"
        >
          <Plus size={13} />
          새 대화
        </button>

        <div className="flex-1 overflow-y-auto space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs ${
                activeSession?.id === s.id
                  ? 'bg-brand/15 text-brand-light'
                  : 'hover:bg-bg-elevated text-slate-400'
              }`}
              onClick={() => loadSession(s)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare size={11} className="flex-shrink-0" />
                <span className="truncate">{s.title}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-danger ml-1 flex-shrink-0"
              >
                <Trash2 size={10} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && selectedAgent && (
            <div className="text-[10px] text-slate-600 text-center py-4 px-2">
              새 대화를 시작하세요
            </div>
          )}
        </div>
      </div>

      {/* Column 3: Chat area */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-border">
          {selectedAgent ? (
            <>
              <div
                style={{ width: 32, height: 32, background: agentColor, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}
              >
                {LEVEL_EMOJI[selectedAgent.level] || '🤖'}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100">{selectedAgent.name}</div>
                <div className="text-[10px] flex items-center gap-1" style={{ color: agentColor }}>
                  <div className="w-1.5 h-1.5 rounded-full blink" style={{ background: agentColor }} />
                  {LEVEL_LABELS[selectedAgent.level] || selectedAgent.level}
                  {selectedAgent.description && (
                    <span className="text-slate-600 ml-1">· {selectedAgent.description}</span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="w-8 h-8 bg-brand/20 rounded-lg flex items-center justify-center">
                <Zap size={14} className="text-brand-light" />
              </div>
              <div className="text-sm text-slate-500">AI 구성원을 선택하세요</div>
            </>
          )}
          {activeSession && (
            <div className="ml-auto text-[10px] text-slate-700 font-mono">#{activeSession.id}</div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeSession && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <div style={{ fontSize: 40 }}>
                {selectedAgent ? (LEVEL_EMOJI[selectedAgent.level] || '🤖') : '🏢'}
              </div>
              <p className="text-sm">
                {selectedAgent
                  ? `${selectedAgent.name}과 대화를 시작하세요`
                  : '왼쪽에서 AI 구성원을 선택하세요'}
              </p>
              {selectedAgent && (
                <button onClick={newSession} className="btn-primary text-xs">
                  대화 시작
                </button>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold`}
                style={{
                  background: msg.role === 'user' ? '#334155' : agentColor,
                  color: 'white',
                  fontSize: msg.role === 'user' ? 10 : 14,
                }}
              >
                {msg.role === 'user' ? 'U' : (LEVEL_EMOJI[selectedAgent?.level || ''] || '🤖')}
              </div>
              <div className={`max-w-[75%] space-y-1 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
                <div className="text-[10px] text-slate-600">
                  {msg.sender_name} · {format(new Date(msg.created_at), 'HH:mm')}
                </div>
                <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{msg.content}</pre>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                style={{ background: agentColor }}
              >
                {LEVEL_EMOJI[selectedAgent?.level || ''] || '🤖'}
              </div>
              <div className="chat-ai flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompts */}
        {activeSession && messages.length === 0 && (
          <div className="px-4 pb-2 flex gap-2 flex-wrap">
            {prompts.map((p) => (
              <button
                key={p}
                className="text-xs px-3 py-1.5 rounded-full bg-bg-elevated text-slate-400 hover:text-slate-200 hover:bg-brand/10 border border-transparent hover:border-brand/30 transition-all"
                onClick={() => setInput(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-bg-border">
          <div className="flex gap-2">
            <textarea
              className="input resize-none"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                selectedAgent
                  ? `${selectedAgent.name}에게 메시지를 보내세요… (Enter로 전송)`
                  : 'AI 구성원을 먼저 선택하세요'
              }
              disabled={!activeSession || loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !activeSession || loading}
              className="btn-primary px-3 flex-shrink-0 flex items-center gap-1"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
