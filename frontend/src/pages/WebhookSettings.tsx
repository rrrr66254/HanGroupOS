import { useState, useEffect } from 'react'
import { Bell, Save, Send, CheckCircle, XCircle } from 'lucide-react'
import { webhookNotifyApi } from '../api/client'

export default function WebhookSettings() {
  const [config, setConfig] = useState({
    slack_url: '', discord_url: '',
    notify_approvals: true, notify_quality_alert: true, notify_kpi_change: true,
    min_quality_threshold: 0.3,
  })
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<{ target: string; ok: boolean } | null>(null)

  useEffect(() => {
    webhookNotifyApi.getConfig().then((r) => setConfig({ ...config, ...r.data })).catch(() => {})
  }, [])

  const save = async () => {
    setSaving(true)
    try { await webhookNotifyApi.updateConfig(config) } catch { /* ignore */ }
    setSaving(false)
  }

  const test = async (target: string) => {
    try {
      const r = await webhookNotifyApi.test(target)
      setTestResult({ target, ok: r.data.status === 'ok' })
      setTimeout(() => setTestResult(null), 3000)
    } catch { setTestResult({ target, ok: false }) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <Bell size={20} className="text-amber-400" /> 웹훅 알림 설정
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">Slack/Discord로 시스템 이벤트 자동 알림</p>
      </div>

      <div className="card p-5 space-y-4">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Slack Webhook URL</label>
          <div className="flex gap-2">
            <input value={config.slack_url}
              onChange={(e) => setConfig({ ...config, slack_url: e.target.value })}
              placeholder="https://hooks.slack.com/services/..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
            <button onClick={() => test('slack')} disabled={!config.slack_url}
              className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md flex items-center gap-1 disabled:opacity-30">
              <Send size={11} /> 테스트
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Discord Webhook URL</label>
          <div className="flex gap-2">
            <input value={config.discord_url}
              onChange={(e) => setConfig({ ...config, discord_url: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300" />
            <button onClick={() => test('discord')} disabled={!config.discord_url}
              className="px-3 py-2 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-md flex items-center gap-1 disabled:opacity-30">
              <Send size={11} /> 테스트
            </button>
          </div>
        </div>

        {testResult && (
          <div className={`flex items-center gap-2 text-xs ${testResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {testResult.target} {testResult.ok ? '발송 성공' : '발송 실패'}
          </div>
        )}

        <hr className="border-slate-800" />

        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-300">알림 유형</h3>
          {[
            { key: 'notify_approvals', label: '승인 요청 알림', desc: '새 승인 요청 생성 시' },
            { key: 'notify_quality_alert', label: 'AI 품질 저하 알림', desc: '품질 점수 임계값 미만 시' },
            { key: 'notify_kpi_change', label: 'KPI 변동 알림', desc: 'KPI 대폭 변동 시' },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox"
                checked={(config as any)[item.key]}
                onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                className="rounded border-slate-600 bg-slate-800" />
              <div>
                <div className="text-xs text-slate-300">{item.label}</div>
                <div className="text-[10px] text-slate-600">{item.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs flex items-center gap-1 disabled:opacity-50">
          <Save size={12} /> {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}
