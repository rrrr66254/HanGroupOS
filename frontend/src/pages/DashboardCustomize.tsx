import { useState, useEffect } from 'react'
import { LayoutGrid, Save, RotateCcw, Eye, EyeOff, GripVertical } from 'lucide-react'
import { dashboardLayoutApi } from '../api/client'

interface Widget {
  widget_id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  visible: boolean
}

export default function DashboardCustomize() {
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [isCustom, setIsCustom] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  useEffect(() => {
    dashboardLayoutApi.get().then((r) => {
      setWidgets(r.data.layout)
      setIsCustom(r.data.is_custom)
    }).catch(() => {})
  }, [])

  const toggleVisible = (idx: number) => {
    const updated = [...widgets]
    updated[idx] = { ...updated[idx], visible: !updated[idx].visible }
    setWidgets(updated)
  }

  const moveWidget = (fromIdx: number, toIdx: number) => {
    const updated = [...widgets]
    const [item] = updated.splice(fromIdx, 1)
    updated.splice(toIdx, 0, item)
    // y 좌표 재계산
    updated.forEach((w, i) => { w.y = i })
    setWidgets(updated)
  }

  const save = async () => {
    setSaving(true)
    try { await dashboardLayoutApi.save(widgets) } catch { /* ignore */ }
    setSaving(false)
    setIsCustom(true)
  }

  const reset = async () => {
    try {
      const r = await dashboardLayoutApi.reset()
      setWidgets(r.data.layout)
      setIsCustom(false)
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white flex items-center gap-2">
            <LayoutGrid size={20} className="text-indigo-400" /> 대시보드 커스터마이징
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            위젯 표시/숨기기 및 순서 변경
            {isCustom && <span className="ml-2 text-indigo-400">(커스텀 레이아웃 적용 중)</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={reset}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-md">
            <RotateCcw size={12} /> 초기화
          </button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50">
            <Save size={12} /> {saving ? '저장 중...' : '레이아웃 저장'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {widgets.map((w, i) => (
          <div key={w.widget_id}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null) moveWidget(dragIdx, i); setDragIdx(null) }}
            className={`card p-3 flex items-center justify-between transition cursor-grab active:cursor-grabbing
              ${w.visible ? 'border-slate-700' : 'border-slate-800 opacity-50'}
              ${dragIdx === i ? 'ring-1 ring-indigo-500' : ''}`}>
            <div className="flex items-center gap-3">
              <GripVertical size={14} className="text-slate-600" />
              <span className="text-xs font-medium text-white w-4 text-right text-slate-600">{i + 1}</span>
              <div className="text-sm text-slate-300">{w.label}</div>
              <span className="text-[10px] text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">
                {w.w}×{w.h}
              </span>
            </div>
            <button onClick={() => toggleVisible(i)}
              className={`p-1.5 rounded-md ${w.visible ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-slate-600 hover:bg-slate-800'}`}>
              {w.visible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          </div>
        ))}
      </div>

      <div className="text-[10px] text-slate-600 text-center">
        드래그하여 순서를 변경하고, 눈 아이콘으로 표시/숨기기를 설정하세요.
      </div>
    </div>
  )
}
