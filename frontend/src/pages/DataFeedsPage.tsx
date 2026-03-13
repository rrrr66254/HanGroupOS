import { useState, useEffect } from 'react'
import { Rss, Plus, RefreshCw, Trash2, Play, Database } from 'lucide-react'
import { dataFeedsApi } from '../api/client'

interface Feed {
  id: number
  name: string
  feed_type: string
  url: string
  interval_minutes: number
  is_active: boolean
  inject_to_context: boolean
  last_collected_at: string | null
  cached_items: number
}

const TYPE_LABELS: Record<string, string> = {
  rss: 'RSS 피드',
  news_api: '뉴스 API',
  exchange_rate: '환율',
  stock: '주가',
}

export default function DataFeedsPage() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [loading, setLoading] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newFeed, setNewFeed] = useState({ name: '', feed_type: 'rss', url: '', config: '{}', interval_minutes: 360 })
  const [collecting, setCollecting] = useState<number | null>(null)
  const [viewData, setViewData] = useState<{ feedId: number; items: any[] } | null>(null)

  const load = async () => {
    setLoading(true)
    try { const r = await dataFeedsApi.list(); setFeeds(r.data) } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const addFeed = async () => {
    try {
      await dataFeedsApi.create(newFeed)
      setShowAdd(false)
      setNewFeed({ name: '', feed_type: 'rss', url: '', config: '{}', interval_minutes: 360 })
      load()
    } catch { /* ignore */ }
  }

  const toggleActive = async (f: Feed) => {
    await dataFeedsApi.update(f.id, { is_active: !f.is_active })
    load()
  }

  const deleteFeed = async (id: number) => {
    await dataFeedsApi.delete(id)
    load()
  }

  const collectNow = async (id: number) => {
    setCollecting(id)
    try { await dataFeedsApi.collect(id) } catch { /* ignore */ }
    setCollecting(null)
    load()
  }

  const showData = async (feedId: number) => {
    try {
      const r = await dataFeedsApi.data(feedId, 20)
      setViewData({ feedId, items: r.data })
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <Rss size={20} className="text-orange-400" /> 외부 데이터 허브
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">RSS, 뉴스, 환율, 주가 등 외부 데이터 자동 수집 파이프라인</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-400">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md">
            <Plus size={12} /> 피드 추가
          </button>
        </div>
      </div>

      {/* 피드 목록 */}
      <div className="space-y-3">
        {feeds.map((f) => (
          <div key={f.id} className="card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${f.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`} />
              <div>
                <div className="text-sm text-white font-medium">{f.name}</div>
                <div className="text-[10px] text-slate-500 flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-slate-800 rounded">{TYPE_LABELS[f.feed_type] || f.feed_type}</span>
                  {f.url && <span className="truncate max-w-[200px]">{f.url}</span>}
                  <span>{f.interval_minutes}분 주기</span>
                  <span>{f.cached_items}건 캐시</span>
                  {f.inject_to_context && <span className="text-emerald-500">컨텍스트 주입</span>}
                </div>
                {f.last_collected_at && (
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    마지막 수집: {new Date(f.last_collected_at).toLocaleString('ko-KR')}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => showData(f.id)} title="데이터 보기"
                className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800">
                <Database size={13} />
              </button>
              <button onClick={() => collectNow(f.id)} disabled={collecting === f.id} title="즉시 수집"
                className="p-1.5 rounded text-slate-500 hover:text-emerald-400 hover:bg-slate-800 disabled:opacity-50">
                <Play size={13} className={collecting === f.id ? 'animate-pulse' : ''} />
              </button>
              <button onClick={() => toggleActive(f)}
                className={`px-2 py-1 text-[10px] rounded ${f.is_active ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-500 bg-slate-800'}`}>
                {f.is_active ? '활성' : '비활성'}
              </button>
              <button onClick={() => deleteFeed(f.id)}
                className="p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-slate-800">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {feeds.length === 0 && !loading && (
          <div className="card p-8 text-center text-xs text-slate-600">
            등록된 데이터 피드가 없습니다. "피드 추가"로 시작하세요.
          </div>
        )}
      </div>

      {/* 추가 모달 */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Plus size={14} /> 새 데이터 피드
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">이름</label>
                <input value={newFeed.name} onChange={(e) => setNewFeed({ ...newFeed, name: e.target.value })}
                  placeholder="예: TechCrunch RSS"
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">타입</label>
                <select value={newFeed.feed_type} onChange={(e) => setNewFeed({ ...newFeed, feed_type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300">
                  <option value="rss">RSS 피드</option>
                  <option value="news_api">뉴스 API</option>
                  <option value="exchange_rate">환율</option>
                  <option value="stock">주가</option>
                </select>
              </div>
              {(newFeed.feed_type === 'rss') && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">URL</label>
                  <input value={newFeed.url} onChange={(e) => setNewFeed({ ...newFeed, url: e.target.value })}
                    placeholder="https://example.com/rss"
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
                </div>
              )}
              {newFeed.feed_type === 'news_api' && (
                <div>
                  <label className="text-xs text-slate-400 block mb-1">설정 (JSON)</label>
                  <input value={newFeed.config} onChange={(e) => setNewFeed({ ...newFeed, config: e.target.value })}
                    placeholder='{"query": "AI technology", "api_key": "..."}'
                    className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
                </div>
              )}
              <div>
                <label className="text-xs text-slate-400 block mb-1">수집 주기 (분)</label>
                <input type="number" value={newFeed.interval_minutes}
                  onChange={(e) => setNewFeed({ ...newFeed, interval_minutes: Number(e.target.value) })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-400">취소</button>
              <button onClick={addFeed} disabled={!newFeed.name}
                className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50">
                추가
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 데이터 보기 모달 */}
      {viewData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setViewData(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-[600px] max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-4">수집 데이터</h3>
            <div className="space-y-2">
              {viewData.items.map((item: any, i: number) => (
                <div key={i} className="p-3 bg-slate-800/50 rounded-lg">
                  <div className="text-xs text-white font-medium">{item.title}</div>
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">{item.content}</div>
                  <div className="text-[10px] text-slate-600 mt-1">
                    {new Date(item.collected_at).toLocaleString('ko-KR')}
                  </div>
                </div>
              ))}
              {viewData.items.length === 0 && (
                <div className="py-6 text-center text-xs text-slate-600">수집된 데이터가 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
