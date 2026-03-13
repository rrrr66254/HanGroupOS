import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap } from 'lucide-react'
import { authApi, groupSettingsApi } from '../api/client'
import { useAuthStore, useGroupStore } from '../store/useStore'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setGroupConfig = useGroupStore((s) => s.setConfig)
  const groupName = useGroupStore((s) => s.config.group_name)
  const slogan = useGroupStore((s) => s.config.slogan)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin1234')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    groupSettingsApi.get().then((r) => setGroupConfig(r.data)).catch(() => {})
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authApi.login(username, password)
      setAuth(res.data.access_token, res.data.user)
      navigate('/dashboard')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e.response?.data?.detail || '로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4">
      {/* Background grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(90deg, #6366f1 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand rounded-2xl mb-4 shadow-lg shadow-brand/30">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">{groupName} OS</h1>
          <p className="text-slate-500 text-sm mt-1 font-mono">v30 · {slogan}</p>
        </div>

        {/* Card */}
        <div className="card p-6">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">아이디</label>
              <input
                className="input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">비밀번호</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
              />
            </div>

            {error && (
              <div className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-2.5 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </>
              ) : (
                `${groupName} OS 접속`
              )}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-bg-border text-center">
            <p className="text-xs text-slate-500">
              기본 계정: admin / admin1234
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          {groupName} {slogan}
        </p>
      </div>
    </div>
  )
}
