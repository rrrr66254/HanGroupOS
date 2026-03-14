import { useState, useEffect, useCallback } from 'react'
import {
  Shield, Users, Building2, Plus, Trash2, Edit3, Check,
  Crown, UserCheck, Eye, Settings, Loader2, X, ChevronDown,
} from 'lucide-react'
import { permissionsApi, companiesApi } from '../api/client'
import { useAppStore, useAuthStore } from '../store/useStore'
import type { Company } from '../types'

interface UserWithRoles {
  id: number
  username: string
  email: string
  system_role: string
  is_active: boolean
  company_roles: { id: number; company_id: number; company_name: string; role: string }[]
  created_at: string
}

interface Permission {
  id: number
  user_id: number
  username: string
  company_id: number
  company_name: string
  role: string
  granted_by: number | null
  created_at: string
}

const ROLE_ICONS: Record<string, React.ElementType> = {
  chairman: Crown,
  ceo: UserCheck,
  manager: Settings,
  viewer: Eye,
}

const ROLE_COLORS: Record<string, string> = {
  chairman: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ceo: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  manager: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  viewer: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
}

const ROLE_LABELS: Record<string, string> = {
  chairman: '회장',
  ceo: 'CEO',
  manager: '관리자',
  viewer: '뷰어',
}

const LEVEL_LABELS: Record<string, string> = {
  full: '전체 권한',
  write: '읽기/쓰기',
  read: '읽기 전용',
  none: '접근 불가',
}

export default function Permissions() {
  const [users, setUsers] = useState<UserWithRoles[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [showGrant, setShowGrant] = useState(false)
  const [editingPerm, setEditingPerm] = useState<Permission | null>(null)
  const [selectedView, setSelectedView] = useState<'users' | 'companies'>('users')
  const [selectedCompany, setSelectedCompany] = useState<number | null>(null)
  const [companyPerms, setCompanyPerms] = useState<Permission[]>([])
  const addToast = useAppStore((s) => s.addToast)
  const currentUser = useAuthStore((s) => s.user)

  const [grantForm, setGrantForm] = useState({ user_id: 0, company_id: 0, role: 'viewer' })

  const load = useCallback(async () => {
    setLoading(true)
    const [uRes, cRes] = await Promise.allSettled([
      permissionsApi.users(),
      companiesApi.list(),
    ])
    if (uRes.status === 'fulfilled') setUsers(uRes.value.data)
    if (cRes.status === 'fulfilled') setCompanies(cRes.value.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const loadCompanyPerms = async (companyId: number) => {
    setSelectedCompany(companyId)
    const res = await permissionsApi.company(companyId)
    setCompanyPerms(res.data)
  }

  const grant = async () => {
    if (!grantForm.user_id || !grantForm.company_id) {
      addToast({ type: 'error', title: '사용자와 계열사를 선택하세요' })
      return
    }
    try {
      await permissionsApi.grant(grantForm)
      addToast({ type: 'success', title: '권한 부여 완료' })
      setShowGrant(false)
      load()
      if (selectedCompany) loadCompanyPerms(selectedCompany)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '권한 부여 실패'
      addToast({ type: 'error', title: msg })
    }
  }

  const revoke = async (id: number) => {
    await permissionsApi.revoke(id)
    addToast({ type: 'success', title: '권한 제거됨' })
    load()
    if (selectedCompany) loadCompanyPerms(selectedCompany)
  }

  const updateRole = async (id: number, role: string) => {
    await permissionsApi.update(id, { role })
    addToast({ type: 'success', title: '역할 변경됨' })
    setEditingPerm(null)
    load()
    if (selectedCompany) loadCompanyPerms(selectedCompany)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-500" size={24} /></div>

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Shield size={22} className="text-blue-400" /> 권한 관리
          </h1>
          <p className="text-xs text-slate-500 mt-1">사용자별 역할(회장/CEO/관리자/뷰어) 기반 접근 제어 + 계열사별 데이터 격리</p>
        </div>
        <button onClick={() => setShowGrant(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-brand/15 text-brand-light hover:bg-brand/25 transition-colors">
          <Plus size={13} /> 권한 부여
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: '전체 사용자', value: users.length, icon: Users, color: 'text-slate-400' },
          { label: '활성 계열사', value: companies.filter((c) => c.status === 'active').length, icon: Building2, color: 'text-emerald-400' },
          { label: '총 권한 수', value: users.reduce((s, u) => s + u.company_roles.length, 0), icon: Shield, color: 'text-blue-400' },
          { label: '관리자', value: users.filter((u) => u.system_role === 'admin').length, icon: Crown, color: 'text-amber-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-bg-card border border-bg-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
              <Icon size={14} className={color} />
            </div>
            <p className={`text-lg font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* View Toggle */}
      <div className="flex gap-1">
        {(['users', 'companies'] as const).map((v) => (
          <button key={v} onClick={() => setSelectedView(v)}
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
              selectedView === v ? 'bg-brand/15 text-brand-light' : 'text-slate-500 hover:text-slate-300 hover:bg-bg-elevated'
            }`}>
            {v === 'users' ? '사용자별 보기' : '계열사별 보기'}
          </button>
        ))}
      </div>

      {selectedView === 'users' ? (
        /* Users View */
        <div className="space-y-3">
          {users.map((user) => (
            <div key={user.id} className="bg-bg-card border border-bg-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-brand/15 flex items-center justify-center">
                    <Users size={16} className="text-brand-light" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200">{user.username}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${
                        user.system_role === 'admin' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                      }`}>
                        {user.system_role}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">{user.email}</span>
                  </div>
                </div>
                <span className="text-[10px] text-slate-600">{user.company_roles.length}개 계열사</span>
              </div>

              {user.company_roles.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {user.company_roles.map((cr) => {
                    const RoleIcon = ROLE_ICONS[cr.role] || Eye
                    return (
                      <div key={cr.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${ROLE_COLORS[cr.role] || ROLE_COLORS.viewer}`}>
                        <RoleIcon size={12} />
                        <span className="font-medium">{cr.company_name}</span>
                        <span className="opacity-60">({ROLE_LABELS[cr.role] || cr.role})</span>
                        <button onClick={() => revoke(cr.id)} className="ml-1 opacity-50 hover:opacity-100 transition-opacity">
                          <X size={10} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[10px] text-slate-600 mt-1">
                  {user.system_role === 'admin' ? '관리자 — 전체 접근 권한' : '할당된 계열사 권한 없음'}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Companies View */
        <div className="grid grid-cols-3 gap-4">
          {companies.filter((c) => c.status === 'active').map((company) => {
            const perms = selectedCompany === company.id ? companyPerms : []
            const isOpen = selectedCompany === company.id

            return (
              <div key={company.id}
                className={`bg-bg-card border rounded-xl transition-colors cursor-pointer ${
                  isOpen ? 'border-brand/40' : 'border-bg-border hover:border-bg-border/80'
                }`}
                onClick={() => isOpen ? setSelectedCompany(null) : loadCompanyPerms(company.id)}>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 size={16} className="text-brand-light" />
                      <span className="text-sm font-semibold text-slate-200">{company.name}</span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{company.industry}</p>
                </div>

                {isOpen && (
                  <div className="border-t border-bg-border p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                    {perms.length === 0 ? (
                      <p className="text-[10px] text-slate-500 text-center py-2">할당된 사용자 없음</p>
                    ) : (
                      perms.map((p) => {
                        const RoleIcon = ROLE_ICONS[p.role] || Eye
                        return (
                          <div key={p.id} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-2">
                              <RoleIcon size={12} className="text-slate-400" />
                              <span className="text-xs text-slate-200">{p.username}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${ROLE_COLORS[p.role] || ROLE_COLORS.viewer}`}>
                                {ROLE_LABELS[p.role] || p.role}
                              </span>
                            </div>
                            <button onClick={() => revoke(p.id)} className="p-1 rounded text-slate-500 hover:text-red-400">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Grant Modal */}
      {showGrant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowGrant(false)}>
          <div className="bg-bg-card border border-bg-border rounded-2xl w-[400px] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-100 mb-4 flex items-center gap-2">
              <Shield size={16} className="text-blue-400" /> 권한 부여
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">사용자</label>
                <select value={grantForm.user_id} onChange={(e) => setGrantForm({ ...grantForm, user_id: Number(e.target.value) })}
                  className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none">
                  <option value={0}>선택하세요</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">계열사</label>
                <select value={grantForm.company_id} onChange={(e) => setGrantForm({ ...grantForm, company_id: Number(e.target.value) })}
                  className="w-full bg-bg-base border border-bg-border rounded-lg px-3 py-2 text-xs text-slate-200 outline-none">
                  <option value={0}>선택하세요</option>
                  {companies.filter((c) => c.status === 'active').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">역할</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ROLE_LABELS).map(([role, label]) => {
                    const RoleIcon = ROLE_ICONS[role] || Eye
                    return (
                      <button key={role}
                        onClick={() => setGrantForm({ ...grantForm, role })}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                          grantForm.role === role ? ROLE_COLORS[role] : 'border-bg-border text-slate-500 hover:border-slate-500'
                        }`}>
                        <RoleIcon size={13} />
                        <span>{label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="bg-bg-base rounded-lg p-3 text-[10px] text-slate-500">
                <p className="font-medium text-slate-400 mb-1">역할 설명</p>
                <ul className="space-y-0.5">
                  <li><span className="text-amber-400">회장</span> — 전체 권한 (생성/수정/삭제)</li>
                  <li><span className="text-purple-400">CEO</span> — 전체 권한 (생성/수정/삭제)</li>
                  <li><span className="text-blue-400">관리자</span> — 읽기/쓰기 (삭제 불가)</li>
                  <li><span className="text-slate-400">뷰어</span> — 읽기 전용</li>
                </ul>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowGrant(false)} className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:bg-bg-elevated">취소</button>
              <button onClick={grant} className="px-4 py-2 rounded-lg text-xs font-medium bg-brand/15 text-brand-light hover:bg-brand/25">부여</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
