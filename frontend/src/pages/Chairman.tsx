import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Loader2, ArrowRight, CheckCircle, Building2,
  Eye, X, Plus, ChevronRight,
} from 'lucide-react'
import { chatApi, orgApi, companiesApi } from '../api/client'
import type { ChatSession, ChatMessage } from '../types'
import { format } from 'date-fns'

interface OrgNode {
  id: number
  name: string
  role: string
  level: string
  description: string
  company_id: number | null
  ai_provider?: string
  ai_model?: string
}

interface Company {
  id: number
  name: string
  industry: string
  description: string
  status: string
  vision?: string
}

interface PreviewCompany {
  name: string
  industry: string
  description: string
  vision: string
}

interface DelegationStep {
  from: string
  to: string
  message: string
  status: 'pending' | 'active' | 'done'
}

type PanelMode = 'companies' | 'delegation' | 'preview'

const QUICK_PROMPTS = [
  '현재 계열사 현황을 보고해줘',
  'AI 소프트웨어 회사 설립해줘',
  '데이터 분석 회사 만들어줘',
  '그룹 전략 방향을 분석해줘',
  '미디어 계열사를 설립해줘',
]

// Parse created company from AI response
function parseCreatedCompany(text: string): { id: number; name: string } | null {
  const m = text.match(/계열사 설립 완료[^—]*—\s*(.+?)\s*\(ID #(\d+)\)/)
  if (m) return { name: m[1].trim(), id: parseInt(m[2]) }
  return null
}

// Detect if a company is being queried
function detectCompanyQuery(text: string, companies: Company[]): Company | null {
  for (const c of companies) {
    if (text.includes(c.name)) return c
  }
  return null
}

export default function Chairman() {
  const navigate = useNavigate()
  const [chairman, setChairman] = useState<OrgNode | null>(null)
  const [session, setSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [panelMode, setPanelMode] = useState<PanelMode>('companies')
  const [delegationSteps, setDelegationSteps] = useState<DelegationStep[]>([])
  const [newCompanyId, setNewCompanyId] = useState<number | null>(null)
  const [previewCompany, setPreviewCompany] = useState<PreviewCompany | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const delegTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    orgApi.nodes().then((r) => {
      const nodes = (r.data as OrgNode[]).filter((n) => n.company_id === null)
      const ch = nodes.find((n) => n.level === 'chairman') || nodes[0]
      setChairman(ch)
      if (ch) initSession(ch)
    })
    loadCompanies()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Cleanup delegation timer on unmount
  useEffect(() => () => { if (delegTimerRef.current) clearInterval(delegTimerRef.current) }, [])

  const loadCompanies = () => {
    companiesApi.list().then((r) => setCompanies(r.data as Company[]))
  }

  const initSession = async (ch: OrgNode) => {
    const res = await chatApi.sessions('chairman')
    const existing = (res.data as ChatSession[]).filter(
      (s) => s.agent_name === ch.name || s.title.includes('커맨드센터')
    )
    if (existing.length > 0) {
      setSession(existing[0])
      const msgs = await chatApi.messages(existing[0].id)
      setMessages(msgs.data)
    } else {
      const newS = await chatApi.createSession({
        session_type: 'chairman',
        title: '한그룹 커맨드센터',
        agent_name: ch.name,
      })
      setSession(newS.data as ChatSession)
      setMessages([])
    }
  }

  const newSession = async () => {
    if (!chairman) return
    const newS = await chatApi.createSession({
      session_type: 'chairman',
      title: `커맨드센터 ${new Date().toLocaleTimeString('ko-KR')}`,
      agent_name: chairman.name,
    })
    setSession(newS.data as ChatSession)
    setMessages([])
    setNewCompanyId(null)
  }

  const sendMessage = async () => {
    if (!input.trim() || !session || loading) return
    const content = input.trim()
    setInput('')
    setLoading(true)

    const tempUser: ChatMessage = {
      id: Date.now(),
      session_id: session.id,
      role: 'user',
      content,
      sender_name: '지시',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUser])

    // Detect if querying a specific company (and not creating one)
    const queriedCompany = detectCompanyQuery(content, companies)
    const isCreation = ['만들', '설립', '창설', '시작'].some((kw) => content.includes(kw))

    if (queriedCompany && !isCreation) {
      // Use company-query endpoint for delegation chain
      showDelegation(queriedCompany, content)
      try {
        const res = await chatApi.companyQuery(queriedCompany.id, content)
        const data = res.data as { answer: string; ceo_name: string; delegation: DelegationStep[] }
        // Mark all delegation steps as done
        setDelegationSteps(data.delegation.map((s) => ({ ...s, status: 'done' as const })))
        // Inject AI answer as message
        const syntheticMsg: ChatMessage = {
          id: Date.now() + 1,
          session_id: session.id,
          role: 'assistant',
          content: `[${data.ceo_name} 보고]\n\n${data.answer}`,
          sender_name: data.ceo_name,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUser.id),
          tempUser,
          syntheticMsg,
        ])
      } catch {
        // Fallback to normal send
        try {
          const res = await chatApi.send({ session_id: session.id, content })
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== tempUser.id),
            tempUser,
            res.data as ChatMessage,
          ])
        } catch {
          setMessages((prev) => prev.filter((m) => m.id !== tempUser.id))
        }
      }
    } else {
      try {
        const res = await chatApi.send({ session_id: session.id, content })
        const aiMsg = res.data as ChatMessage
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== tempUser.id),
          tempUser,
          aiMsg,
        ])

        // Check if company was created
        const created = parseCreatedCompany(aiMsg.content)
        if (created) {
          setNewCompanyId(created.id)
          loadCompanies()
          setPanelMode('companies')
          if (delegTimerRef.current) clearInterval(delegTimerRef.current)
        }
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempUser.id))
      }
    }

  }

  const showDelegation = (company: Company, question: string) => {
    if (delegTimerRef.current) clearInterval(delegTimerRef.current)
    const steps: DelegationStep[] = [
      { from: '회장', to: `${company.name} CEO`, message: `"${question.slice(0, 24)}…" 확인 요청`, status: 'active' },
      { from: `${company.name} CEO`, to: '운영팀장', message: '데이터 수집 지시', status: 'pending' },
      { from: '운영팀장', to: `${company.name} CEO`, message: '현황 보고', status: 'pending' },
      { from: `${company.name} CEO`, to: '회장', message: '최종 보고 완료', status: 'pending' },
    ]
    setDelegationSteps(steps)
    setPanelMode('delegation')

    let i = 1
    delegTimerRef.current = setInterval(() => {
      setDelegationSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx < i ? 'done' : idx === i ? 'active' : 'pending',
        }))
      )
      i++
      if (i >= steps.length) {
        if (delegTimerRef.current) clearInterval(delegTimerRef.current)
      }
    }, 1400)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] animate-fade-in overflow-hidden">
      {/* ── Main Chat ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-bg-border flex-shrink-0">
          <div
            style={{
              width: 38, height: 38, background: '#e24c4b', borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
            }}
          >
            👔
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100">
              {chairman?.name || 'AI 회장'} · 커맨드센터
            </div>
            <div className="text-[10px] flex items-center gap-1.5 text-red-400">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 blink" />
              한그룹 최고 의사결정권자
              {chairman?.ai_model && (
                <span className="text-slate-600 font-mono ml-1">{chairman.ai_model}</span>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {newCompanyId && (
              <button
                onClick={() => navigate('/live-office')}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{
                  background: 'rgba(16,185,129,0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16,185,129,0.3)',
                  animation: 'pulse 2s infinite',
                }}
              >
                <CheckCircle size={12} />
                AI 오피스 보기
              </button>
            )}
            <button
              onClick={newSession}
              className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-slate-500 hover:text-slate-300 bg-bg-elevated border border-bg-border"
            >
              <Plus size={12} />
              새 대화
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center h-full gap-5 text-slate-600">
              <div style={{ fontSize: 60 }}>👔</div>
              <div className="text-center space-y-1">
                <div className="text-base font-semibold text-slate-300">한그룹 AI 회장님</div>
                <div className="text-xs text-slate-600 max-w-xs leading-relaxed">
                  회사 설립, 전략 수립, 현황 조회 등<br />대화만으로 모든 지시를 내릴 수 있습니다
                </div>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(p)}
                    className="text-xs px-3 py-1.5 rounded-full bg-bg-elevated text-slate-400 hover:text-slate-200 hover:bg-brand/10 border border-transparent hover:border-brand/30 transition-all"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{
                  background: msg.role === 'user' ? '#334155' : '#e24c4b',
                  color: 'white',
                }}
              >
                {msg.role === 'user' ? '🫵' : '👔'}
              </div>
              <div
                className={`max-w-[72%] space-y-1 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="text-[10px] text-slate-600">
                  {msg.sender_name} · {format(new Date(msg.created_at), 'HH:mm')}
                </div>
                <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {msg.content}
                  </pre>
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0"
                style={{ background: '#e24c4b' }}
              >
                👔
              </div>
              <div className="chat-ai flex items-center gap-1.5 px-4 py-3">
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-bg-border flex-shrink-0">
          <div className="flex gap-2">
            <textarea
              className="input resize-none flex-1 text-sm"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="회장님께 지시사항을 입력하세요… (Enter 전송 / Shift+Enter 줄바꿈)"
              disabled={!session || loading}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || !session || loading}
              className="btn-primary px-4 flex-shrink-0 flex items-center gap-1.5"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Right Live Panel ──────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-l border-bg-border bg-bg-card overflow-hidden">
        {/* Panel tabs */}
        <div className="flex border-b border-bg-border flex-shrink-0">
          <button
            onClick={() => setPanelMode('companies')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${panelMode === 'companies' ? 'text-brand-light border-b-2 border-brand' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <Building2 size={11} />계열사
            </span>
          </button>
          <button
            onClick={() => setPanelMode('delegation')}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${panelMode === 'delegation' ? 'text-brand-light border-b-2 border-brand' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <ArrowRight size={11} />지시 체인
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {/* ── Companies panel ── */}
          {panelMode === 'companies' && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono px-1 mb-1">
                그룹 계열사 ({companies.length})
              </div>
              {companies.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-10 space-y-1">
                  <div>아직 계열사가 없습니다</div>
                  <div className="text-slate-700 text-[10px]">
                    회장님께 설립을 지시해보세요
                  </div>
                </div>
              ) : (
                companies.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate('/live-office')}
                    className={`rounded-lg px-3 py-2.5 border cursor-pointer transition-all hover:border-brand/30 ${
                      c.id === newCompanyId
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-bg-border bg-bg-elevated hover:bg-bg-border/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-200 truncate">{c.name}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{c.industry}</div>
                        {c.vision && (
                          <div className="text-[9px] text-slate-600 mt-1 truncate italic">
                            "{c.vision}"
                          </div>
                        )}
                      </div>
                      {c.id === newCompanyId ? (
                        <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight size={11} className="text-slate-600 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))
              )}

              {newCompanyId && (
                <button
                  onClick={() => navigate('/live-office')}
                  className="w-full mt-2 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                  style={{
                    background: 'rgba(16,185,129,0.1)',
                    color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.25)',
                  }}
                >
                  <Eye size={12} />
                  설립 현장 보기 → AI 오피스
                </button>
              )}
            </>
          )}

          {/* ── Delegation panel ── */}
          {panelMode === 'delegation' && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono px-1 mb-2">
                실시간 지시 체인
              </div>
              {delegationSteps.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-10 space-y-1">
                  <div>계열사 이름을 포함해 질문하면</div>
                  <div className="text-slate-700 text-[10px]">
                    지시 체인을 실시간으로 볼 수 있습니다
                  </div>
                </div>
              ) : (
                <div className="space-y-0.5">
                  {delegationSteps.map((step, i) => (
                    <div key={i}>
                      <div
                        className={`rounded-lg p-3 border transition-all ${
                          step.status === 'done'
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : step.status === 'active'
                            ? 'border-brand/40 bg-brand/5'
                            : 'border-bg-border bg-bg-elevated opacity-40'
                        }`}
                        style={step.status === 'active' ? { animation: 'pulse 1.5s infinite' } : {}}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[10px] text-slate-300 font-medium">{step.from}</span>
                          <ArrowRight size={9} className="text-slate-600 flex-shrink-0" />
                          <span className="text-[10px] text-slate-400">{step.to}</span>
                          <div className="ml-auto flex-shrink-0">
                            {step.status === 'done' && <CheckCircle size={10} className="text-emerald-400" />}
                            {step.status === 'active' && <Loader2 size={10} className="text-brand-light animate-spin" />}
                          </div>
                        </div>
                        <div className="text-[9px] text-slate-600 leading-relaxed">{step.message}</div>
                      </div>
                      {i < delegationSteps.length - 1 && (
                        <div
                          className="ml-4 w-px bg-bg-border"
                          style={{ height: 6 }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
