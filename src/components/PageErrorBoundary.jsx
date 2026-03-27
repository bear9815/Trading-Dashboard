import { Component } from 'react'

export default class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-red-400 font-semibold mb-2">Something went wrong on this page</p>
          <p className="text-gray-500 text-sm mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs text-accent-blue hover:underline"
          >Try again</button>
        </div>
      </div>
    )
    return this.props.children
  }
}
