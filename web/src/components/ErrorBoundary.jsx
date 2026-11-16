import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === "function") {
      this.props.onError(error, info);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const msg =
        (this.state.error &&
          (this.state.error.message || String(this.state.error))) ||
        "Unexpected runtime error.";

      return (
        <div className="min-h-screen w-full bg-[#070709] text-[#E2E4E9] flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-2xl bg-[#0E0E12] border border-white/[0.12] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-[#E2E4E9]" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-[#E2E4E9]">
                  Workstation Runtime Recovery
                </h1>
                <p className="text-[11px] font-mono text-[#9CA3AF]">
                  Color Match Tool encountered a rendering error
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-[#070709] border border-white/[0.08] p-3 text-xs font-mono text-red-300 break-words">
              {msg}
            </div>

            <button
              type="button"
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#E2E4E9] hover:bg-white text-[#0E0E11] text-xs font-semibold cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reload Workstation</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
