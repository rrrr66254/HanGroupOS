import { useState, useEffect, useCallback } from 'react'
import axios from '../api/client'

const STAGE_ICONS = ['🔍', '💡', '📊', '🏢', '👑', '⚡']
const STAGE_COLORS: Record<string, string> = {
  pending: 'bg-gray-700 text-gray-400',
  running: 'bg-blue-900 text-blue-300 animate-pulse',
  done: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
}
const STATUS_BADGE: Record<string, string> = {
  running: 'bg-blue-600 text-white',
  completed: 'bg-green-600 text-white',
  failed: 'bg-red-600 text-white',
  partial: 'bg-yellow-600 text-white',
}

interface StageLog {
  id: number
  stage_index: number
  stage_name: string
  status: string
  input_summary: string
  output: string
  stats: Record<string, unknown>
  error: string
  started_at: string | null
  finished_at: string | null
}

interface PipelineRunDetail {
  id: number
  status: string
  trigger: string
  current_stage: number
  total_stages: number
  summary: string
  action_items: string[]
  meta: Record<string, unknown>
  started_at: string | null
  finished_at: string | null
  stages?: StageLog[]
}

function elapsed(start: string | null, end: string | null): string {
  if (!start) return '-'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const sec = Math.round((e - s) / 1000)
  if (sec < 60) return `${sec}초`
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`
}

export default function Pipeline() {
  const [runs, setRuns] = useState<PipelineRunDetail[]>([])
  const [selected, setSelected] = useState<PipelineRunDetail | null>(null)
  const [expandedStage, setExpandedStage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState('')

  const fetchRuns = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await axios.get<PipelineRunDetail[]>('/api/pipeline/runs?limit=10')
      setRuns(data)
      if (data.length > 0 && !selected) setSelected(data[0])
    } catch {
      setError('파이프라인 이력을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [selected])

  const fetchSelected = useCallback(async (id: number) => {
    try {
      const { data } = await axios.get<PipelineRunDetail>(`/api/pipeline/runs/${id}`)
      setSelected(data)
      setRuns(prev => prev.map(r => r.id === id ? { ...r, status: data.status, current_stage: data.current_stage } : r))
    } catch {/* ignore */}
  }, [])

  useEffect(() => {
    fetchRuns()
  }, [])

  // 실행 중인 파이프라인 자동 폴링
  useEffect(() => {
    if (!selected || selected.status !== 'running') return
    const interval = setInterval(() => fetchSelected(selected.id), 3000)
    return () => clearInterval(interval)
  }, [selected, fetchSelected])

  const triggerPipeline = async () => {
    setTriggering(true)
    setError('')
    try {
      const { data } = await axios.post('/api/pipeline/run')
      if (data.already_running) {
        setError('이미 실행 중인 파이프라인이 있습니다.')
      } else {
        await fetchRuns()
        // 새 실행 선택
        setTimeout(() => fetchRuns(), 1000)
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err?.response?.data?.detail || '파이프라인 실행 실패')
    } finally {
      setTriggering(false)
    }
  }

  const selectRun = async (run: PipelineRunDetail) => {
    setExpandedStage(null)
    const { data } = await axios.get<PipelineRunDetail>(`/api/pipeline/runs/${run.id}`)
    setSelected(data)
  }

  const progressPct = selected
    ? Math.round((selected.current_stage / selected.total_stages) * 100)
    : 0

  return (
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">자율 파이프라인</h1>
          <p className="text-gray-400 text-sm mt-1">
            데이터 수집 → 인사이트 추출 → 전략 진단 → 건강 체크 → 회장 보고서 → 액션 아이템
          </p>
        </div>
        <button
          onClick={triggerPipeline}
          disabled={triggering}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700
                     text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          {triggering ? (
            <><span className="animate-spin">⚙️</span> 시작 중...</>
          ) : (
            <><span>▶</span> 파이프라인 실행</>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* 왼쪽: 실행 이력 */}
        <div className="col-span-3 space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">실행 이력</h2>
          {loading && <p className="text-gray-500 text-sm">불러오는 중...</p>}
          {runs.length === 0 && !loading && (
            <p className="text-gray-500 text-sm">실행 이력 없음</p>
          )}
          {runs.map(run => (
            <button
              key={run.id}
              onClick={() => selectRun(run)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                selected?.id === run.id
                  ? 'border-indigo-500 bg-indigo-900/30'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-sm font-medium">#{run.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[run.status] || 'bg-gray-700 text-gray-400'}`}>
                  {run.status === 'running' ? `${run.current_stage}/6단계` : run.status}
                </span>
              </div>
              <div className="text-gray-500 text-xs">
                {run.started_at ? new Date(run.started_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
              </div>
              {run.status === 'running' && (
                <div className="mt-2 bg-gray-700 rounded-full h-1">
                  <div
                    className="bg-indigo-500 h-1 rounded-full transition-all"
                    style={{ width: `${Math.round((run.current_stage / 6) * 100)}%` }}
                  />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* 오른쪽: 선택된 실행 상세 */}
        <div className="col-span-9 space-y-4">
          {!selected ? (
            <div className="bg-gray-800 rounded-xl p-12 text-center text-gray-500">
              파이프라인을 실행하거나 이력을 선택하세요
            </div>
          ) : (
            <>
              {/* 진행 상태 바 */}
              <div className="bg-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-white font-semibold">실행 #{selected.id}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[selected.status] || ''}`}>
                      {selected.status}
                    </span>
                    <span className="text-gray-500 text-xs">
                      소요: {elapsed(selected.started_at, selected.finished_at)}
                    </span>
                  </div>
                  {selected.status === 'running' && (
                    <button onClick={() => fetchSelected(selected.id)} className="text-gray-400 hover:text-white text-sm">
                      새로고침
                    </button>
                  )}
                </div>

                {/* 단계 진행 시각화 */}
                <div className="flex items-center gap-1">
                  {(selected.stages || Array.from({ length: 6 }, (_, i) => ({
                    stage_index: i,
                    stage_name: ['데이터 스캔', '인사이트 추출', '전략 진단', '건강 체크', '회장 보고서', '액션 아이템'][i],
                    status: i < selected.current_stage ? 'done' : i === selected.current_stage && selected.status === 'running' ? 'running' : 'pending',
                    output: '', input_summary: '', stats: {}, error: '', started_at: null, finished_at: null, id: i,
                  }))).map((stage, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                      <button
                        onClick={() => setExpandedStage(expandedStage === idx ? null : idx)}
                        className={`w-full py-2 rounded-lg text-center text-xs font-medium transition-colors cursor-pointer ${STAGE_COLORS[stage.status]}`}
                      >
                        <div className="text-base">{STAGE_ICONS[idx]}</div>
                        <div className="mt-0.5 leading-tight">{stage.stage_name}</div>
                      </button>
                      {idx < 5 && (
                        <div className={`hidden sm:block w-full h-0.5 mt-1 ${stage.status === 'done' ? 'bg-green-700' : 'bg-gray-700'}`} />
                      )}
                    </div>
                  ))}
                </div>

                {/* 전체 진행률 */}
                <div className="mt-3 bg-gray-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${selected.status === 'completed' ? 'bg-green-500' : 'bg-indigo-500'}`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* 선택된 단계 상세 출력 */}
              {expandedStage !== null && selected.stages && selected.stages[expandedStage] && (
                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{STAGE_ICONS[expandedStage]}</span>
                    <h3 className="text-white font-semibold">
                      Stage {expandedStage}: {selected.stages[expandedStage].stage_name}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STAGE_COLORS[selected.stages[expandedStage].status]}`}>
                      {selected.stages[expandedStage].status}
                    </span>
                  </div>
                  {selected.stages[expandedStage].input_summary && (
                    <p className="text-gray-400 text-xs mb-2">
                      입력: {selected.stages[expandedStage].input_summary}
                    </p>
                  )}
                  {Object.keys(selected.stages[expandedStage].stats || {}).length > 0 && (
                    <div className="flex gap-3 mb-3">
                      {Object.entries(selected.stages[expandedStage].stats).map(([k, v]) => (
                        <div key={k} className="bg-gray-700 rounded px-3 py-1.5 text-xs">
                          <span className="text-gray-400">{k}: </span>
                          <span className="text-white font-medium">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <pre className="text-gray-300 text-xs bg-gray-900 rounded p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {selected.stages[expandedStage].output || '(출력 없음)'}
                  </pre>
                  {selected.stages[expandedStage].error && (
                    <p className="text-red-400 text-xs mt-2">오류: {selected.stages[expandedStage].error}</p>
                  )}
                </div>
              )}

              {/* 통계 요약 */}
              {selected.meta && Object.keys(selected.meta).length > 0 && (
                <div className="grid grid-cols-5 gap-3">
                  {[
                    { key: 'tagged', label: 'AI 태깅', icon: '🏷️' },
                    { key: 'insights', label: '인사이트', icon: '💡' },
                    { key: 'at_risk_count', label: '위험 전략', icon: '⚠️' },
                    { key: 'danger_companies', label: '위험 계열사', icon: '🏢' },
                    { key: 'actions_created', label: '액션 아이템', icon: '⚡' },
                  ].map(({ key, label, icon }) => {
                    const val = selected.meta[key]
                    const display = Array.isArray(val) ? val.length : val
                    return (
                      <div key={key} className="bg-gray-800 rounded-xl p-4 text-center">
                        <div className="text-2xl mb-1">{icon}</div>
                        <div className="text-xl font-bold text-white">{display ?? '-'}</div>
                        <div className="text-gray-400 text-xs">{label}</div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 액션 아이템 */}
              {selected.action_items && selected.action_items.length > 0 && (
                <div className="bg-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-3">⚡ 생성된 액션 아이템</h3>
                  <ul className="space-y-2">
                    {selected.action_items.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-indigo-400 font-bold mt-0.5">{i + 1}.</span>
                        <span className="text-gray-300">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 회장 최종 보고서 */}
              {selected.summary && (
                <div className="bg-gray-800 rounded-xl p-5">
                  <h3 className="text-white font-semibold mb-3">👑 회장 AI 종합 보고서</h3>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <pre className="text-gray-300 text-sm whitespace-pre-wrap font-sans leading-relaxed max-h-96 overflow-y-auto">
                      {selected.summary}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
