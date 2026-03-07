import { useEffect, useRef, useState } from 'react'
import { Plus, Send, Trash2, Zap, MessageSquare } from 'lucide-react'
import { chatApi, companiesApi } from '../api/client'
import type { ChatSession, ChatMessage, Company } from '../types'
import { format } from 'date-fns'

export default function Chairman() {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<Array<{ id: number; title: string; description: string }>>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chatApi.sessions('chairman').then((r) => {
      setSessions(r.data)
      if (r.data.length > 0) loadSession(r.data[0])
    })
    companiesApi.list().then((r) => setCompanies(r.data))
    chatApi.suggestions().then((r) => setSuggestions(r.data))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadSession = async (session: ChatSession) => {
    setActiveSession(session)
    const res = await chatApi.messages(session.id)
    setMessages(res.data)
  }

  const newSession = async () => {
    const res = await chatApi.createSession({
      session_type: 'chairman',
      title: `회장 세션 ${new Date().toLocaleTimeString('ko-KR')}`,
    })
    const session = res.data
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

    // Optimistic user message
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
      const res = await chatApi.send({
        session_id: activeSession.id,
        content,
      })
      // Replace temp + add AI response
      const aiMsg = res.data
      setMessages((prev) => [...prev.filter((m) => m.id !== tempUser.id), tempUser, aiMsg])

      // Refresh suggestions
      chatApi.suggestions().then((r) => setSuggestions(r.data))
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 animate-fade-in">
      {/* Left: Sessions list */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2">
        <button onClick={newSession} className="btn-primary flex items-center gap-2 w-full justify-center py-2">
          <Plus size={14} />
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
                <MessageSquare size={12} className="flex-shrink-0" />
                <span className="truncate">{s.title}</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-danger ml-1 flex-shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="border-t border-bg-border pt-2">
            <div className="text-[10px] text-slate-600 px-1 mb-1">AI 제안</div>
            {suggestions.slice(0, 3).map((s) => (
              <div
                key={s.id}
                className="px-2 py-1.5 rounded-lg bg-bg-elevated text-[10px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors mb-1"
                onClick={() => setInput(s.description)}
              >
                💡 {s.title}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right: Chat */}
      <div className="flex-1 flex flex-col card overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-bg-border">
          <div className="w-8 h-8 bg-brand rounded-full flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">AI 회장</div>
            <div className="text-[10px] text-success flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-success rounded-full blink" />
              온라인
            </div>
          </div>
          {activeSession && (
            <div className="ml-auto text-[10px] text-slate-600 font-mono">
              세션 #{activeSession.id}
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeSession && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <Zap size={40} className="text-brand/30" />
              <p className="text-sm">새 대화를 시작하거나 기존 세션을 선택하세요.</p>
              <button onClick={newSession} className="btn-primary text-xs">
                AI 회장과 대화 시작
              </button>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold
                ${msg.role === 'user' ? 'bg-slate-700 text-slate-300' : 'bg-brand text-white'}`}>
                {msg.role === 'user' ? 'U' : '회'}
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
              <div className="w-7 h-7 rounded-full bg-brand flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">회</div>
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
            {[
              '새 계열사 설립을 검토해줘',
              'AI 미디어 회사를 만들고 싶어',
              '현재 그룹 전략을 분석해줘',
              '데이터 분야 시장 기회를 찾아줘',
            ].map((p) => (
              <button
                key={p}
                className="text-xs px-3 py-1.5 rounded-full bg-bg-elevated text-slate-400 hover:text-slate-200 hover:bg-brand/10 hover:border-brand/30 border border-transparent transition-all"
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
              placeholder="AI 회장에게 전략적 지시를 내리세요... (Enter로 전송)"
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

      {/* Companies quick ref */}
      {companies.length > 0 && (
        <div className="w-44 flex-shrink-0 card p-3">
          <div className="text-[10px] text-slate-600 mb-2">계열사</div>
          {companies.map((c) => (
            <div
              key={c.id}
              className="text-xs text-slate-400 hover:text-slate-200 cursor-pointer py-1 truncate"
              onClick={() => setInput(`${c.name}에 대해 분석해줘`)}
            >
              · {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
