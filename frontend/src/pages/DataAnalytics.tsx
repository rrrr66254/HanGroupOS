import { useEffect, useRef, useState } from 'react'
import {
  Database, TrendingUp, Download, RefreshCw, Loader,
  Globe, Hash, Building2, Calendar, Activity, GitBranch,
  ShieldCheck, Trash2, Copy, Zap, AlertTriangle, Plus, Settings2, X,
  CheckCircle, XCircle, AlertCircle, Edit2, Check, Upload, FileDown, Tags,
} from 'lucide-react'
import { dataApi, companiesApi, policyApi } from '../api/client'
import type { Company } from '../types'

interface QualityReport {
  total: number
  by_status: Record<string, number>
  by_flag: Record<string, number>
  hashed: number
  unhashed: number
  stale_raw: number
  duplicate_hash_groups: number
  source_usage: { source: string; count: number; limit: number | null; usage_pct: number | null }[]
  avg_relevance_score: number | null
  policy: { raw_retention_days: number; processed_retention_days: number; min_content_length: number }
}

interface DataStats {
  total: number
  today: number
  by_type: Record<string, number>
  by_source: Record<string, number>
  by_company: Record<string, number>
  daily_7days: { date: string; count: number }[]
}

interface FlowNode {
  id: string
  label: string
  group: 'source' | 'type' | 'strategy'
  value: number
}

interface FlowLink {
  source: string
  target: string
  value: number
}

interface DataFlow {
  nodes: FlowNode[]
  links: FlowLink[]
  summary: {
    total_collected: number
    source_count: number
    type_count: number
    strategy_items: number
  }
}

// ── 간이 Sankey 차트 (SVG 없이 CSS로 구현) ────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  source: 'bg-blue-500/20 border-blue-500/40 text-blue-300',
  type: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
  strategy: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
}

const GROUP_FLOW_COLOR: Record<string, string> = {
  source: 'bg-blue-400/20',
  type: 'bg-purple-400/20',
  strategy: 'bg-emerald-400/20',
}

function FlowDiagram({ flow }: { flow: DataFlow }) {
  const sourceNodes = flow.nodes.filter((n) => n.group === 'source')
  const typeNodes = flow.nodes.filter((n) => n.group === 'type')
  const strategyNodes = flow.nodes.filter((n) => n.group === 'strategy')

  const maxVal = Math.max(...flow.nodes.map((n) => n.value), 1)

  const getLinkVolume = (sourceId: string, targetId: string) =>
    flow.links
      .filter((l) => l.source === sourceId && l.target === targetId)
      .reduce((s, l) => s + l.value, 0)

  const getNodeTotal = (nodeId: string) =>
    flow.links.filter((l) => l.source === nodeId || l.target === nodeId).reduce((s, l) => s + l.value, 0)

  const renderColumn = (nodes: FlowNode[], label: string) => (
    <div className="flex-1 flex flex-col gap-2">
      <div className="text-[10px] text-slate-500 text-center mb-1 font-medium uppercase tracking-wide">{label}</div>
      {nodes.length === 0 ? (
        <div className="text-[10px] text-slate-600 text-center py-4">데이터 없음</div>
      ) : (
        nodes.map((node) => {
          const total = node.value || getNodeTotal(node.id)
          const pct = Math.max(4, (total / maxVal) * 100)
          return (
            <div
              key={node.id}
              className={`relative rounded border px-2 py-1.5 text-center transition-all ${GROUP_COLORS[node.group]}`}
              style={{ opacity: total > 0 ? 1 : 0.4 }}
            >
              <div className="text-[10px] font-medium leading-tight">{node.label}</div>
              {total > 0 && (
                <div className="text-[9px] opacity-70 mt-0.5">{total}건</div>
              )}
              {/* 볼륨 바 */}
              <div className="absolute bottom-0 left-0 h-0.5 rounded-b transition-all" style={{ width: `${pct}%`, background: 'currentColor', opacity: 0.4 }} />
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        {/* 흐름 화살표 */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {renderColumn(sourceNodes, '데이터 소스')}
          <div className="flex flex-col items-center text-slate-600 text-base px-1">→</div>
          {renderColumn(typeNodes, '데이터 유형')}
          <div className="flex flex-col items-center text-slate-600 text-base px-1">→</div>
          {renderColumn(strategyNodes, '전략 아이템')}
        </div>
      </div>

      {/* 연결 강도 TOP 5 */}
      {flow.links.length > 0 && (
        <div className="mt-3 border-t border-bg-border pt-3">
          <div className="text-[10px] text-slate-500 mb-2">주요 데이터 흐름 (TOP 5)</div>
          <div className="space-y-1">
            {flow.links
              .sort((a, b) => b.value - a.value)
              .slice(0, 5)
              .map((link, i) => {
                const srcNode = flow.nodes.find((n) => n.id === link.source)
                const tgtNode = flow.nodes.find((n) => n.id === link.target)
                const maxLink = flow.links[0]?.value || 1
                return (
                  <div key={i} className="flex items-center gap-2 text-[10px]">
                    <span className="text-blue-300 w-20 truncate">{srcNode?.label || link.source}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-purple-300 w-20 truncate">{tgtNode?.label || link.target}</span>
                    <div className="flex-1 bg-bg-elevated rounded-full h-1">
                      <div
                        className="h-1 rounded-full bg-brand/50"
                        style={{ width: `${(link.value / maxLink) * 100}%` }}
                      />
                    </div>
                    <span className="text-slate-500 w-8 text-right">{link.value}</span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  hackernews: '🟠 HackerNews',
  worldbank: '🌍 World Bank',
  reddit: '🔴 Reddit',
  dart: '🇰🇷 DART',
  ecos: '🏦 ECOS',
  kosis: '📊 KOSIS',
  fred: '🇺🇸 FRED',
  alphavantage: '📈 Alpha Vantage',
  serpapi: '🔍 SerpAPI',
  newsapi: '📰 NewsAPI',
  google_news_rss_free: '📡 Google News RSS',
  un_comtrade: '🤝 UN Comtrade',
  auto: '🤖 자동수집',
}

const TYPE_COLORS: Record<string, string> = {
  news: 'bg-blue-500/20 text-blue-300',
  tech_trend: 'bg-purple-500/20 text-purple-300',
  economic: 'bg-green-500/20 text-green-300',
  community: 'bg-orange-500/20 text-orange-300',
  disclosure: 'bg-red-500/20 text-red-300',
  stock: 'bg-yellow-500/20 text-yellow-300',
  web_search: 'bg-cyan-500/20 text-cyan-300',
  trade: 'bg-indigo-500/20 text-indigo-300',
  scraped: 'bg-slate-500/20 text-slate-300',
  rss: 'bg-pink-500/20 text-pink-300',
  statistics: 'bg-teal-500/20 text-teal-300',
}

const FREE_SOURCES = [
  { id: 'hackernews', label: 'HackerNews 트렌드', desc: '글로벌 테크 스토리', countKey: 'stories', action: () => dataApi.collectHackernews({ limit: 15, save: true }) },
  { id: 'worldbank', label: 'World Bank GDP', desc: '한국 GDP 성장률', countKey: 'data', action: () => dataApi.collectWorldBank({ indicator: 'NY.GDP.MKTP.KD.ZG', country: 'KR', save: true }) },
  { id: 'reddit_tech', label: 'Reddit /r/technology', desc: '기술 커뮤니티 트렌드', countKey: 'posts', action: () => dataApi.collectReddit({ subreddit: 'technology', limit: 20, save: true }) },
  { id: 'reddit_startup', label: 'Reddit /r/startups', desc: '스타트업 동향', countKey: 'posts', action: () => dataApi.collectReddit({ subreddit: 'startups', limit: 15, save: true }) },
]

// KOSIS requires API key — separate section
const KOSIS_PRESETS = [
  { id: 'kosis_employment', label: '경제활동인구', desc: '고용률·실업률', tbl_id: 'DT_1DA7003S', org_id: '101' },
  { id: 'kosis_population', label: '주민등록인구', desc: '월별 인구 현황', tbl_id: 'DT_1B04005N', org_id: '101' },
  { id: 'kosis_cpi', label: '소비자물가지수', desc: 'CPI 통계', tbl_id: 'DT_301001_C01', org_id: '301' },
]

export default function DataAnalytics() {
  const [stats, setStats] = useState<DataStats | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState<string | null>(null)
  const [collectResults, setCollectResults] = useState<Record<string, { count: number; ts: number }>>({})
  const [autoTagging, setAutoTagging] = useState(false)
  const [autoTagResult, setAutoTagResult] = useState<{ tagged: number; skipped: number } | null>(null)
  const [exportCompany, setExportCompany] = useState('')
  const [exporting, setExporting] = useState(false)
  const [kosisCollecting, setKosisCollecting] = useState<string | null>(null)
  const [kosisResult, setKosisResult] = useState<{ id: string; count: number; title: string } | null>(null)
  const [flow, setFlow] = useState<DataFlow | null>(null)
  const [flowLoading, setFlowLoading] = useState(false)
  const [flowCompany, setFlowCompany] = useState('')
  const [quality, setQuality] = useState<QualityReport | null>(null)
  const [qualityLoading, setQualityLoading] = useState(false)
  const [qualityAction, setQualityAction] = useState<string | null>(null)
  const [qualityMsg, setQualityMsg] = useState<string | null>(null)
  const [cleanupDays, setCleanupDays] = useState(30)

  // 정책 관리 상태
  const [policies, setPolicies] = useState<{id:number;source:string;company_id:number|null;max_records:number|null;retention_days:number|null;is_active:boolean;memo:string}[]>([])
  const [policyLoading, setPolicyLoading] = useState(false)
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [policyForm, setPolicyForm] = useState({ source: '', company_id: '', max_records: '', retention_days: '', memo: '' })
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [editPolicyId, setEditPolicyId] = useState<number | null>(null)
  const [editPolicyForm, setEditPolicyForm] = useState({ max_records: '', retention_days: '', memo: '' })
  const importRef = useRef<HTMLInputElement>(null)

  // 소스 상태 모니터링
  interface SourceStatus { id: number; source: string; consecutive_failures: number; total_failures: number; total_successes: number; last_success_at: string | null; last_failure_at: string | null; last_error: string; health: string }
  const [sourceStatuses, setSourceStatuses] = useState<SourceStatus[]>([])
  const [sourceStatusLoading, setSourceStatusLoading] = useState(false)

  const loadSourceStatus = async () => {
    setSourceStatusLoading(true)
    try {
      const r = await policyApi.sourceStatus()
      setSourceStatuses(r.data)
    } finally {
      setSourceStatusLoading(false)
    }
  }

  const loadPolicies = async () => {
    setPolicyLoading(true)
    try {
      const r = await policyApi.list()
      setPolicies(r.data)
    } finally {
      setPolicyLoading(false)
    }
  }

  const handleExportPolicies = async () => {
    const r = await policyApi.exportJson()
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `han_policies_${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportPolicies = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const json = JSON.parse(text)
      const policiesArr = json.policies || json
      await policyApi.importJson({ policies: policiesArr })
      await loadPolicies()
    } catch {
      alert('정책 파일 형식이 올바르지 않습니다.')
    }
    if (importRef.current) importRef.current.value = ''
  }

  const startEditPolicy = (p: typeof policies[0]) => {
    setEditPolicyId(p.id)
    setEditPolicyForm({ max_records: p.max_records != null ? String(p.max_records) : '', retention_days: p.retention_days != null ? String(p.retention_days) : '', memo: p.memo })
  }

  const saveEditPolicy = async (id: number) => {
    await policyApi.patch(id, {
      max_records: editPolicyForm.max_records ? parseInt(editPolicyForm.max_records) : null,
      retention_days: editPolicyForm.retention_days ? parseInt(editPolicyForm.retention_days) : null,
      memo: editPolicyForm.memo,
    })
    setEditPolicyId(null)
    await loadPolicies()
  }

  const loadStats = async () => {
    setLoading(true)
    try {
      const r = await dataApi.stats()
      setStats(r.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStats()
    companiesApi.list().then((r) => setCompanies(r.data))
    loadSourceStatus()
  }, [])

  const runCollect = async (id: string, action: () => Promise<{ data: Record<string, unknown> }>, countKey?: string) => {
    setCollecting(id)
    try {
      const r = await action()
      const count = countKey
        ? ((r.data[countKey] as unknown[])?.length ?? (r.data['item_count'] as number) ?? 0)
        : 0
      setCollectResults((prev) => ({ ...prev, [id]: { count, ts: Date.now() } }))
      await loadStats()
    } finally {
      setCollecting(null)
    }
  }

  const runAutoTag = async () => {
    setAutoTagging(true)
    setAutoTagResult(null)
    try {
      const r = await dataApi.autoTag({ limit: 20 })
      setAutoTagResult(r.data)
    } finally {
      setAutoTagging(false)
    }
  }

  const loadQuality = async () => {
    setQualityLoading(true)
    try {
      const r = await dataApi.quality()
      setQuality(r.data)
    } finally {
      setQualityLoading(false)
    }
  }

  const runQualityAction = async (action: 'cleanup' | 'dedup' | 'hash') => {
    setQualityAction(action)
    setQualityMsg(null)
    try {
      let r
      if (action === 'cleanup') r = await dataApi.cleanup(cleanupDays)
      else if (action === 'dedup') r = await dataApi.dedup()
      else r = await dataApi.hashAll(2000)
      setQualityMsg(r.data.message)
      await loadQuality()
      await loadStats()
    } finally {
      setQualityAction(null)
    }
  }

  const loadFlow = async (companyId?: number) => {
    setFlowLoading(true)
    try {
      const r = await dataApi.flow(companyId)
      setFlow(r.data)
    } finally {
      setFlowLoading(false)
    }
  }

  const runKosis = async (preset: typeof KOSIS_PRESETS[0]) => {
    setKosisCollecting(preset.id)
    setKosisResult(null)
    try {
      const r = await dataApi.collectKosis({ org_id: preset.org_id, tbl_id: preset.tbl_id, save: true })
      const d = r.data
      if (d.requires_key) {
        setKosisResult({ id: preset.id, count: -1, title: 'KOSIS API 키 필요' })
      } else {
        setKosisResult({ id: preset.id, count: d.total || 0, title: preset.label })
        await loadStats()
      }
    } finally {
      setKosisCollecting(null)
    }
  }

  const exportData = async () => {
    if (!exportCompany) return
    setExporting(true)
    try {
      const r = await dataApi.export(parseInt(exportCompany))
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const company = companies.find((c) => c.id === parseInt(exportCompany))
      a.download = `han_group_data_${company?.name || exportCompany}_${new Date().toISOString().slice(0, 10)}.json`
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const maxDaily = stats ? Math.max(...stats.daily_7days.map((d) => d.count), 1) : 1

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database size={20} className="text-brand-light" />
          <div>
            <h2 className="text-base font-semibold text-slate-100">데이터 분석 대시보드</h2>
            <p className="text-xs text-slate-500">수집·처리·활용 현황 모니터링</p>
          </div>
        </div>
        <button onClick={loadStats} disabled={loading} className="btn-ghost flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          새로고침
        </button>
      </div>

      {loading && !stats ? (
        <div className="card p-12 flex items-center justify-center gap-3 text-slate-500">
          <Loader size={20} className="animate-spin" />
          <span className="text-sm">통계 로딩 중...</span>
        </div>
      ) : stats ? (
        <>
          {/* 주요 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                <Database size={12} /> 전체 수집량
              </div>
              <div className="text-2xl font-bold text-slate-100">{stats.total.toLocaleString()}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">누적 데이터</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                <Calendar size={12} /> 금일 수집
              </div>
              <div className="text-2xl font-bold text-brand-light">{stats.today.toLocaleString()}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">오늘 수집된 데이터</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                <Hash size={12} /> 데이터 유형
              </div>
              <div className="text-2xl font-bold text-success">{Object.keys(stats.by_type).length}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">종류</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500 mb-1 flex items-center gap-1.5">
                <Globe size={12} /> 데이터 소스
              </div>
              <div className="text-2xl font-bold text-accent">{Object.keys(stats.by_source).length}</div>
              <div className="text-[10px] text-slate-600 mt-0.5">연동 소스</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 최근 7일 트렌드 */}
            <div className="card p-4 lg:col-span-2">
              <h3 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                <Activity size={12} /> 최근 7일 수집 추이
              </h3>
              <div className="flex items-end gap-2 h-24">
                {stats.daily_7days.map((d) => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-[9px] text-slate-500">{d.count}</div>
                    <div
                      className="w-full bg-brand/40 rounded-sm transition-all"
                      style={{ height: `${Math.max(4, (d.count / maxDaily) * 80)}px` }}
                    />
                    <div className="text-[9px] text-slate-600 rotate-0">{d.date.slice(5)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 타입별 분포 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-400 mb-3">데이터 유형별</h3>
              <div className="space-y-2">
                {Object.entries(stats.by_type)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${TYPE_COLORS[type] || 'bg-slate-500/20 text-slate-400'}`}>
                        {type}
                      </span>
                      <div className="flex-1 bg-bg-elevated rounded-full h-1.5">
                        <div
                          className="h-1.5 rounded-full bg-brand/60"
                          style={{ width: `${Math.min(100, (count / stats.total) * 100 * 5)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 w-6 text-right">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 소스별 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                <Globe size={12} /> 소스별 수집량 (TOP 10)
              </h3>
              <div className="space-y-1.5">
                {Object.entries(stats.by_source).map(([src, count]) => (
                  <div key={src} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 w-32 truncate">
                      {SOURCE_LABELS[src] || src}
                    </span>
                    <div className="flex-1 bg-bg-elevated rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-success/60"
                        style={{
                          width: `${(count / Math.max(...Object.values(stats.by_source))) * 100}%`
                        }}
                      />
                    </div>
                    <span className="text-slate-500 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 회사별 */}
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-1.5">
                <Building2 size={12} /> 회사별 수집량 (TOP 10)
              </h3>
              {Object.keys(stats.by_company).length === 0 ? (
                <div className="text-xs text-slate-600 py-4 text-center">회사별 데이터 없음</div>
              ) : (
                <div className="space-y-1.5">
                  {Object.entries(stats.by_company).map(([cid, count]) => {
                    const company = companies.find((c) => c.id === parseInt(cid))
                    return (
                      <div key={cid} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 w-28 truncate">
                          {company?.name || `회사 #${cid}`}
                        </span>
                        <div className="flex-1 bg-bg-elevated rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full bg-accent/60"
                            style={{
                              width: `${(count / Math.max(...Object.values(stats.by_company).map(Number))) * 100}%`
                            }}
                          />
                        </div>
                        <span className="text-slate-500 w-6 text-right">{count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {/* 무료 데이터 소스 즉시 수집 */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
          <TrendingUp size={15} className="text-success" />
          무료 데이터 즉시 수집
          <span className="text-[10px] text-slate-500 font-normal ml-auto">키 불필요 소스</span>
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FREE_SOURCES.map((src) => {
            const result = collectResults[src.id]
            const isRecent = result && Date.now() - result.ts < 60000
            return (
              <button
                key={src.id}
                onClick={() => runCollect(src.id, src.action as () => Promise<{ data: Record<string, unknown> }>, src.countKey)}
                disabled={collecting !== null}
                className={`p-3 rounded-lg border bg-bg-elevated transition-all text-left ${
                  isRecent
                    ? 'border-success/40 bg-success/5'
                    : 'border-bg-border hover:border-success/40 hover:bg-success/5'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  {collecting === src.id ? (
                    <Loader size={13} className="animate-spin text-success" />
                  ) : isRecent ? (
                    <CheckCircle size={13} className="text-success" />
                  ) : (
                    <div className="text-success text-base leading-none">+</div>
                  )}
                  {isRecent && result.count > 0 && (
                    <span className="text-[10px] text-success font-medium">{result.count}개</span>
                  )}
                </div>
                <div className="text-xs font-medium text-slate-200">{src.label}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{src.desc}</div>
                {isRecent && (
                  <div className="text-[9px] text-success/70 mt-1">✓ 방금 수집됨</div>
                )}
              </button>
            )
          })}
        </div>
        {Object.keys(collectResults).length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500">
            <CheckCircle size={10} className="text-success" />
            수집 완료. 아래 「데이터 품질 관리」→ AI 자동 태깅으로 분류하거나, 「데이터 흐름 관계도」로 확인하세요.
          </div>
        )}
      </div>

      {/* 데이터 관계 시각화 */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <GitBranch size={15} className="text-brand-light" />
            데이터 흐름 관계도
          </h3>
          <div className="flex items-center gap-2">
            <select
              className="input text-xs h-7 py-0"
              value={flowCompany}
              onChange={(e) => setFlowCompany(e.target.value)}
            >
              <option value="">전체</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => loadFlow(flowCompany ? parseInt(flowCompany) : undefined)}
              disabled={flowLoading}
              className="btn-ghost flex items-center gap-1 text-xs h-7"
            >
              {flowLoading ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              분석
            </button>
          </div>
        </div>

        {!flow && !flowLoading ? (
          <div className="py-8 flex flex-col items-center gap-2 text-slate-500">
            <GitBranch size={24} className="opacity-30" />
            <p className="text-xs">「분석」 버튼을 눌러 데이터 흐름을 시각화하세요</p>
            <p className="text-[10px] text-slate-600">소스 → 유형 → 전략 아이템 연결 관계를 표시합니다</p>
          </div>
        ) : flowLoading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-slate-500">
            <Loader size={16} className="animate-spin" />
            <span className="text-sm">데이터 흐름 분석 중...</span>
          </div>
        ) : flow ? (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: '수집 데이터', value: flow.summary.total_collected, color: 'text-blue-300' },
                { label: '데이터 소스', value: flow.summary.source_count, color: 'text-blue-300' },
                { label: '데이터 유형', value: flow.summary.type_count, color: 'text-purple-300' },
                { label: '전략 아이템', value: flow.summary.strategy_items, color: 'text-emerald-300' },
              ].map((item) => (
                <div key={item.label} className="bg-bg-elevated rounded-lg p-2 text-center">
                  <div className={`text-lg font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-[9px] text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>
            <FlowDiagram flow={flow} />
          </>
        ) : null}
      </div>

      {/* KOSIS 국가통계포털 */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-1 flex items-center gap-2">
          <span className="text-teal-400">📊</span>
          KOSIS 국가통계포털
          <span className="text-[10px] text-slate-500 font-normal ml-auto">API 키 필요 (무료 발급)</span>
        </h3>
        <p className="text-[10px] text-slate-500 mb-3">
          인구·고용·물가 등 한국 공식 국가통계 수집.{' '}
          <a href="https://kosis.kr/openapi/" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">
            kosis.kr/openapi
          </a>에서 무료 키 발급 후 관리자 &gt; 외부 API 키에 등록하세요.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {KOSIS_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => runKosis(preset)}
              disabled={kosisCollecting !== null}
              className="p-3 rounded-lg border border-bg-border bg-bg-elevated hover:border-teal-500/40 hover:bg-teal-500/5 transition-all text-left"
            >
              {kosisCollecting === preset.id ? (
                <Loader size={13} className="animate-spin text-teal-400 mb-2" />
              ) : (
                <div className="text-teal-400 text-base mb-1">📊</div>
              )}
              <div className="text-xs font-medium text-slate-200">{preset.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{preset.desc}</div>
              {kosisResult?.id === preset.id && (
                <div className={`text-[10px] mt-1.5 font-medium ${kosisResult.count < 0 ? 'text-amber-400' : 'text-teal-400'}`}>
                  {kosisResult.count < 0 ? '🔑 키 필요' : `✓ ${kosisResult.count}건 수집`}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 데이터 내보내기 */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-100 mb-3 flex items-center gap-2">
          <Download size={15} className="text-accent" />
          데이터 내보내기 (JSON)
        </h3>
        <div className="flex gap-3">
          <select
            className="input flex-1"
            value={exportCompany}
            onChange={(e) => setExportCompany(e.target.value)}
          >
            <option value="">회사 선택</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={exportData}
            disabled={!exportCompany || exporting}
            className="btn-primary flex items-center gap-1.5"
          >
            {exporting ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
            JSON 다운로드
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">
          최대 500건의 수집 데이터를 JSON 형식으로 내보냅니다.
        </p>
      </div>

      {/* 데이터 품질 관리 */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck size={15} className="text-success" />
            데이터 품질 관리
          </h3>
          <button
            onClick={loadQuality}
            disabled={qualityLoading}
            className="btn-ghost flex items-center gap-1 text-xs h-7"
          >
            {qualityLoading ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            리포트
          </button>
        </div>

        {/* 즉시 실행 액션 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* AI 자동 태깅 */}
          <button
            onClick={runAutoTag}
            disabled={autoTagging || qualityAction !== null}
            className={`p-3 rounded-lg border transition-all text-left ${
              autoTagResult
                ? 'border-purple-500/40 bg-purple-500/5'
                : 'border-bg-border bg-bg-elevated hover:border-purple-500/40 hover:bg-purple-500/5'
            }`}
          >
            {autoTagging ? (
              <Loader size={13} className="animate-spin text-purple-400 mb-2" />
            ) : autoTagResult ? (
              <CheckCircle size={13} className="text-purple-400 mb-2" />
            ) : (
              <Tags size={13} className="text-purple-400 mb-2" />
            )}
            <div className="text-xs font-medium text-slate-200">AI 자동 태깅</div>
            {autoTagResult ? (
              <div className="text-[10px] text-purple-300 mt-0.5">✓ {autoTagResult.tagged}개 태깅됨</div>
            ) : (
              <div className="text-[10px] text-slate-500 mt-0.5">산업·감성·키워드 자동 분류</div>
            )}
          </button>

          {/* 중복 제거 */}
          <button
            onClick={() => runQualityAction('dedup')}
            disabled={qualityAction !== null || autoTagging}
            className="p-3 rounded-lg border border-bg-border bg-bg-elevated hover:border-brand/40 hover:bg-brand/5 transition-all text-left"
          >
            {qualityAction === 'dedup' ? (
              <Loader size={13} className="animate-spin text-brand-light mb-2" />
            ) : (
              <Copy size={13} className="text-brand-light mb-2" />
            )}
            <div className="text-xs font-medium text-slate-200">중복 제거</div>
            <div className="text-[10px] text-slate-500 mt-0.5">해시 기반 중복 레코드 삭제</div>
          </button>

          {/* 오래된 데이터 정리 */}
          <div className="p-3 rounded-lg border border-bg-border bg-bg-elevated space-y-2">
            <div className="flex items-center gap-2">
              <Trash2 size={13} className="text-red-400" />
              <div className="text-xs font-medium text-slate-200">오래된 데이터 정리</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={7} max={365}
                value={cleanupDays}
                onChange={(e) => setCleanupDays(parseInt(e.target.value) || 30)}
                className="input text-xs h-6 py-0 w-16 text-center"
              />
              <span className="text-[10px] text-slate-500">일 이상된 raw 삭제</span>
            </div>
            <button
              onClick={() => runQualityAction('cleanup')}
              disabled={qualityAction !== null || autoTagging}
              className="w-full text-[10px] py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors"
            >
              {qualityAction === 'cleanup' ? '정리 중...' : '실행'}
            </button>
          </div>

          {/* 해시 일괄 적용 */}
          <button
            onClick={() => runQualityAction('hash')}
            disabled={qualityAction !== null || autoTagging}
            className="p-3 rounded-lg border border-bg-border bg-bg-elevated hover:border-teal-500/40 hover:bg-teal-500/5 transition-all text-left"
          >
            {qualityAction === 'hash' ? (
              <Loader size={13} className="animate-spin text-teal-400 mb-2" />
            ) : (
              <Zap size={13} className="text-teal-400 mb-2" />
            )}
            <div className="text-xs font-medium text-slate-200">해시 일괄 적용</div>
            <div className="text-[10px] text-slate-500 mt-0.5">기존 데이터 중복감지 활성화</div>
          </button>
        </div>

        {qualityMsg && (
          <div className="text-xs text-success bg-success/10 border border-success/30 rounded px-3 py-2">
            ✓ {qualityMsg}
          </div>
        )}

        {/* 품질 리포트 */}
        {quality && (
          <div className="space-y-3 border-t border-bg-border pt-3">
            {/* 요약 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              {[
                { label: '전체', value: quality.total, color: 'text-slate-100' },
                { label: '중복그룹', value: quality.duplicate_hash_groups, color: quality.duplicate_hash_groups > 0 ? 'text-amber-400' : 'text-success' },
                { label: '만료 예정', value: quality.stale_raw, color: quality.stale_raw > 0 ? 'text-red-400' : 'text-success' },
                { label: '평균 관련성', value: quality.avg_relevance_score != null ? `${Math.round((quality.avg_relevance_score) * 100)}%` : 'N/A', color: 'text-brand-light' },
              ].map((item) => (
                <div key={item.label} className="bg-bg-elevated rounded p-2">
                  <div className={`text-base font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-[9px] text-slate-500">{item.label}</div>
                </div>
              ))}
            </div>

            {/* 품질 플래그 분포 */}
            {Object.keys(quality.by_flag).length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
                  <AlertTriangle size={9} /> 품질 플래그 분포
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(quality.by_flag).map(([flag, cnt]) => (
                    <span key={flag} className={`text-[9px] px-2 py-0.5 rounded border ${
                      flag === 'ok' ? 'bg-success/10 border-success/30 text-success' :
                      flag === 'duplicate' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                      flag === 'short' ? 'bg-slate-500/10 border-slate-500/30 text-slate-400' :
                      'bg-red-500/10 border-red-500/30 text-red-400'
                    }`}>
                      {flag}: {cnt}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 소스별 용량 */}
            {quality.source_usage.length > 0 && (
              <div>
                <div className="text-[10px] text-slate-500 mb-1.5">소스별 용량 사용률</div>
                <div className="space-y-1">
                  {quality.source_usage.slice(0, 8).map((su) => (
                    <div key={su.source} className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-400 w-28 truncate">{su.source}</span>
                      <div className="flex-1 bg-bg-elevated rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            (su.usage_pct || 0) > 80 ? 'bg-red-400' :
                            (su.usage_pct || 0) > 50 ? 'bg-amber-400' : 'bg-success/60'
                          }`}
                          style={{ width: `${Math.min(100, su.usage_pct || 0)}%` }}
                        />
                      </div>
                      <span className="text-slate-500 w-16 text-right">
                        {su.count}{su.limit ? `/${su.limit}` : ''}
                        {su.usage_pct != null ? ` (${su.usage_pct}%)` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[9px] text-slate-600">
              정책: raw {quality.policy.raw_retention_days}일 / processed {quality.policy.processed_retention_days}일 보관 · 최소 콘텐츠 {quality.policy.min_content_length}자
            </p>
          </div>
        )}
      </div>

      {/* 수집 정책 관리 */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Settings2 size={14} className="text-brand-light" />
            수집 정책 관리
            <span className="text-[10px] text-slate-500 font-normal ml-1">소스별 용량·보관 기간 커스텀 설정</span>
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleExportPolicies} className="btn-ghost flex items-center gap-1 text-xs">
              <FileDown size={11} /> 내보내기
            </button>
            <button onClick={() => importRef.current?.click()} className="btn-ghost flex items-center gap-1 text-xs">
              <Upload size={11} /> 불러오기
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportPolicies} />
            <button onClick={loadPolicies} disabled={policyLoading} className="btn-ghost flex items-center gap-1 text-xs">
              <RefreshCw size={11} className={policyLoading ? 'animate-spin' : ''} />
              새로고침
            </button>
            <button onClick={() => { setShowPolicyForm((v) => !v); loadPolicies() }} className="btn-primary flex items-center gap-1 text-xs">
              {showPolicyForm ? <X size={11} /> : <Plus size={11} />}
              {showPolicyForm ? '취소' : '정책 추가'}
            </button>
          </div>
        </div>

        {showPolicyForm && (
          <div className="p-4 rounded-lg bg-bg-elevated border border-bg-border space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">소스 *</label>
                <input className="input w-full text-xs" placeholder="hackernews, fred, worldbank..." value={policyForm.source} onChange={(e) => setPolicyForm((f) => ({ ...f, source: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">계열사 (미입력=글로벌)</label>
                <select className="input w-full text-xs" value={policyForm.company_id} onChange={(e) => setPolicyForm((f) => ({ ...f, company_id: e.target.value }))}>
                  <option value="">글로벌 정책</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">최대 레코드 수</label>
                <input className="input w-full text-xs" type="number" placeholder="500" value={policyForm.max_records} onChange={(e) => setPolicyForm((f) => ({ ...f, max_records: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400">보관 기간 (일)</label>
                <input className="input w-full text-xs" type="number" placeholder="30" value={policyForm.retention_days} onChange={(e) => setPolicyForm((f) => ({ ...f, retention_days: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <label className="text-[10px] text-slate-400">메모</label>
                <input className="input w-full text-xs" placeholder="정책 설명..." value={policyForm.memo} onChange={(e) => setPolicyForm((f) => ({ ...f, memo: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                disabled={savingPolicy || !policyForm.source.trim()}
                className="btn-primary text-xs flex items-center gap-1.5"
                onClick={async () => {
                  setSavingPolicy(true)
                  try {
                    await policyApi.create({
                      source: policyForm.source,
                      company_id: policyForm.company_id ? parseInt(policyForm.company_id) : null,
                      max_records: policyForm.max_records ? parseInt(policyForm.max_records) : null,
                      retention_days: policyForm.retention_days ? parseInt(policyForm.retention_days) : null,
                      memo: policyForm.memo,
                    })
                    setPolicyForm({ source: '', company_id: '', max_records: '', retention_days: '', memo: '' })
                    setShowPolicyForm(false)
                    await loadPolicies()
                  } finally {
                    setSavingPolicy(false)
                  }
                }}
              >
                {savingPolicy && <Loader size={11} className="animate-spin" />}
                저장
              </button>
            </div>
          </div>
        )}

        {policyLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4 justify-center">
            <Loader size={14} className="animate-spin" /> 로딩 중...
          </div>
        ) : policies.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            설정된 정책이 없습니다. 하드코딩 기본값이 적용됩니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-bg-border text-[10px] text-slate-500">
                  <th className="text-left py-1.5 pr-3">소스</th>
                  <th className="text-left py-1.5 pr-3">계열사</th>
                  <th className="text-right py-1.5 pr-3">최대 레코드</th>
                  <th className="text-right py-1.5 pr-3">보관 기간</th>
                  <th className="text-left py-1.5 pr-3">메모</th>
                  <th className="text-center py-1.5">상태</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-bg-border/50 hover:bg-bg-elevated/30">
                    <td className="py-1.5 pr-3 font-mono text-brand-light">{p.source}</td>
                    <td className="py-1.5 pr-3 text-slate-400">
                      {p.company_id ? (companies.find((c) => c.id === p.company_id)?.name || `#${p.company_id}`) : '글로벌'}
                    </td>
                    {editPolicyId === p.id ? (
                      <>
                        <td className="py-1 pr-2">
                          <input className="input w-20 text-xs text-right" type="number" value={editPolicyForm.max_records} onChange={(e) => setEditPolicyForm((f) => ({ ...f, max_records: e.target.value }))} placeholder="-" />
                        </td>
                        <td className="py-1 pr-2">
                          <input className="input w-20 text-xs text-right" type="number" value={editPolicyForm.retention_days} onChange={(e) => setEditPolicyForm((f) => ({ ...f, retention_days: e.target.value }))} placeholder="-" />
                        </td>
                        <td className="py-1 pr-2">
                          <input className="input w-32 text-xs" value={editPolicyForm.memo} onChange={(e) => setEditPolicyForm((f) => ({ ...f, memo: e.target.value }))} placeholder="메모" />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 pr-3 text-right text-slate-300">{p.max_records ?? '-'}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-300">{p.retention_days != null ? `${p.retention_days}일` : '-'}</td>
                        <td className="py-1.5 pr-3 text-slate-500">{p.memo || '-'}</td>
                      </>
                    )}
                    <td className="py-1.5 text-center">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border ${p.is_active ? 'text-success bg-success/10 border-success/30' : 'text-slate-500 bg-slate-500/10 border-slate-500/30'}`}>
                        {p.is_active ? '활성' : '비활성'}
                      </span>
                    </td>
                    <td className="py-1.5 pl-2">
                      <div className="flex items-center gap-0.5">
                        {editPolicyId === p.id ? (
                          <>
                            <button onClick={() => saveEditPolicy(p.id)} className="text-green-400 hover:text-green-300 p-1"><Check size={11} /></button>
                            <button onClick={() => setEditPolicyId(null)} className="text-slate-600 hover:text-slate-400 p-1"><X size={11} /></button>
                          </>
                        ) : (
                          <button onClick={() => startEditPolicy(p)} className="text-slate-600 hover:text-blue-400 transition-colors p-1"><Edit2 size={11} /></button>
                        )}
                        <button
                          onClick={async () => { await policyApi.delete(p.id); await loadPolicies() }}
                          className="text-slate-600 hover:text-red-400 transition-colors p-1"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 소스 상태 모니터링 */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Activity size={14} className="text-brand-light" />
            데이터 소스 상태 모니터링
            <span className="text-[10px] text-slate-500 font-normal ml-1">연속 실패 · 성공률 추적</span>
          </h3>
          <button onClick={loadSourceStatus} disabled={sourceStatusLoading} className="btn-ghost flex items-center gap-1 text-xs">
            <RefreshCw size={11} className={sourceStatusLoading ? 'animate-spin' : ''} />
            새로고침
          </button>
        </div>

        {sourceStatusLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-4 justify-center">
            <Loader size={14} className="animate-spin" /> 로딩 중...
          </div>
        ) : sourceStatuses.length === 0 ? (
          <div className="text-xs text-slate-500 py-4 text-center">
            아직 수집 기록이 없습니다. 자동 수집 스케줄러가 실행되면 상태가 표시됩니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sourceStatuses.map((s) => (
              <div key={s.id} className={`p-3 rounded-lg border ${
                s.health === 'ok' ? 'border-green-500/20 bg-green-500/5'
                : s.health === 'warning' ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-red-500/20 bg-red-500/5'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    {s.health === 'ok' ? <CheckCircle size={12} className="text-green-400" />
                      : s.health === 'warning' ? <AlertCircle size={12} className="text-amber-400" />
                      : <XCircle size={12} className="text-red-400" />}
                    <span className="text-xs font-mono font-semibold text-slate-200">{s.source}</span>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    s.health === 'ok' ? 'text-green-400 bg-green-500/10'
                    : s.health === 'warning' ? 'text-amber-400 bg-amber-500/10'
                    : 'text-red-400 bg-red-500/10'
                  }`}>
                    {s.health === 'ok' ? '정상' : s.health === 'warning' ? '주의' : '오류'}
                  </span>
                </div>
                <div className="space-y-1 text-[10px] text-slate-500">
                  <div className="flex justify-between">
                    <span>성공</span>
                    <span className="text-green-400">{s.total_successes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>실패</span>
                    <span className="text-red-400">{s.total_failures}</span>
                  </div>
                  {s.consecutive_failures > 0 && (
                    <div className="flex justify-between">
                      <span>연속 실패</span>
                      <span className="text-red-400 font-semibold">{s.consecutive_failures}회</span>
                    </div>
                  )}
                  {s.last_success_at && (
                    <div className="flex justify-between">
                      <span>마지막 성공</span>
                      <span>{new Date(s.last_success_at).toLocaleDateString('ko-KR')}</span>
                    </div>
                  )}
                  {s.last_error && s.health !== 'ok' && (
                    <div className="mt-1 text-red-400/70 truncate" title={s.last_error}>{s.last_error.slice(0, 60)}...</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
