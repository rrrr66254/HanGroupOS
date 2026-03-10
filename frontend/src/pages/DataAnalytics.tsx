import { useEffect, useState } from 'react'
import {
  Database, TrendingUp, Download, RefreshCw, Loader,
  Globe, Hash, Building2, Calendar, Activity,
} from 'lucide-react'
import { dataApi, companiesApi } from '../api/client'
import type { Company } from '../types'

interface DataStats {
  total: number
  today: number
  by_type: Record<string, number>
  by_source: Record<string, number>
  by_company: Record<string, number>
  daily_7days: { date: string; count: number }[]
}

const SOURCE_LABELS: Record<string, string> = {
  hackernews: '🟠 HackerNews',
  worldbank: '🌍 World Bank',
  reddit: '🔴 Reddit',
  dart: '🇰🇷 DART',
  ecos: '🏦 ECOS',
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
}

const FREE_SOURCES = [
  { id: 'hackernews', label: 'HackerNews 트렌드', desc: '글로벌 테크 스토리', action: () => dataApi.collectHackernews({ limit: 15, save: true }) },
  { id: 'worldbank', label: 'World Bank GDP', desc: '한국 GDP 성장률', action: () => dataApi.collectWorldBank({ indicator: 'NY.GDP.MKTP.KD.ZG', country: 'KR', save: true }) },
  { id: 'reddit_tech', label: 'Reddit /r/technology', desc: '기술 커뮤니티 트렌드', action: () => dataApi.collectReddit({ subreddit: 'technology', limit: 20, save: true }) },
  { id: 'reddit_startup', label: 'Reddit /r/startups', desc: '스타트업 동향', action: () => dataApi.collectReddit({ subreddit: 'startups', limit: 15, save: true }) },
]

export default function DataAnalytics() {
  const [stats, setStats] = useState<DataStats | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState<string | null>(null)
  const [exportCompany, setExportCompany] = useState('')
  const [exporting, setExporting] = useState(false)

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
  }, [])

  const runCollect = async (id: string, action: () => Promise<unknown>) => {
    setCollecting(id)
    try {
      await action()
      await loadStats()
    } finally {
      setCollecting(null)
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
          {FREE_SOURCES.map((src) => (
            <button
              key={src.id}
              onClick={() => runCollect(src.id, src.action)}
              disabled={collecting !== null}
              className="p-3 rounded-lg border border-bg-border bg-bg-elevated hover:border-success/40 hover:bg-success/5 transition-all text-left"
            >
              {collecting === src.id ? (
                <Loader size={13} className="animate-spin text-success mb-2" />
              ) : (
                <div className="text-success text-base mb-1">+</div>
              )}
              <div className="text-xs font-medium text-slate-200">{src.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{src.desc}</div>
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
    </div>
  )
}
