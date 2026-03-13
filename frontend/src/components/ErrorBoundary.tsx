import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '2rem',
          color: '#94a3b8',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '480px',
            textAlign: 'center',
          }}>
            <h3 style={{ color: '#f87171', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
              오류가 발생했습니다
            </h3>
            <p style={{ fontSize: '0.85rem', marginBottom: '1rem', color: '#64748b' }}>
              {this.state.error?.message || '알 수 없는 오류'}
            </p>
            <button
              onClick={this.handleReset}
              style={{
                background: '#6366f1',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '0.5rem 1.5rem',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
