import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Send, Loader2, ArrowRight, CheckCircle, Building2,
  Eye, X, Plus, ChevronRight, WifiOff, Wifi, Settings,
  MessageSquare, Zap, AlertCircle, BarChart2, Users,
} from 'lucide-react'
import { chatApi, orgApi, companiesApi, modelsApi } from '../api/client'
import { useAuthStore } from '../store/useStore'
import type { ChatSession, ChatMessage } from '../types'
import { format } from 'date-fns'

interface OllamaStatus {
  base_url: string
  model: string
  reachable: boolean
  needs_setup: boolean
}

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

interface CompanyKPI {
  id: number
  name: string
  industry: string
  ai_messages: number
  org_nodes: number
  strategies: number
  ai_score: number
}

interface GroupKPI {
  companies: CompanyKPI[]
  totals: { total_companies: number; total_ai_messages: number; avg_ai_score: number }
}

type PanelMode = 'companies' | 'delegation' | 'preview' | 'kpi'

const QUICK_PROMPTS = [
  '현재 계열사 현황을 보고해줘',
  'AI 소프트웨어 회사 설립해줘',
  '데이터 분석 회사 만들어줘',
  '그룹 전략 방향을 분석해줘',
  '미디어 계열사를 설립해줘',
]

function parseCreatedCompany(text: string): { id: number; name: string } | null {
  const m = text.match(/계열사 설립 완료[^—]*—\s*(.+?)\s*\(ID #(\d+)\)/)
  if (m) return { name: m[1].trim(), id: parseInt(m[2]) }
  return null
}

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
  const [briefingAnswer, setBriefingAnswer] = useState<string | null>(null)
  const [newCompanyId, setNewCompanyId] = useState<number | null>(null)
  const [previewCompany, setPreviewCompany] = useState<PreviewCompany | null>(null)
  const [previewConfirming, setPreviewConfirming] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [ollamaChecking, setOllamaChecking] = useState(true)
  const [ollamaBannerDismissed, setOllamaBannerDismissed] = useState(false)

  // KPI state
  const [kpiData, setKpiData] = useState<GroupKPI | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)

  // CEO direct chat state
  const [ceoChatCompany, setCeoChatCompany] = useState<Company | null>(null)
  const [ceoChatSession, setCeoChatSession] = useState<ChatSession | null>(null)
  const [ceoChatMessages, setCeoChatMessages] = useState<ChatMessage[]>([])
  const [ceoChatInput, setCeoChatInput] = useState('')
  const [ceoChatLoading, setCeoChatLoading] = useState(false)
  const ceoChatEndRef = useRef<HTMLDivElement>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const delegTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkOllama = useCallback(async () => {
    setOllamaChecking(true)
    try {
      const res = await modelsApi.ollamaStatus()
      setOllamaStatus(res.data as OllamaStatus)
    } catch {
      // backend not ready yet
    } finally {
      setOllamaChecking(false)
    }
  }, [])

  useEffect(() => {
    checkOllama()
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

  useEffect(() => {
    ceoChatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ceoChatMessages])

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
    setPreviewCompany(null)
  }

  // ── Company preview confirm/cancel ────────────────────────────────────────
  const confirmCompany = async () => {
    if (!previewCompany) return
    setPreviewConfirming(true)
    try {
      const res = await chatApi.confirmCompany(previewCompany)
      const created = res.data as { id: number; name: string; industry: string }
      setNewCompanyId(created.id)
      setPreviewCompany(null)
      loadCompanies()

      // Start briefing animation
      const briefSteps: DelegationStep[] = [
        { from: '회장', to: `${created.name} CEO`, message: '설립 축하 및 전략 브리핑 전달 중…', status: 'active' },
        { from: `${created.name} CEO`, to: '경영팀', message: '전략 방향 수립 착수', status: 'pending' },
        { from: `${created.name} CEO`, to: '회장', message: '100일 계획 보고', status: 'pending' },
      ]
      setDelegationSteps(briefSteps)
      setBriefingAnswer(null)
      setPanelMode('delegation')

      const briefRes = await chatApi.briefCeo(created.id)
      const brief = briefRes.data as { ceo_name: string; answer: string; delegation: DelegationStep[] }

      setDelegationSteps(brief.delegation.map((s) => ({ ...s, status: 'done' as const })))
      setBriefingAnswer(brief.answer)

      // Add CEO briefing response to main chat as a synthetic message
      const syntheticMsg: ChatMessage = {
        id: Date.now(),
        session_id: session?.id ?? 0,
        role: 'assistant',
        content: `📋 [${brief.ceo_name} 초기 보고]\n\n${brief.answer}`,
        sender_name: brief.ceo_name,
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, syntheticMsg])
    } catch {
      // ignore
    } finally {
      setPreviewConfirming(false)
    }
  }

  const cancelPreview = () => {
    setPreviewCompany(null)
    setPanelMode('companies')
  }

  // ── Group KPI ─────────────────────────────────────────────────────────────
  const loadKpi = async () => {
    setKpiLoading(true)
    try {
      const res = await chatApi.groupKpi()
      setKpiData(res.data as GroupKPI)
    } catch { /* ignore */ } finally {
      setKpiLoading(false)
    }
  }

  // ── Collaboration ─────────────────────────────────────────────────────────
  const handleCollaboration = async (companyA: Company, companyB: Company, task: string) => {
    // Show delegation animation immediately
    if (delegTimerRef.current) clearInterval(delegTimerRef.current)
    setBriefingAnswer(null)
    const animSteps: DelegationStep[] = [
      { from: '회장', to: `${companyA.name} CEO`, message: `협업 과제 전달 중…`, status: 'active' },
      { from: `${companyA.name} CEO`, to: `${companyB.name} CEO`, message: '역할 및 제안 협의', status: 'pending' },
      { from: `${companyB.name} CEO`, to: `${companyA.name} CEO`, message: '보완 및 계획 수립', status: 'pending' },
      { from: `${companyA.name} CEO`, to: '회장', message: '공동 실행 계획 보고', status: 'pending' },
    ]
    setDelegationSteps(animSteps)
    setPanelMode('delegation')

    let step = 1
    delegTimerRef.current = setInterval(() => {
      setDelegationSteps((prev) =>
        prev.map((s, i) => ({ ...s, status: i < step ? 'done' : i === step ? 'active' : 'pending' }))
      )
      step++
      if (step >= animSteps.length && delegTimerRef.current) clearInterval(delegTimerRef.current)
    }, 2200)

    try {
      const res = await chatApi.collaborate(companyA.id, companyB.id, task)
      const data = res.data as {
        company_a: { name: string }
        company_b: { name: string }
        ceo_a_name: string
        ceo_b_name: string
        response_a: string
        response_b: string
        combined: string
        delegation: DelegationStep[]
      }

      if (delegTimerRef.current) clearInterval(delegTimerRef.current)
      setDelegationSteps(data.delegation.map((s) => ({ ...s, status: 'done' as const })))
      setBriefingAnswer(data.combined)

      const syntheticMsg: ChatMessage = {
        id: Date.now(),
        session_id: session?.id ?? 0,
        role: 'assistant',
        content: `🤝 [${data.company_a.name} × ${data.company_b.name} 협업 계획]\n\n${data.combined}`,
        sender_name: 'AI 협업 조정관',
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, syntheticMsg])
    } catch {
      if (delegTimerRef.current) clearInterval(delegTimerRef.current)
    }
  }

  // ── CEO direct chat ───────────────────────────────────────────────────────
  const openCeoChat = async (company: Company) => {
    setCeoChatCompany(company)
    setCeoChatMessages([])
    setCeoChatSession(null)
    try {
      const res = await chatApi.sessions('ceo')
      const sessions = res.data as ChatSession[]
      const existing = sessions.find((s) => s.company_id === company.id)
      if (existing) {
        setCeoChatSession(existing)
        const msgs = await chatApi.messages(existing.id)
        setCeoChatMessages(msgs.data)
      } else {
        const newS = await chatApi.createSession({
          session_type: 'ceo',
          title: `${company.name} CEO 대화`,
          company_id: company.id,
        })
        setCeoChatSession(newS.data as ChatSession)
      }
    } catch {
      // ignore
    }
  }

  const closeCeoChat = () => {
    setCeoChatCompany(null)
    setCeoChatSession(null)
    setCeoChatMessages([])
    setCeoChatInput('')
  }

  const sendCeoMessage = async () => {
    if (!ceoChatInput.trim() || !ceoChatSession || ceoChatLoading) return
    const content = ceoChatInput.trim()
    setCeoChatInput('')
    setCeoChatLoading(true)

    const userMsgId = Date.now()
    const tempUser: ChatMessage = {
      id: userMsgId,
      session_id: ceoChatSession.id,
      role: 'user',
      content,
      sender_name: '회장',
      created_at: new Date().toISOString(),
    }
    setCeoChatMessages((prev) => [...prev, tempUser])

    const streamMsgId = userMsgId + 1
    const streamMsg: ChatMessage = {
      id: streamMsgId,
      session_id: ceoChatSession.id,
      role: 'assistant',
      content: '',
      sender_name: ceoChatCompany ? `${ceoChatCompany.name} CEO` : 'CEO',
      created_at: new Date().toISOString(),
    }
    setCeoChatMessages((prev) => [...prev, streamMsg])

    try {
      const token = useAuthStore.getState().token
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: ceoChatSession.id, content }),
      })
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.chunk && !evt.done) {
              setCeoChatMessages((prev) =>
                prev.map((m) => m.id === streamMsgId ? { ...m, content: m.content + evt.chunk } : m)
              )
            }
            if (evt.done && evt.final_content !== undefined) {
              setCeoChatMessages((prev) =>
                prev.map((m) => m.id === streamMsgId ? { ...m, content: evt.final_content, id: evt.message_id ?? streamMsgId } : m)
              )
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setCeoChatMessages((prev) => prev.filter((m) => m.id !== streamMsgId))
    } finally {
      setCeoChatLoading(false)
    }
  }

  // ── Main chairman sendMessage ──────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || !session || loading) return
    const content = input.trim()
    setInput('')
    setLoading(true)

    const userMsgId = Date.now()
    const tempUser: ChatMessage = {
      id: userMsgId,
      session_id: session.id,
      role: 'user',
      content,
      sender_name: '지시',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, tempUser])

    // Collaboration path — two company names + collaboration keywords
    const collabKeywords = ['협력', '협업', '함께', '공동', '같이', '연합', '합작', '같이']
    const isCollab = collabKeywords.some((kw) => content.includes(kw))
    const mentionedCos = companies.filter((c) => content.includes(c.name))
    if (isCollab && mentionedCos.length >= 2) {
      await handleCollaboration(mentionedCos[0], mentionedCos[1], content)
      setLoading(false)
      return
    }

    // Company-query path (delegation chain)
    const queriedCompany = detectCompanyQuery(content, companies)
    const isCreation = ['만들', '설립', '창설', '시작'].some((kw) => content.includes(kw))

    if (queriedCompany && !isCreation) {
      showDelegation(queriedCompany, content)
      try {
        const res = await chatApi.companyQuery(queriedCompany.id, content)
        const data = res.data as { answer: string; ceo_name: string; delegation: DelegationStep[] }
        setDelegationSteps(data.delegation.map((s) => ({ ...s, status: 'done' as const })))
        const syntheticMsg: ChatMessage = {
          id: userMsgId + 1,
          session_id: session.id,
          role: 'assistant',
          content: `[${data.ceo_name} 보고]\n\n${data.answer}`,
          sender_name: data.ceo_name,
          created_at: new Date().toISOString(),
        }
        setMessages((prev) => [...prev.filter((m) => m.id !== userMsgId), tempUser, syntheticMsg])
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== userMsgId))
      }
      setLoading(false)
      return
    }

    // Streaming path
    const streamMsgId = userMsgId + 1
    const streamMsg: ChatMessage = {
      id: streamMsgId,
      session_id: session.id,
      role: 'assistant',
      content: '',
      sender_name: chairman?.name || 'AI 회장',
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, streamMsg])

    try {
      const token = useAuthStore.getState().token
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: session.id, content }),
      })
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))

            if (evt.chunk && !evt.done) {
              setMessages((prev) =>
                prev.map((m) => m.id === streamMsgId ? { ...m, content: m.content + evt.chunk } : m)
              )
            }

            if (evt.done) {
              if (evt.type === 'preview' && evt.company_data) {
                // Show preview card — don't execute yet
                setPreviewCompany(evt.company_data as PreviewCompany)
                setPanelMode('preview')
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamMsgId
                      ? { ...m, content: evt.final_content, id: evt.message_id ?? streamMsgId }
                      : m
                  )
                )
              } else if (evt.final_content !== undefined) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamMsgId
                      ? { ...m, content: evt.final_content, id: evt.message_id ?? streamMsgId }
                      : m
                  )
                )
                const created = parseCreatedCompany(evt.final_content)
                if (created) {
                  setNewCompanyId(created.id)
                  loadCompanies()
                  setPanelMode('companies')
                  if (delegTimerRef.current) clearInterval(delegTimerRef.current)
                }
              }
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== streamMsgId))
    } finally {
      setLoading(false)
    }
  }

  const showDelegation = (company: Company, question: string) => {
    if (delegTimerRef.current) clearInterval(delegTimerRef.current)
    setBriefingAnswer(null)
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const handleCeoKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCeoMessage() }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] animate-fade-in overflow-hidden">
      {/* ── Main Chat ────────────────────────────────────────────────────────── */}
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
            {!ollamaChecking && ollamaStatus && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-medium cursor-pointer"
                style={
                  ollamaStatus.reachable
                    ? { background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }
                    : { background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }
                }
                onClick={() => ollamaStatus.reachable ? checkOllama() : navigate('/admin')}
                title={ollamaStatus.reachable ? `Ollama 연결됨 (${ollamaStatus.base_url})` : 'Ollama 미연결 — 클릭하여 설정'}
              >
                {ollamaStatus.reachable ? <><Wifi size={10} />Ollama</> : <><WifiOff size={10} />Ollama 미연결</>}
              </div>
            )}
            {newCompanyId && (
              <button
                onClick={() => navigate('/live-office')}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                style={{
                  background: 'rgba(16,185,129,0.15)', color: '#34d399',
                  border: '1px solid rgba(16,185,129,0.3)', animation: 'pulse 2s infinite',
                }}
              >
                <CheckCircle size={12} />AI 오피스 보기
              </button>
            )}
            <button
              onClick={newSession}
              className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-slate-500 hover:text-slate-300 bg-bg-elevated border border-bg-border"
            >
              <Plus size={12} />새 대화
            </button>
          </div>
        </div>

        {/* Ollama connection banner */}
        {!ollamaChecking && ollamaStatus?.needs_setup && !ollamaBannerDismissed && (
          <div
            className="flex items-center gap-3 px-5 py-2.5 flex-shrink-0"
            style={{
              background: 'linear-gradient(90deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.04) 100%)',
              borderBottom: '1px solid rgba(245,158,11,0.2)',
            }}
          >
            <WifiOff size={13} className="text-amber-400 flex-shrink-0" />
            <div className="flex-1 text-[11px] text-amber-300">
              {!ollamaStatus.base_url
                ? 'Ollama가 설정되지 않았습니다. AI 기능을 사용하려면 연결해주세요.'
                : `Ollama(${ollamaStatus.base_url})에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.`
              }
              <span className="font-mono text-amber-500 ml-2">
                ollama serve &amp;&amp; ollama pull {ollamaStatus.model}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={checkOllama}
                className="text-[10px] px-2.5 py-1 rounded flex items-center gap-1 text-amber-400 hover:text-amber-200"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <Loader2 size={9} className={ollamaChecking ? 'animate-spin' : ''} />
                재확인
              </button>
              <button
                onClick={() => navigate('/admin')}
                className="text-[10px] px-2.5 py-1 rounded flex items-center gap-1 text-amber-400 hover:text-amber-200"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
              >
                <Settings size={9} />설정
              </button>
              <button onClick={() => setOllamaBannerDismissed(true)} className="text-slate-600 hover:text-slate-400 ml-1">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

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
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
                style={{ background: msg.role === 'user' ? '#334155' : '#e24c4b', color: 'white' }}
              >
                {msg.role === 'user' ? '🫵' : '👔'}
              </div>
              <div className={`max-w-[72%] space-y-1 flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className="text-[10px] text-slate-600">
                  {msg.sender_name} · {format(new Date(msg.created_at), 'HH:mm')}
                </div>
                <div className={msg.role === 'user' ? 'chat-user' : 'chat-ai'}>
                  {msg.role === 'assistant' && loading && msg.content === '' ? (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {msg.content}
                      {msg.role === 'assistant' && loading && msg.content !== '' && (
                        <span className="inline-block w-0.5 h-4 bg-slate-400 ml-0.5 align-middle" style={{ animation: 'blink 1s step-end infinite' }} />
                      )}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && messages.every((m) => m.role === 'user') && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base flex-shrink-0" style={{ background: '#e24c4b' }}>👔</div>
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

      {/* ── Right Live Panel ─────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-l border-bg-border bg-bg-card overflow-hidden">
        {/* Panel tabs */}
        <div className="flex border-b border-bg-border flex-shrink-0">
          <button
            onClick={() => setPanelMode('companies')}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${panelMode === 'companies' ? 'text-brand-light border-b-2 border-brand' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="flex items-center justify-center gap-1"><Building2 size={10} />계열사</span>
          </button>
          <button
            onClick={() => { setPanelMode('kpi'); if (!kpiData) loadKpi() }}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${panelMode === 'kpi' ? 'text-brand-light border-b-2 border-brand' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="flex items-center justify-center gap-1"><BarChart2 size={10} />KPI</span>
          </button>
          <button
            onClick={() => setPanelMode('delegation')}
            className={`flex-1 py-2 text-[10px] font-medium transition-colors ${panelMode === 'delegation' ? 'text-brand-light border-b-2 border-brand' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="flex items-center justify-center gap-1"><ArrowRight size={10} />지시체인</span>
          </button>
          {previewCompany && (
            <button
              onClick={() => setPanelMode('preview')}
              className={`flex-1 py-2 text-[10px] font-medium transition-colors ${panelMode === 'preview' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-amber-500 hover:text-amber-300'}`}
            >
              <span className="flex items-center justify-center gap-1"><AlertCircle size={10} />승인</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">

          {/* ── Preview panel ── */}
          {panelMode === 'preview' && previewCompany && (
            <div>
              <div className="text-[10px] text-amber-500 uppercase tracking-widest font-mono px-1 mb-2 flex items-center gap-1">
                <AlertCircle size={9} />설립 승인 대기
              </div>
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.04) 100%)',
                  border: '1px solid rgba(245,158,11,0.3)',
                  borderRadius: 12,
                  padding: '14px',
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: 'rgba(245,158,11,0.15)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16,
                    }}
                  >
                    🏢
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100">{previewCompany.name}</div>
                    <div className="text-[10px] text-amber-400">{previewCompany.industry}</div>
                  </div>
                </div>

                {previewCompany.vision && (
                  <div className="text-[10px] text-slate-400 italic mb-2 leading-relaxed">
                    "{previewCompany.vision}"
                  </div>
                )}
                {previewCompany.description && (
                  <div className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                    {previewCompany.description}
                  </div>
                )}

                <div
                  className="text-[10px] text-slate-500 mb-3 p-2 rounded"
                  style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <Zap size={9} className="text-amber-400" />
                    <span className="text-amber-400 font-medium">설립 후 자동 처리</span>
                  </div>
                  <div>• 역할별 AI 조직 자동 구성</div>
                  <div>• CEO 초기 전략 브리핑 발송</div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={confirmCompany}
                    disabled={previewConfirming}
                    className="flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5"
                    style={{
                      background: 'rgba(16,185,129,0.15)',
                      color: '#34d399',
                      border: '1px solid rgba(16,185,129,0.35)',
                    }}
                  >
                    {previewConfirming ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
                    설립 승인
                  </button>
                  <button
                    onClick={cancelPreview}
                    disabled={previewConfirming}
                    className="flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 text-slate-500 hover:text-slate-300"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <X size={11} />취소
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── KPI panel ── */}
          {panelMode === 'kpi' && (
            <>
              <div className="flex items-center justify-between px-1 mb-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono">그룹 KPI</div>
                <button
                  onClick={loadKpi}
                  className="text-[9px] text-slate-600 hover:text-slate-400 flex items-center gap-0.5"
                >
                  {kpiLoading ? <Loader2 size={9} className="animate-spin" /> : <BarChart2 size={9} />}
                  새로고침
                </button>
              </div>

              {kpiLoading && !kpiData && (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={16} className="animate-spin text-slate-600" />
                </div>
              )}

              {kpiData && (
                <>
                  {/* Group totals */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3">
                    {[
                      { label: '계열사', value: kpiData.totals.total_companies, icon: Building2 },
                      { label: 'AI 대화', value: kpiData.totals.total_ai_messages, icon: MessageSquare },
                      { label: '평균점수', value: `${kpiData.totals.avg_ai_score}`, icon: BarChart2 },
                    ].map(({ label, value, icon: Icon }) => (
                      <div
                        key={label}
                        className="rounded-lg p-2 text-center"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <Icon size={10} className="text-slate-500 mx-auto mb-1" />
                        <div className="text-sm font-bold text-slate-200">{value}</div>
                        <div className="text-[9px] text-slate-600">{label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Per-company rows */}
                  {kpiData.companies.length === 0 ? (
                    <div className="text-[11px] text-slate-600 text-center py-6">
                      계열사 데이터 없음
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {kpiData.companies.map((c) => {
                        const score = c.ai_score
                        const barColor =
                          score >= 80 ? '#34d399' :
                          score >= 60 ? '#60a5fa' :
                          score >= 30 ? '#fbbf24' : '#f87171'
                        return (
                          <div
                            key={c.id}
                            className="rounded-lg p-2.5"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium text-slate-200 truncate">{c.name}</div>
                                <div className="text-[9px] text-slate-600">{c.industry}</div>
                              </div>
                              <div
                                className="text-xs font-bold ml-2 flex-shrink-0"
                                style={{ color: barColor }}
                              >
                                {score}
                              </div>
                            </div>
                            {/* Score bar */}
                            <div className="h-1 rounded-full bg-bg-border overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${score}%`, background: barColor }}
                              />
                            </div>
                            <div className="flex gap-2 mt-1.5">
                              {[
                                { icon: MessageSquare, val: c.ai_messages, label: '대화' },
                                { icon: Users, val: c.org_nodes, label: '조직' },
                                { icon: Zap, val: c.strategies, label: '전략' },
                              ].map(({ icon: Icon, val, label }) => (
                                <div key={label} className="flex items-center gap-0.5 text-[9px] text-slate-600">
                                  <Icon size={8} />
                                  <span>{val} {label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {!kpiData && !kpiLoading && (
                <div className="text-center py-10 space-y-2">
                  <BarChart2 size={20} className="text-slate-700 mx-auto" />
                  <div className="text-[11px] text-slate-600">KPI 탭을 클릭하면 로드됩니다</div>
                </div>
              )}
            </>
          )}

          {/* ── Companies panel ── */}
          {panelMode === 'companies' && (
            <>
              <div className="text-[10px] text-slate-500 uppercase tracking-widest font-mono px-1 mb-1">
                그룹 계열사 ({companies.length})
              </div>
              {companies.length === 0 ? (
                <div className="text-[11px] text-slate-600 text-center py-10 space-y-1">
                  <div>아직 계열사가 없습니다</div>
                  <div className="text-slate-700 text-[10px]">회장님께 설립을 지시해보세요</div>
                </div>
              ) : (
                companies.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border transition-all ${
                      c.id === newCompanyId
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : 'border-bg-border bg-bg-elevated'
                    }`}
                  >
                    <div
                      onClick={() => navigate('/live-office')}
                      className="px-3 py-2.5 cursor-pointer hover:bg-bg-border/20 rounded-t-lg transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-slate-200 truncate">{c.name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">{c.industry}</div>
                          {c.vision && (
                            <div className="text-[9px] text-slate-600 mt-1 truncate italic">"{c.vision}"</div>
                          )}
                        </div>
                        {c.id === newCompanyId
                          ? <CheckCircle size={13} className="text-emerald-400 flex-shrink-0" />
                          : <ChevronRight size={11} className="text-slate-600 flex-shrink-0" />
                        }
                      </div>
                    </div>
                    {/* CEO chat button */}
                    <div className="px-3 pb-2 border-t border-bg-border/50">
                      <button
                        onClick={(e) => { e.stopPropagation(); openCeoChat(c) }}
                        className="w-full mt-1.5 py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1.5 text-slate-400 hover:text-brand-light transition-colors"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                      >
                        <MessageSquare size={9} />CEO와 직접 대화
                      </button>
                    </div>
                  </div>
                ))
              )}

              {newCompanyId && (
                <button
                  onClick={() => navigate('/live-office')}
                  className="w-full mt-2 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"
                  style={{
                    background: 'rgba(16,185,129,0.1)', color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.25)',
                  }}
                >
                  <Eye size={12} />설립 현장 보기 → AI 오피스
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
                  <div className="text-slate-700 text-[10px]">지시 체인을 실시간으로 볼 수 있습니다</div>
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
                        <div className="ml-4 w-px bg-bg-border" style={{ height: 6 }} />
                      )}
                    </div>
                  ))}

                  {/* CEO briefing answer preview */}
                  {briefingAnswer && (
                    <div
                      className="mt-3 rounded-lg p-3"
                      style={{
                        background: 'rgba(99,102,241,0.06)',
                        border: '1px solid rgba(99,102,241,0.2)',
                      }}
                    >
                      <div className="text-[9px] text-indigo-400 font-medium mb-1.5 flex items-center gap-1">
                        <MessageSquare size={9} />CEO 보고 요약
                      </div>
                      <div className="text-[10px] text-slate-400 leading-relaxed line-clamp-6">
                        {briefingAnswer}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── CEO Direct Chat Modal ─────────────────────────────────────────────── */}
      {ceoChatCompany && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeCeoChat() }}
        >
          <div
            style={{
              width: 500, height: 600,
              background: 'linear-gradient(160deg, #0f172a 0%, #1a1535 100%)',
              borderRadius: 16,
              border: '1px solid rgba(99,102,241,0.3)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.1)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15,
                }}
              >
                🤵
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">{ceoChatCompany.name} CEO</div>
                <div className="text-[10px] text-indigo-400">{ceoChatCompany.industry} · 직접 대화</div>
              </div>
              <button
                onClick={closeCeoChat}
                className="ml-auto text-slate-600 hover:text-slate-300 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {ceoChatMessages.length === 0 && !ceoChatLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-600">
                  <div style={{ fontSize: 36 }}>🤵</div>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-400">{ceoChatCompany.name} CEO</div>
                    <div className="text-[10px] text-slate-600 mt-1">회장님의 지시를 기다리고 있습니다</div>
                  </div>
                </div>
              )}
              {ceoChatMessages.map((msg) => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs"
                    style={{ background: msg.role === 'user' ? '#334155' : 'rgba(99,102,241,0.25)' }}
                  >
                    {msg.role === 'user' ? '👔' : '🤵'}
                  </div>
                  <div className={`max-w-[75%] ${msg.role === 'user' ? 'chat-user' : 'chat-ai'}`}>
                    {msg.role === 'assistant' && ceoChatLoading && msg.content === '' ? (
                      <div className="flex items-center gap-1.5 py-0.5">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    ) : (
                      <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">
                        {msg.content}
                        {msg.role === 'assistant' && ceoChatLoading && msg.content !== '' && (
                          <span className="inline-block w-0.5 h-3.5 bg-slate-400 ml-0.5 align-middle" style={{ animation: 'blink 1s step-end infinite' }} />
                        )}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
              <div ref={ceoChatEndRef} />
            </div>

            {/* Input */}
            <div className="px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex gap-2">
                <textarea
                  className="input resize-none flex-1 text-xs"
                  rows={2}
                  value={ceoChatInput}
                  onChange={(e) => setCeoChatInput(e.target.value)}
                  onKeyDown={handleCeoKey}
                  placeholder={`${ceoChatCompany.name} CEO에게 지시… (Enter 전송)`}
                  disabled={!ceoChatSession || ceoChatLoading}
                />
                <button
                  onClick={sendCeoMessage}
                  disabled={!ceoChatInput.trim() || !ceoChatSession || ceoChatLoading}
                  className="btn-primary px-3 flex-shrink-0 flex items-center"
                >
                  {ceoChatLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .line-clamp-6 { display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden; }
      `}</style>
    </div>
  )
}
