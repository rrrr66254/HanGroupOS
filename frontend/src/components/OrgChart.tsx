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

interface NodeCardProps {
  node: OrgNode
}

function NodeCard({ node }: NodeCardProps) {
  const colorClass = LEVEL_COLORS[node.level] || 'border-slate-600 text-slate-400'
  const label = LEVEL_LABELS[node.level] || node.level

  return (
    <div className={`border rounded-lg px-3 py-2 text-center min-w-[120px] max-w-[160px] ${colorClass}`}>
      <div className="text-[10px] font-medium opacity-70 mb-0.5">{label}</div>
      <div className="text-xs font-semibold truncate">{node.name}</div>
      {node.role !== node.name && (
        <div className="text-[10px] opacity-60 truncate mt-0.5">{node.role}</div>
      )}
      {node.ai_provider && node.ai_provider !== 'mock' && (
        <div className="text-[9px] mt-1 opacity-50 font-mono">{node.ai_provider}</div>
      )}
    </div>
  )
}

interface OrgTreeProps {
  nodes: OrgNode[]
  depth?: number
}

function OrgTree({ nodes, depth = 0 }: OrgTreeProps) {
  if (nodes.length === 0) return null

  return (
    <div className="flex flex-col items-center gap-0">
      <div
        className={`flex gap-6 ${depth > 0 ? 'pt-4' : ''}`}
        style={{ position: 'relative' }}
      >
        {nodes.map((node) => (
          <div key={node.id} className="flex flex-col items-center">
            <NodeCard node={node} />
            {node.children && node.children.length > 0 && (
              <>
                {/* Vertical connector */}
                <div className="w-px h-4 bg-bg-border" />
                {/* Horizontal bar if multiple children */}
                {node.children.length > 1 && (
                  <div
                    className="h-px bg-bg-border"
                    style={{
                      width: `calc(${node.children.length * 136 + (node.children.length - 1) * 24}px - 8px)`,
                    }}
                  />
                )}
                <OrgTree nodes={node.children} depth={depth + 1} />
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface OrgChartProps {
  tree: OrgNode[]
  className?: string
}

export default function OrgChart({ tree, className = '' }: OrgChartProps) {
  if (!tree || tree.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        조직도 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className={`overflow-auto ${className}`}>
      <div className="min-w-max p-6 flex justify-center">
        <OrgTree nodes={tree} />
      </div>
    </div>
  )
}
