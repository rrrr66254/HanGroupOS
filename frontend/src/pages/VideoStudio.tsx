import { useEffect, useRef, useState } from 'react'
import { Film, Play, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react'
import { videoApi } from '../api/client'

interface VideoModel {
  id: string
  label: string
  provider: string
  recommended: boolean
}

interface VideoJob {
  id: number
  prompt: string
  model_id: string
  provider: string
  status: 'pending' | 'running' | 'done' | 'failed'
  video_url: string | null
  error_msg: string
  duration_sec: number | null
  created_at: string
  finished_at: string | null
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  done: 'text-green-400',
  failed: 'text-red-400',
}

const STATUS_LABEL: Record<string, string> = {
  pending: '대기 중',
  running: '생성 중...',
  done: '완료',
  failed: '실패',
}

const EST_SECONDS: Record<string, number> = {
  'json2video': 60,
  'hf-inference': 240,
  'fal-ai': 180,
}

export default function VideoStudio() {
  const [models, setModels] = useState<VideoModel[]>([])
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [prompt, setPrompt] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<VideoJob | null>(null)
  const [j2vConfig, setJ2vConfig] = useState({ template: 'basic', logo: '', bgImageUrl: '', bgm: false })
  const [now, setNow] = useState(Date.now())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const formatElapsed = (createdAt: string) => {
    const elapsed = Math.floor((now - new Date(createdAt).getTime()) / 1000)
    const m = Math.floor(elapsed / 60)
    const s = elapsed % 60
    return m > 0 ? `${m}분 ${s}초` : `${s}초`
  }

  const getProgress = (job: VideoJob) => {
    const est = EST_SECONDS[job.provider] ?? 180
    const elapsed = (now - new Date(job.created_at).getTime()) / 1000
    return Math.min(Math.round((elapsed / est) * 100), 95)
  }

  useEffect(() => {
    videoApi.models().then((r) => {
      setModels(r.data)
      const rec = r.data.find((m: VideoModel) => m.recommended)
      if (rec) setSelectedModel(rec.id)
    })
    loadJobs()
  }, [])

  // Poll active jobs
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running')
    if (hasActive) {
      pollRef.current = setInterval(loadJobs, 4000)
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobs])

  // 1초마다 now 갱신 (진행률 타이머용)
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running')
    if (!hasActive) return
    const iv = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [jobs])

  const loadJobs = () =>
    videoApi.jobs().then((r) => {
      setJobs(r.data)
      setSelected((prev) => {
        if (!prev) return prev
        const updated = r.data.find((j: VideoJob) => j.id === prev.id)
        return updated ?? prev
      })
    })

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setError('')
    setGenerating(true)
    try {
      await videoApi.generate({
        prompt: prompt.trim(),
        model_id: selectedModel,
        ...(selectedModel === 'json2video/presentation' ? { meta: j2vConfig } : {}),
      })
      setPrompt('')
      await loadJobs()
    } catch (e: any) {
      setError(e.response?.data?.detail || '영상 생성 요청 실패')
    } finally {
      setGenerating(false)
    }
  }

  const handleDelete = async (job: VideoJob) => {
    await videoApi.deleteJob(job.id)
    if (selected?.id === job.id) setSelected(null)
    await loadJobs()
  }

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-80 border-r border-bg-border flex flex-col bg-bg-card">
        {/* Header */}
        <div className="p-4 border-b border-bg-border">
          <div className="flex items-center gap-2 mb-4">
            <Film size={18} className="text-brand-light" />
            <h1 className="text-sm font-semibold text-slate-100">영상 스튜디오</h1>
          </div>

          {/* Prompt input */}
          <div className="space-y-2">
            <label className="text-[10px] text-slate-500">프롬프트 (영어 권장)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A cinematic shot of a futuristic city at sunset..."
              className="w-full bg-bg-base border border-bg-border rounded text-xs text-slate-200 p-2.5 resize-none h-20 focus:outline-none focus:border-brand/60 placeholder:text-slate-600"
            />

            {/* Model selector */}
            <label className="text-[10px] text-slate-500">생성 모델</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full bg-bg-base border border-bg-border rounded text-xs text-slate-200 p-2 focus:outline-none focus:border-brand/60"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            {error && (
              <div className="flex items-start gap-2 text-[11px] text-red-400 bg-red-500/10 rounded p-2">
                <AlertCircle size={13} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* 모델별 API 키 안내 */}
            {selectedModel === 'json2video/presentation' ? (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded p-2.5 text-[10px] text-indigo-300 space-y-1">
                <div className="font-semibold text-indigo-200">JSON2Video — 프레젠테이션 영상</div>
                <div>무료 600초 · 워터마크 포함 · 텍스트 슬라이드 영상 생성</div>
                <div>API 키: 관리자 → API 키 관리 → <strong>json2video</strong> 서비스로 등록</div>
                <a
                  href="https://json2video.com/get-api-key/"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-indigo-400 underline"
                >
                  무료 API 키 발급 →
                </a>
              </div>
            ) : (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 text-[10px] text-amber-400">
                API 키 필요: 관리자 → 외부 API 키 관리에서 <strong>huggingface</strong> 서비스로 HF 토큰을 등록하세요. 무료 티어 사용 가능.
              </div>
            )}

            {/* json2video 고급 템플릿 설정 */}
            {selectedModel === 'json2video/presentation' && (
              <div className="border border-indigo-500/20 rounded p-2.5 space-y-2" style={{ background: 'rgba(99,102,241,0.05)' }}>
                <p className="text-[10px] font-semibold text-indigo-300">고급 템플릿 설정</p>

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">템플릿 스타일</label>
                  <select
                    value={j2vConfig.template}
                    onChange={(e) => setJ2vConfig((p) => ({ ...p, template: e.target.value }))}
                    className="w-full bg-bg-base border border-bg-border rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-brand/60"
                  >
                    <option value="basic">기본형 — 타이틀 + 서브타이틀</option>
                    <option value="corporate">기업형 — 로고 인트로 + 타이틀 + 서브</option>
                    <option value="modern">모던형 — 풀스크린 대형 타이포그래피</option>
                  </select>
                </div>

                {j2vConfig.template === 'corporate' && (
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-1">로고 텍스트 (선택)</label>
                    <input
                      type="text"
                      value={j2vConfig.logo}
                      onChange={(e) => setJ2vConfig((p) => ({ ...p, logo: e.target.value }))}
                      placeholder="HAN Group"
                      className="w-full bg-bg-base border border-bg-border rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-brand/60 placeholder:text-slate-600"
                    />
                  </div>
                )}

                <div>
                  <label className="text-[10px] text-slate-500 block mb-1">배경 이미지 URL (선택)</label>
                  <input
                    type="text"
                    value={j2vConfig.bgImageUrl}
                    onChange={(e) => setJ2vConfig((p) => ({ ...p, bgImageUrl: e.target.value }))}
                    placeholder="https://example.com/bg.jpg"
                    className="w-full bg-bg-base border border-bg-border rounded text-xs text-slate-200 p-1.5 focus:outline-none focus:border-brand/60 placeholder:text-slate-600"
                  />
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={j2vConfig.bgm}
                    onChange={(e) => setJ2vConfig((p) => ({ ...p, bgm: e.target.checked }))}
                    className="accent-indigo-500"
                  />
                  <span className="text-[10px] text-slate-400">배경 음악 (BGM) 추가</span>
                </label>
              </div>
            )}

            <button
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || !selectedModel}
              className="w-full flex items-center justify-center gap-2 py-2 rounded text-xs font-medium bg-brand/80 hover:bg-brand text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <><Loader2 size={13} className="animate-spin" /> 요청 중...</>
              ) : (
                <><Plus size={13} /> 영상 생성</>
              )}
            </button>
          </div>
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[10px] text-slate-500">생성 기록</span>
            <button onClick={loadJobs} className="text-slate-500 hover:text-slate-300 transition-colors">
              <RefreshCw size={12} />
            </button>
          </div>
          {jobs.length === 0 && (
            <p className="text-center text-xs text-slate-600 py-8">생성된 영상이 없습니다</p>
          )}
          <div className="space-y-0">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => setSelected(job)}
                className={`w-full text-left px-3 py-2.5 border-b border-bg-border hover:bg-bg-elevated transition-colors ${
                  selected?.id === job.id ? 'bg-bg-elevated' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-medium ${STATUS_COLOR[job.status]}`}>
                    {STATUS_LABEL[job.status]}
                    {(job.status === 'pending' || job.status === 'running') && (
                      <Loader2 size={10} className="inline ml-1 animate-spin" />
                    )}
                    {(job.status === 'pending' || job.status === 'running') && (
                      <span className="text-[9px] text-slate-600 ml-1">{formatElapsed(job.created_at)}</span>
                    )}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(job) }}
                    className="text-slate-600 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <p className="text-xs text-slate-300 truncate">{job.prompt}</p>
                <p className="text-[10px] text-slate-600 mt-0.5">{new Date(job.created_at).toLocaleString('ko-KR')}</p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — preview */}
      <div className="flex-1 flex flex-col bg-bg-base">
        {selected ? (
          <div className="flex-1 flex flex-col p-6 gap-4">
            {/* Status bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {selected.status === 'done' && <CheckCircle size={16} className="text-green-400" />}
                {selected.status === 'failed' && <AlertCircle size={16} className="text-red-400" />}
                {(selected.status === 'pending' || selected.status === 'running') && (
                  <Loader2 size={16} className="text-blue-400 animate-spin" />
                )}
                <span className={`text-sm font-medium ${STATUS_COLOR[selected.status]}`}>
                  {STATUS_LABEL[selected.status]}
                </span>
              </div>
              <span className="text-xs text-slate-500">모델: {selected.model_id.split('/').pop()}</span>
            </div>

            {/* Prompt */}
            <div className="bg-bg-card border border-bg-border rounded p-3">
              <p className="text-[10px] text-slate-500 mb-1">프롬프트</p>
              <p className="text-xs text-slate-200">{selected.prompt}</p>
            </div>

            {/* Video player */}
            {selected.status === 'done' && selected.video_url && (
              <div className="flex-1 flex flex-col gap-2">
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <Play size={12} /> 생성된 영상
                </p>
                <div className="flex-1 bg-black rounded overflow-hidden flex items-center justify-center">
                  <video
                    key={selected.id}
                    src={selected.video_url}
                    controls
                    autoPlay
                    loop
                    className="max-h-full max-w-full rounded"
                  />
                </div>
                <a
                  href={selected.video_url}
                  download={`video_${selected.id}.mp4`}
                  className="self-start text-xs text-brand-light hover:underline"
                >
                  MP4 다운로드
                </a>
              </div>
            )}

            {/* Running state */}
            {(selected.status === 'pending' || selected.status === 'running') && (
              <div className="flex-1 flex flex-col justify-center gap-4 max-w-sm mx-auto w-full">
                <div className="flex items-center gap-2 text-sm text-slate-300">
                  <Loader2 size={16} className="animate-spin text-brand-light" />
                  <span>{selected.status === 'pending' ? '대기 중...' : '영상 생성 중...'}</span>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Clock size={12} />
                  <span>경과: {formatElapsed(selected.created_at)}</span>
                </div>

                {selected.status === 'running' && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>진행률 (예상)</span>
                      <span>{getProgress(selected)}%</span>
                    </div>
                    <div className="w-full bg-bg-border rounded-full h-1.5">
                      <div
                        className="bg-brand h-1.5 rounded-full transition-all duration-1000"
                        style={{ width: `${getProgress(selected)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-600">
                      예상 완료: 약 {EST_SECONDS[selected.provider] ?? 180}초 ({selected.provider})
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Failed */}
            {selected.status === 'failed' && (
              <div className="flex-1 flex flex-col items-center justify-center gap-3">
                <AlertCircle size={32} className="text-red-400" />
                <p className="text-sm text-red-400">생성 실패</p>
                <p className="text-xs text-slate-500 text-center max-w-sm">{selected.error_msg}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-slate-600">
            <Film size={48} strokeWidth={1} />
            <div className="text-center">
              <p className="text-sm text-slate-400">영상 스튜디오</p>
              <p className="text-xs mt-1">HuggingFace Inference API 무료 티어 사용</p>
              <p className="text-xs text-slate-600 mt-1">왼쪽에서 프롬프트를 입력하고 영상을 생성하세요</p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 max-w-sm w-full">
              {[
                'A majestic eagle soaring over mountain peaks',
                'A busy futuristic city with flying cars at night',
                'Waves crashing on a tropical beach at sunset',
              ].map((ex) => (
                <button
                  key={ex}
                  className="text-left text-xs text-slate-500 bg-bg-card border border-bg-border rounded px-3 py-2 hover:border-brand/40 hover:text-slate-300 transition-colors"
                  onClick={() => setPrompt(ex)}
                >
                  "{ex}"
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
