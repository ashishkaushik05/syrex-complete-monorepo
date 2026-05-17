import type { ReactNode } from 'react'
import { Component } from 'react'

import { Button } from '@/components/ui/button'

type DashboardErrorBoundaryProps = {
  children: ReactNode
  resetKey?: string
}

type DashboardErrorBoundaryState = {
  hasError: boolean
}

export class DashboardErrorBoundary extends Component<
  DashboardErrorBoundaryProps,
  DashboardErrorBoundaryState
> {
  state: DashboardErrorBoundaryState = {
    hasError: false,
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidUpdate(prevProps: DashboardErrorBoundaryProps) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  componentDidCatch(error: unknown) {
    console.error('[dashboard/error-boundary]', error)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dashboard error</h2>
          <p className="mt-2 text-sm text-slate-600">
            Something went wrong while rendering this page. You can retry without losing your session.
          </p>
          <div className="mt-4 flex gap-2">
            <Button type="button" onClick={() => this.setState({ hasError: false })}>
              Retry
            </Button>
            <Button type="button" variant="outline" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        </div>
      </div>
    )
  }
}
