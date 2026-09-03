import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; fallback: (error: Error) => ReactNode }
interface State { error?: Error }

/** Keeps one failing subtree (e.g. the WebGL map) from blanking the whole application. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = {};
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { console.error("Nearcast component failed", error); }
  render() { return this.state.error ? this.props.fallback(this.state.error) : this.props.children; }
}
