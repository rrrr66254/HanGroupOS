import { useState, useRef } from 'react'
import type { OrgNode } from '../types'

const LEVEL_COLORS: Record<string, string> = {
  chairman: 'border-brand bg-brand/10 text-brand-light',
  committee: 'border-purple-500 bg-purple-500/10 text-purple-300',
  ceo: 'border-accent bg-accent/10 text-accent',
  chief: 'border-success bg-success/10 text-success',
  team_lead: 'border-warning bg-warning/10 text-warning',
  specialist: 'border-slate-500 bg-slate-700/50 text-slate-300',
}

const LEVEL_LABELS: Record<string, string> = {
  chairman: '회장',
  committee: '위원회',
  ceo: 'CEO',
  chief: 'Chief',
  team_lead: '팀장',
  specialist: '스페셜리스트',
}

interface DragState {
  nodeId: number
  nodeName: string
}

interface NodeCardProps {
  node: OrgNode
  editMode: boolean
  dragState: DragState | null
  dropTarget: number | null
  onDragStart: (node: OrgNode) => void
  onDragOver: (e: React.DragEvent, node: OrgNode) => void
  onDrop: (targetNode: OrgNode) => void
  onDragEnd: () => void
  onDoubleClick?: (node: OrgNode) => void
}

function NodeCard({
  node, editMode, dragState, dropTarget,
  onDragStart, onDragOver, onDrop, onDragEnd, onDoubleClick,
}: NodeCardProps) {
  const colorClass = LEVEL_COLORS[node.level] || 'border-slate-600 text-slate-400'
  const label = LEVEL_LABELS[node.level] || node.level
  const isDragging = dragState?.nodeId === node.id
  const isDropTarget = dropTarget === node.id && dragState?.nodeId !== node.id

  return (
    <div
      className={`border rounded-lg px-3 py-2 text-center min-w-[120px] max-w-[160px] transition-all
        ${colorClass}
        ${editMode ? 'cursor-grab active:cursor-grabbing' : ''}
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${isDropTarget ? 'ring-2 ring-brand/70 ring-offset-1 ring-offset-bg-base scale-105' : ''}
      `}
      draggable={editMode}
      onDragStart={editMode ? () => onDragStart(node) : undefined}
      onDragOver={editMode ? (e) => onDragOver(e, node) : undefined}
      onDrop={editMode ? () => onDrop(node) : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
      onDoubleClick={editMode && onDoubleClick ? () => onDoubleClick(node) : undefined}
      title={editMode ? '드래그로 이동 | 더블클릭으로 편집' : undefined}
    >
      <div className="text-[10px] font-medium opacity-70 mb-0.5">{label}</div>
      <div className="text-xs font-semibold truncate">{node.name}</div>
      {node.role !== node.name && (
        <div className="text-[10px] opacity-60 truncate mt-0.5">{node.role}</div>
      )}
      {node.ai_provider && node.ai_provider !== 'mock' && (
        <div className="text-[9px] mt-1 opacity-50 font-mono">{node.ai_provider}</div>
      )}
      {editMode && (
        <div className="text-[8px] opacity-30 mt-1">⠿ drag</div>
      )}
    </div>
  )
}

interface OrgTreeProps {
  nodes: OrgNode[]
  depth?: number
  editMode: boolean
  dragState: DragState | null
  dropTarget: number | null
  onDragStart: (node: OrgNode) => void
  onDragOver: (e: React.DragEvent, node: OrgNode) => void
  onDrop: (targetNode: OrgNode) => void
  onDragEnd: () => void
  onDoubleClick?: (node: OrgNode) => void
}

function OrgTree({
  nodes, depth = 0, editMode, dragState, dropTarget,
  onDragStart, onDragOver, onDrop, onDragEnd, onDoubleClick,
}: OrgTreeProps) {
  if (nodes.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-0">
      <div className={`flex gap-6 ${depth > 0 ? 'pt-4' : ''}`} style={{ position: 'relative' }}>
        {nodes.map((node) => (
          <div key={node.id} className="flex flex-col items-center">
            <NodeCard
              node={node}
              editMode={editMode}
              dragState={dragState}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onDoubleClick={onDoubleClick}
            />
            {node.children && node.children.length > 0 && (
              <>
                <div className="w-px h-4 bg-bg-border" />
                {node.children.length > 1 && (
                  <div
                    className="h-px bg-bg-border"
                    style={{
                      width: `calc(${node.children.length * 136 + (node.children.length - 1) * 24}px - 8px)`,
                    }}
                  />
                )}
                <OrgTree
                  nodes={node.children}
                  depth={depth + 1}
                  editMode={editMode}
                  dragState={dragState}
                  dropTarget={dropTarget}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                  onDoubleClick={onDoubleClick}
                />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface NodeMovePayload {
  nodeId: number
  nodeName: string
  newParentId: number
  newParentName: string
}

interface OrgChartProps {
  tree: OrgNode[]
  className?: string
  editMode?: boolean
  onNodeMove?: (payload: NodeMovePayload) => void
  onNodeEdit?: (node: OrgNode) => void
}

export default function OrgChart({
  tree, className = '', editMode = false, onNodeMove, onNodeEdit,
}: OrgChartProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  const confirmRef = useRef<NodeMovePayload | null>(null)
  const [pendingMove, setPendingMove] = useState<NodeMovePayload | null>(null)

  if (!tree || tree.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        조직도 데이터가 없습니다.
      </div>
    )
  }

  const handleDragStart = (node: OrgNode) => {
    setDragState({ nodeId: node.id, nodeName: node.name })
  }

  const handleDragOver = (e: React.DragEvent, node: OrgNode) => {
    e.preventDefault()
    if (dragState && dragState.nodeId !== node.id) {
      setDropTarget(node.id)
    }
  }

  const handleDrop = (targetNode: OrgNode) => {
    if (!dragState || dragState.nodeId === targetNode.id) return
    const payload: NodeMovePayload = {
      nodeId: dragState.nodeId,
      nodeName: dragState.nodeName,
      newParentId: targetNode.id,
      newParentName: targetNode.name,
    }
    setPendingMove(payload)
    confirmRef.current = payload
    setDragState(null)
    setDropTarget(null)
  }

  const handleDragEnd = () => {
    setDragState(null)
    setDropTarget(null)
  }

  const confirmMove = () => {
    if (pendingMove && onNodeMove) {
      onNodeMove(pendingMove)
    }
    setPendingMove(null)
  }

  return (
    <div className={`relative ${className}`}>
      {/* Edit mode banner */}
      {editMode && (
        <div className="mb-2 px-3 py-1.5 bg-brand/10 border border-brand/30 rounded-lg text-xs text-brand-light flex items-center gap-2">
          <span>✏️ 편집 모드 — 노드를 드래그하여 조직 구조를 변경하세요. 변경 시 승인 요청이 자동 생성됩니다.</span>
        </div>
      )}

      <div className="overflow-auto">
        <div className="min-w-max p-6 flex justify-center">
          <OrgTree
            nodes={tree}
            editMode={editMode}
            dragState={dragState}
            dropTarget={dropTarget}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            onDoubleClick={onNodeEdit}
          />
        </div>
      </div>

      {/* Move confirmation modal */}
      {pendingMove && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 rounded-lg">
          <div className="bg-bg-card border border-bg-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-slate-100 mb-3">조직 변경 확인</h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              <span className="text-brand-light font-medium">{pendingMove.nodeName}</span>을(를){' '}
              <span className="text-success font-medium">{pendingMove.newParentName}</span>의 하위로 이동합니다.
              <br /><br />
              <span className="text-amber-400">승인 요청이 자동 생성됩니다.</span>
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setPendingMove(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-bg-border hover:border-slate-600 transition-colors"
              >
                취소
              </button>
              <button
                onClick={confirmMove}
                className="px-3 py-1.5 text-xs rounded-lg bg-brand/20 border border-brand/40 text-brand-light hover:bg-brand/30 transition-colors"
              >
                확인 및 승인 요청 생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
