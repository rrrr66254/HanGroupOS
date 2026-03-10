import { useEffect, useState } from 'react'
import { Users, Plus, X, Send, Bot, FileText, Loader2, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { meetingsApi, companiesApi } from '../api/client'
import MarkdownMessage from '../components/MarkdownMessage'
import type { Meeting, MeetingMessage, Company } from '../types'
import { format } from 'date-fns'

interface MeetingSummary {
  summary: string
  key_decisions: string[]
  action_items: { assignee: string; task: string; priority: string }[]
  next_steps: string
  approvals_created: number
}

export default function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selected, setSelected] = useState<Meeting | null>(null)
  const [messages, setMessages] = useState<MeetingMessage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ title: '', description: '', company_id: '' })
  const [msgInput, setMsgInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [senderName, setSenderName] = useState('Human Founder')
  const [summarizing, setSummarizing] = useState(false)
  const [summary, setSummary] = useState<MeetingSummary | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => {
    meetingsApi.list().then((r) => setMeetings(r.data))
    companiesApi.list().then((r) => setCompanies(r.data))
  }, [])

  const loadMeeting = async (m: Meeting) => {
    setSelected(m)
    const res = await meetingsApi.messages(m.id)
    setMessages(res.data)
  }

  const createMeeting = async () => {
    const payload = {
      title: newForm.title,
      description: newForm.description,
      company_id: newForm.company_id ? parseInt(newForm.company_id) : null,
    }
    const res = await meetingsApi.create(payload)
    setMeetings((prev) => [res.data, ...prev])
    setShowNew(false)
    setNewForm({ title: '', description: '', company_id: '' })
    loadMeeting(res.data)
  }

  const sendMsg = async () => {
    if (!msgInput.trim() || !selected) return
    const res = await meetingsApi.addMessage(selected.id, {
      sender: senderName,
      sender_role: '창립자',
      content: msgInput,
    })
    setMessages((prev) => [...prev, res.data])
    setMsgInput('')
  }

  const askAI = async () => {
    if (!selected) return
    setAiLoading(true)
    const res = await meetingsApi.aiResponse(selected.id)
    setMessages((prev) => [...prev, res.data])
    setAiLoading(false)
  }

  const closeMeeting = async () => {
    if (!selected) return
    await meetingsApi.close(selected.id)
    setSelected((prev) => prev ? { ...prev, status: 'closed' } : null)
    setMeetings((prev) => prev.map((m) => m.id === selected.id ? { ...m, status: 'closed' } : m))
  }

  const summarizeMeeting = async () => {
    if (!selected) return
    setSummarizing(true)
    setSummary(null)
    setSummaryOpen(true)
    try {
      const r = await meetingsApi.summarize(selected.id)
      setSummary(r.data as MeetingSummary)
    } catch { /* ignore */ } finally { setSummarizing(false) }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      {/* Left: Meeting list */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2">
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2 w-full justify-center py-2">
          <Plus size={14} /> 새 회의
        </button>

        <div className="flex-1 overflow-y-auto space-y-1">
          {meetings.map((m) => (
            <div
              key={m.id}
              onClick={() => loadMeeting(m)}
              className={`px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-xs ${
                selected?.id === m.id ? 'bg-brand/15 text-brand-light' : 'hover:bg-bg-elevated text-slate-400'
              }`}
            >
              <div className="font-medium truncate">{m.title}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`badge ${m.status === 'open' ? 'badge-active' : 'badge-inactive'}`}>{m.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Chat */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            <div className="text-center">
              <Users size={40} className="mx-auto mb-3 text-slate-700" />
              <p className="text-sm">회의를 선택하거나 새 회의를 시작하세요.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-100">{selected.title}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{selected.description}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={summarizeMeeting}
                  disabled={summarizing || messages.length === 0}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-all"
                  style={{ background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc' }}
                >
                  {summarizing ? <Loader2 size={11} className="animate-spin" /> : <FileText size={11} />}
                  회의록 생성
                </button>
                {selected.status === 'open' && (
                  <button onClick={closeMeeting} className="text-xs text-slate-500 hover:text-danger border border-bg-border rounded-lg px-2 py-1">
                    회의 종료
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-slate-600 text-xs py-8">
                  회의를 시작하세요. AI 응답 버튼을 눌러 AI 참가자를 불러올 수 있습니다.
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.sender_role === 'AI' ? '' : 'flex-row-reverse'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                    msg.sender_role === 'AI' ? 'bg-brand/20 text-brand-light' : 'bg-slate-700 text-slate-300'
                  }`}>
                    {msg.sender_role === 'AI' ? <Bot size={11} /> : 'H'}
                  </div>
                  <div className={`max-w-[80%] ${msg.sender_role !== 'AI' ? 'items-end' : ''} flex flex-col gap-0.5`}>
                    <div className="text-[9px] text-slate-600">{msg.sender} · {format(new Date(msg.created_at), 'HH:mm')}</div>
                    {msg.sender_role === 'AI' ? (
                      <div className="chat-ai">
                        <MarkdownMessage content={msg.content} />
                      </div>
                    ) : (
                      <div className="chat-user">
                        <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed">{msg.content}</pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-brand/20 flex items-center justify-center">
                    <Bot size={11} className="text-brand-light" />
                  </div>
                  <div className="chat-ai text-xs text-slate-500 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Summary Panel */}
            {summaryOpen && (
              <div className="border-t border-bg-border" style={{ background: 'rgba(99,102,241,0.04)' }}>
                <button
                  onClick={() => setSummaryOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2">
                    <FileText size={12} className="text-brand-light" />
                    AI 회의록
                    {summary && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-brand/20 text-brand-light">{summary.approvals_created}개 액션 등록</span>}
                  </div>
                  {summaryOpen ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronUp size={12} className="text-slate-500" />}
                </button>
                {summarizing && (
                  <div className="px-4 pb-3 flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 size={12} className="animate-spin" /> AI가 회의록을 작성하고 있습니다…
                  </div>
                )}
                {summary && (
                  <div className="px-4 pb-4 space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">{summary.summary}</p>
                    {summary.key_decisions.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 mb-1">결정 사항</div>
                        <ul className="space-y-0.5">
                          {summary.key_decisions.map((d, i) => (
                            <li key={i} className="text-[11px] text-slate-400 flex gap-1.5">
                              <span className="text-brand-light flex-shrink-0">✓</span>{d}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {summary.action_items.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 mb-1">액션 아이템 (승인함 자동 등록됨)</div>
                        <div className="space-y-1">
                          {summary.action_items.map((a, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <CheckCircle size={9} className="text-emerald-500 flex-shrink-0" />
                              <span className="text-slate-400">{a.assignee}</span>
                              <span className="text-slate-600">—</span>
                              <span className="text-slate-300">{a.task}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {summary.next_steps && (
                      <div className="text-[10px] text-slate-500 pt-1 border-t border-white/[0.05]">
                        다음 단계: <span className="text-slate-400">{summary.next_steps}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Input */}
            {selected.status === 'open' && (
              <div className="p-4 border-t border-bg-border space-y-2">
                <div className="flex gap-2 items-center">
                  <input
                    className="input text-xs"
                    placeholder="발언자 이름"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    style={{ maxWidth: 140 }}
                  />
                  <button
                    onClick={askAI}
                    disabled={aiLoading}
                    className="btn-ghost border border-bg-border flex items-center gap-1.5 text-xs"
                  >
                    <Bot size={12} /> AI 응답
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    className="input text-xs"
                    value={msgInput}
                    onChange={(e) => setMsgInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMsg()}
                    placeholder="메시지 입력..."
                  />
                  <button onClick={sendMsg} className="btn-primary px-3">
                    <Send size={13} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* New meeting modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-md p-6 animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-100">새 회의 생성</h2>
              <button onClick={() => setShowNew(false)} className="text-slate-500 hover:text-slate-300"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">제목 *</label>
                <input className="input" value={newForm.title} onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">설명</label>
                <input className="input" value={newForm.description} onChange={(e) => setNewForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">계열사 (선택)</label>
                <select
                  className="input"
                  value={newForm.company_id}
                  onChange={(e) => setNewForm((f) => ({ ...f, company_id: e.target.value }))}
                >
                  <option value="">전체 그룹</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowNew(false)} className="flex-1 btn-ghost border border-bg-border">취소</button>
              <button onClick={createMeeting} disabled={!newForm.title} className="flex-1 btn-primary">생성</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
