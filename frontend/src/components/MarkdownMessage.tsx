/**
 * MarkdownMessage: renders chat message content as rich markdown.
 * Supports: tables, code blocks, bold/italic, bullet lists, headers.
 */
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Props {
  content: string
  streaming?: boolean
}

export default function MarkdownMessage({ content, streaming }: Props) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ────────────────────────────────────────────────────────
          h1: ({ children }) => (
            <h1 className="text-base font-bold text-slate-100 mt-3 mb-1.5 border-b border-bg-border pb-1">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-sm font-bold text-slate-200 mt-2.5 mb-1">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-xs font-semibold text-slate-300 mt-2 mb-1">{children}</h3>
          ),

          // ── Paragraph ───────────────────────────────────────────────────────
          p: ({ children }) => (
            <p className="text-sm leading-relaxed text-slate-200 mb-1.5">{children}</p>
          ),

          // ── Lists ───────────────────────────────────────────────────────────
          ul: ({ children }) => (
            <ul className="list-disc list-outside ml-4 space-y-0.5 mb-1.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-outside ml-4 space-y-0.5 mb-1.5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-sm leading-relaxed text-slate-200">{children}</li>
          ),

          // ── Inline code ─────────────────────────────────────────────────────
          code: ({ className, children, ...props }) => {
            const isInline = !className
            if (isInline) {
              return (
                <code
                  className="text-xs font-mono px-1.5 py-0.5 rounded text-amber-300"
                  style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}
                  {...props}
                >
                  {children}
                </code>
              )
            }
            // Block code
            const lang = className?.replace('language-', '') || ''
            return (
              <div className="my-2 rounded-lg overflow-hidden" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
                {lang && (
                  <div
                    className="flex items-center justify-between px-3 py-1.5"
                    style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <span className="text-[10px] text-slate-500 font-mono">{lang}</span>
                  </div>
                )}
                <pre className="overflow-x-auto p-3">
                  <code className="text-xs font-mono text-slate-300 leading-relaxed" {...props}>{children}</code>
                </pre>
              </div>
            )
          },

          // ── Tables ──────────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
              <table className="w-full text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead style={{ background: 'rgba(99,102,241,0.1)', borderBottom: '1px solid rgba(99,102,241,0.2)' }}>{children}</thead>
          ),
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => (
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left text-[11px] font-semibold text-indigo-300">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-slate-300">{children}</td>
          ),

          // ── Blockquote ──────────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote
              className="my-2 pl-3 text-sm text-slate-400 italic"
              style={{ borderLeft: '3px solid rgba(99,102,241,0.5)' }}
            >
              {children}
            </blockquote>
          ),

          // ── Strong / Em ─────────────────────────────────────────────────────
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-100">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-slate-300">{children}</em>
          ),

          // ── Horizontal rule ─────────────────────────────────────────────────
          hr: () => <hr className="my-2 border-bg-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming && (
        <span
          className="inline-block w-0.5 h-4 bg-slate-400 ml-0.5 align-middle"
          style={{ animation: 'blink 1s step-end infinite' }}
        />
      )}
    </div>
  )
}
