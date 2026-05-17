import React from 'react';
import { reportError } from '../utils/errorTracker';

/**
 * 전역 React 크래시 캐처
 *
 * - render 도중 throw 된 에러를 잡아 client_errors에 보고하고
 *   사용자에게 흰 화면 대신 안내 + 새로고침 버튼을 보여준다.
 * - 이미 DirectorScriptViewer 등 일부에 자체 ErrorBoundary가 있지만
 *   그 아래에서는 자식 컴포넌트 단위로 처리되고, 그 위/바깥에서 발생한 크래시는
 *   여기서 잡힌다.
 */
export default class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    try {
      reportError({
        source: 'react',
        message: error?.message || String(error),
        stack: (info && info.componentStack)
          ? `${error?.stack || ''}\n\n[componentStack]\n${info.componentStack}`
          : error?.stack,
        url: window.location.href,
      });
    } catch {}
  }

  handleReload = () => {
    try { window.location.reload(); } catch {}
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: '#1a1a1a', color: '#e0e0e0',
      }}>
        <div style={{
          maxWidth: 480, width: '100%', textAlign: 'center',
          background: '#1e1e2e', border: '1px solid #2e2e42', borderRadius: 12,
          padding: '32px 28px',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🛟</div>
          <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>화면을 그리는 중 문제가 발생했어요</div>
          <div style={{ fontSize: 13, color: '#999', lineHeight: 1.7, marginBottom: 24 }}>
            자동으로 오류가 기록되었어요. 잠시 후 새로고침을 시도해주세요.<br />
            계속 같은 문제가 발생하면 마이페이지 → 피드백 탭에서 알려주시면 빠르게 확인할게요.
          </div>
          <button
            onClick={this.handleReload}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: '#8DA0BB', color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: 'pointer',
            }}
          >새로고침</button>
        </div>
      </div>
    );
  }
}
