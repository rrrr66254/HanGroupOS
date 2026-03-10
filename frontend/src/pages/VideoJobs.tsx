import { useEffect, useRef, useState } from 'react'
import {
  Film, Trash2, RefreshCw, AlertCircle, CheckCircle,
  Loader2, Play, Download, Filter, Search, ExternalLink,
  Building2, BarChart2, Clock, TrendingUp, TrendingDown,
} from 'lucide-react'
import { videoApi, companiesApi } from '../api/client'
import { useNavigate } from 'react-router-dom'

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

interface Company {
  id: number
  name: string
}

interface VideoStats {
  total: number
  by_status: Record<string, number>
  by_model: Record<string, number>
  by_provider: Record<string, number>
  done_count: number
  failed_count: number
  success_rate: number
  avg_duration_sec: number | null
}

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  done: 'text-green-400',
  failed: 'text-red-400',
}
const STATUS_BG: Record<string, string> = {
  pending: 'bg-yellow-500/10 border-yellow-500/20',
  running: 'bg-blue-500/10 border-blue-500/20',
  done: 'bg-green-500/10 border-green-500/20',
  failed: 'bg-red-500/10 border-red-500/20',
}
const STATUS_LABEL: Record<string, string> = {
  pending: '대기 중',
  running: '생성 중',
  done: '완료',
  failed: '실패',
}

type StatusFilter = 'all' | 'pending' | 'running' | 'done' | 'failed'

export default function VideoJobs() {
  const [jobs, setJobs] = useState<VideoJob[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [stats, setStats] = useState<VideoStats | null>(null)
  const [statsOpen, setStatsOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [companyFilter, setCompanyFilter] = useState<number | undefined>(undefined)
  const [search, setSearch] = useState('')
  const [previewJob, setPreviewJob] = useState<VideoJob | null>(null)
  const [deleting, setDeleting] = useState<number | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const navigate = useNavigate()

  const loadStats = () => videoApi.stats().then((r) => setStats(r.data)).catch(() => {})

  const loadJobs = async () => {
    try {
      const r = await videoApi.jobs(companyFilter, 100)
      setJobs(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    companiesApi.list().then((r) => setCompanies(r.data))
    loadStats()
  }, [])

  useEffect(() => {
    setLoading(true)
    loadJobs()
    setSelectedIds(new Set())
  }, [companyFilter])

  useEffect(() => {
    loadJobs()
  }, [])

  // 활성 잡 폴링
  useEffect(() => {
    const hasActive = jobs.some((j) => j.status === 'pending' || j.status === 'running')
    if (hasActive) {
      pollRef.current = setInterval(loadJobs, 4000)
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [jobs])

  const handleDelete = async (job: VideoJob) => {
    setDeleting(job.id)
    try {
      await videoApi.deleteJob(job.id)
      if (previewJob?.id === job.id) setPreviewJob(null)
      setSelectedIds((prev) => { const s = new Set(prev); s.delete(job.id); return s })
      await Promise.all([loadJobs(), loadStats()])
    } finally {
      setDeleting(null)
    }
  }

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return
    setBatchDeleting(true)
    try {
      await videoApi.batchDelete(Array.from(selectedIds))
      if (previewJob && selectedIds.has(previewJob.id)) setPreviewJob(null)
      setSelectedIds(new Set())
      await Promise.all([loadJobs(), loadStats()])
    } finally {
      setBatchDeleting(false)
    }
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const filtered = jobs.filter((j) => {
    if (statusFilter !== 'all' && j.status !== statusFilter) return false
    if (search && !j.prompt.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every((j) => selectedIds.has(j.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const s = new Set(prev)
        filtered.forEach((j) => s.delete(j.id))
        return s
      })
    } else {
      setSelectedIds((prev) => {
        const s = new Set(prev)
        filtered.forEach((j) => s.add(j.id))
        return s
      })
    }
  }

  const counts: Record<string, number> = { all: jobs.length }
  for (const s of ['pending', 'running', 'done', 'failed']) {
    counts[s] = jobs.filter((j) => j.status === s).length
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleString('ko-KR')

  return (
    <div className="flex h-full">
      {/* Main list */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-bg-border bg-bg-card flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Film size={18} className="text-brand-light" />
            <h1 className="text-sm font-semibold text-slate-100">영상 잡 관리</h1>
            <span className="text-xs text-slate-500">({jobs.length}건)</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="프롬프트 검색..."
              className="w-full pl-7 pr-3 py-1.5 bg-bg-base border border-bg-border rounded text-xs text-slate-200 focus:outline-none focus:border-brand/60 placeholder:text-slate-600"
            />
          </div>

          {/* Company filter */}
          <div className="flex items-center gap-1.5">
            <Building2 size={12} className="text-slate-500" />
            <select
              value={companyFilter ?? ''}
              onChange={(e) => setCompanyFilter(e.target.value ? Number(e.target.value) : undefined)}
              className="bg-bg-base border border-bg-border rounded text-xs text-slate-200 px-2 py-1.5 focus:outline-none focus:border-brand/60"
            >
              <option value="">전체 회사</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            {selectedIds.size > 0 && (
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-40"
              >
                {batchDeleting
                  ? <><Loader2 size={11} className="animate-spin" /> 삭제 중...</>
                  : <><Trash2 size={11} /> 선택 삭제 ({selectedIds.size})</>
                }
              </button>
            )}
            <button
              onClick={loadJobs}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-bg-elevated transition-colors"
            >
              <RefreshCw size={12} /> 새로고침
            </button>
            <button
              onClick={() => navigate('/video-studio')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-brand/80 hover:bg-brand text-white transition-colors"
            >
              <Film size={12} /> 영상 생성
            </button>
          </div>
        </div>

        {/* Stats dashboard */}
        {statsOpen && stats && (
          <div className="px-6 py-3 border-b border-bg-border bg-bg-card/50">
            <div className="flex items-center gap-2 mb-2">
              <BarChart2 size={11} className="text-slate-500" />
              <span className="text-[10px] text-slate-500 font-medium">통계 대시보드</span>
              <button
                onClick={() => setStatsOpen(false)}
                className="ml-auto text-[10px] text-slate-600 hover:text-slate-400"
              >접기</button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {/* 전체 잡 */}
              <div className="bg-bg-base border border-bg-border rounded p-2.5">
                <p className="text-[10px] text-slate-500">전체 잡</p>
                <p className="text-lg font-bold text-slate-100 mt-0.5">{stats.total}</p>
              </div>
              {/* 완료 */}
              <div className="bg-green-500/5 border border-green-500/15 rounded p-2.5">
                <p className="text-[10px] text-green-500">완료</p>
                <p className="text-lg font-bold text-green-400 mt-0.5">{stats.done_count}</p>
              </div>
              {/* 실패 */}
              <div className="bg-red-500/5 border border-red-500/15 rounded p-2.5">
                <p className="text-[10px] text-red-500">실패</p>
                <p className="text-lg font-bold text-red-400 mt-0.5">{stats.failed_count}</p>
              </div>
              {/* 성공률 */}
              <div className="bg-bg-base border border-bg-border rounded p-2.5">
                <div className="flex items-center gap-1">
                  {stats.success_rate >= 50
                    ? <TrendingUp size={10} className="text-green-400" />
                    : <TrendingDown size={10} className="text-red-400" />
                  }
                  <p className="text-[10px] text-slate-500">성공률</p>
                </div>
                <p className={`text-lg font-bold mt-0.5 ${stats.success_rate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                  {stats.success_rate}%
                </p>
              </div>
              {/* 평균 생성 시간 */}
              <div className="bg-bg-base border border-bg-border rounded p-2.5">
                <div className="flex items-center gap-1">
                  <Clock size={10} className="text-slate-500" />
                  <p className="text-[10px] text-slate-500">평균 시간</p>
                </div>
                <p className="text-sm font-bold text-slate-200 mt-0.5">
                  {stats.avg_duration_sec != null
                    ? stats.avg_duration_sec >= 60
                      ? `${Math.floor(stats.avg_duration_sec / 60)}분 ${stats.avg_duration_sec % 60}초`
                      : `${stats.avg_duration_sec}초`
                    : '—'}
                </p>
              </div>
              {/* 최다 사용 모델 */}
              <div className="bg-bg-base border border-bg-border rounded p-2.5 col-span-1">
                <p className="text-[10px] text-slate-500">최다 사용 모델</p>
                {Object.keys(stats.by_model).length > 0 ? (
                  <p className="text-[10px] font-semibold text-brand-light mt-0.5 truncate">
                    {Object.entries(stats.by_model).sort(([, a], [, b]) => b - a)[0]?.[0]?.split('/').pop()}
                    <span className="text-slate-500 ml-1">
                      ({Object.entries(stats.by_model).sort(([, a], [, b]) => b - a)[0]?.[1]}회)
                    </span>
                  </p>
                ) : <p className="text-[10px] text-slate-600 mt-0.5">—</p>}
                {/* 프로바이더 분포 */}
                <div className="flex gap-1 mt-1.5">
                  {Object.entries(stats.by_provider).map(([p, c]) => (
                    <span key={p} className="text-[9px] text-slate-500 bg-bg-border rounded px-1">
                      {p.replace('-', '')}:{c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        {!statsOpen && (
          <div className="px-6 py-1.5 border-b border-bg-border bg-bg-card/50 flex items-center gap-2">
            <BarChart2 size={11} className="text-slate-600" />
            <button onClick={() => setStatsOpen(true)} className="text-[10px] text-slate-600 hover:text-slate-400">
              통계 대시보드 펼치기
            </button>
          </div>
        )}

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-bg-border bg-bg-card">
          <Filter size={11} className="text-slate-600 mr-1" />
          {(['all', 'running', 'pending', 'done', 'failed'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors border ${
                statusFilter === s
                  ? s === 'all'
                    ? 'bg-brand/20 text-brand-light border-brand/30'
                    : `${STATUS_BG[s]} ${STATUS_COLOR[s]} border-current`
                  : 'text-slate-500 border-transparent hover:text-slate-300'
              }`}
            >
              {s === 'all' ? '전체' : STATUS_LABEL[s]}
              <span className="ml-1 opacity-70">({counts[s] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* Job table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-600">
              <Film size={32} strokeWidth={1} />
              <p className="text-sm">조건에 맞는 영상 잡이 없습니다</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bg-border text-left">
                  <th className="px-3 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="accent-brand"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium w-10">#</th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium">프롬프트</th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium w-28">모델</th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium w-20">상태</th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium w-36">생성 시간</th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium w-36">완료 시간</th>
                  <th className="px-3 py-2.5 text-[10px] text-slate-500 font-medium w-28 text-right">액션</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((job) => (
                  <tr
                    key={job.id}
                    onClick={() => setPreviewJob(previewJob?.id === job.id ? null : job)}
                    className={`border-b border-bg-border cursor-pointer transition-colors ${
                      previewJob?.id === job.id ? 'bg-bg-elevated' : 'hover:bg-bg-elevated/50'
                    } ${selectedIds.has(job.id) ? 'bg-brand/5' : ''}`}
                  >
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(job.id)}
                        onChange={() => toggleSelect(job.id)}
                        className="accent-brand"
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-500">{job.id}</td>
                    <td className="px-3 py-3 text-slate-200 max-w-0">
                      <p className="truncate">{job.prompt}</p>
                      {job.status === 'failed' && job.error_msg && (
                        <p className="text-[10px] text-red-400 truncate mt-0.5">{job.error_msg}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-400">
                      {job.model_id.split('/').pop()}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`flex items-center gap-1 ${STATUS_COLOR[job.status]}`}>
                        {(job.status === 'pending' || job.status === 'running') && (
                          <Loader2 size={10} className="animate-spin" />
                        )}
                        {job.status === 'done' && <CheckCircle size={10} />}
                        {job.status === 'failed' && <AlertCircle size={10} />}
                        {STATUS_LABEL[job.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-500">{formatDate(job.created_at)}</td>
                    <td className="px-3 py-3 text-slate-500">
                      {job.finished_at ? formatDate(job.finished_at) : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {job.status === 'done' && job.video_url && (
                          <>
                            <button
                              onClick={() => setPreviewJob(job)}
                              className="p-1.5 rounded text-slate-500 hover:text-green-400 hover:bg-green-500/10 transition-colors"
                              title="미리보기"
                            >
                              <Play size={12} />
                            </button>
                            <a
                              href={job.video_url}
                              download={`video_${job.id}.mp4`}
                              className="p-1.5 rounded text-slate-500 hover:text-brand-light hover:bg-brand/10 transition-colors"
                              title="다운로드"
                            >
                              <Download size={12} />
                            </a>
                          </>
                        )}
                        <button
                          onClick={() => navigate('/video-studio')}
                          className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-bg-elevated transition-colors"
                          title="스튜디오에서 보기"
                        >
                          <ExternalLink size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(job)}
                          disabled={deleting === job.id}
                          className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                          title="삭제"
                        >
                          {deleting === job.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right preview panel */}
      {previewJob && (
        <div className="w-96 border-l border-bg-border flex flex-col bg-bg-card">
          <div className="px-4 py-3 border-b border-bg-border flex items-center justify-between">
            <span className="text-xs font-medium text-slate-200">미리보기 #{previewJob.id}</span>
            <button
              onClick={() => setPreviewJob(null)}
              className="text-slate-500 hover:text-slate-300 text-xs"
            >
              닫기
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {/* Status */}
            <div className={`flex items-center gap-2 px-3 py-2 rounded border text-xs ${STATUS_BG[previewJob.status]} ${STATUS_COLOR[previewJob.status]}`}>
              {previewJob.status === 'done' && <CheckCircle size={13} />}
              {previewJob.status === 'failed' && <AlertCircle size={13} />}
              {(previewJob.status === 'pending' || previewJob.status === 'running') && (
                <Loader2 size={13} className="animate-spin" />
              )}
              {STATUS_LABEL[previewJob.status]}
            </div>

            {/* Prompt */}
            <div className="bg-bg-base border border-bg-border rounded p-3">
              <p className="text-[10px] text-slate-500 mb-1">프롬프트</p>
              <p className="text-xs text-slate-200 leading-relaxed">{previewJob.prompt}</p>
            </div>

            {/* Meta */}
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-bg-base rounded p-2">
                <p className="text-slate-500 mb-0.5">모델</p>
                <p className="text-slate-300">{previewJob.model_id.split('/').pop()}</p>
              </div>
              <div className="bg-bg-base rounded p-2">
                <p className="text-slate-500 mb-0.5">Provider</p>
                <p className="text-slate-300">{previewJob.provider}</p>
              </div>
              <div className="bg-bg-base rounded p-2">
                <p className="text-slate-500 mb-0.5">생성 시간</p>
                <p className="text-slate-300">{formatDate(previewJob.created_at)}</p>
              </div>
              <div className="bg-bg-base rounded p-2">
                <p className="text-slate-500 mb-0.5">완료 시간</p>
                <p className="text-slate-300">{previewJob.finished_at ? formatDate(previewJob.finished_at) : '—'}</p>
              </div>
            </div>

            {/* Video player */}
            {previewJob.status === 'done' && previewJob.video_url && (
              <div className="space-y-2">
                <p className="text-[10px] text-slate-500">생성된 영상</p>
                <div className="bg-black rounded overflow-hidden aspect-video flex items-center justify-center">
                  <video
                    key={previewJob.id}
                    src={previewJob.video_url}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                  />
                </div>
                <a
                  href={previewJob.video_url}
                  download={`video_${previewJob.id}.mp4`}
                  className="flex items-center gap-1.5 text-xs text-brand-light hover:underline"
                >
                  <Download size={12} /> MP4 다운로드
                </a>
              </div>
            )}

            {/* Error */}
            {previewJob.status === 'failed' && previewJob.error_msg && (
              <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                <p className="text-[10px] text-red-400 font-medium mb-1">오류 메시지</p>
                <p className="text-xs text-red-300">{previewJob.error_msg}</p>
              </div>
            )}

            {/* Running indicator */}
            {(previewJob.status === 'pending' || previewJob.status === 'running') && (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Loader2 size={24} className="animate-spin text-blue-400" />
                <p className="text-xs text-slate-400">
                  {previewJob.status === 'pending' ? '큐 대기 중...' : '영상 생성 중...'}
                </p>
                <p className="text-[10px] text-slate-600">영상 스튜디오에서 실시간 진행률을 확인하세요</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
