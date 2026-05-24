import React, { useState, useEffect } from 'react';
import { useDriveAuthState }     from '../hooks/useDriveAuthState';
import { useDropboxAuthState }   from '../hooks/useDropboxAuthState';
import { getActiveProvider, setActiveProvider } from '../store/storageProvider';
import { clearAccessToken }      from '../store/googleDrive';
import { connectDropbox, clearDropboxToken } from '../store/dropbox';
import { guardedSignInWithGoogle } from '../utils/guardedSignIn';

// ── 라디오 인디케이터 ─────────────────────────────────────────────────────────
function RadioDot({ selected }) {
  return (
    <span style={{
      width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
      border: `1.5px solid ${selected ? 'var(--c-accent)' : 'var(--c-border3)'}`,
      background: selected ? 'var(--c-accent)' : 'transparent',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'border-color 0.15s, background 0.15s',
    }}>
      {selected && (
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />
      )}
    </span>
  );
}

// ── 프로바이더 행 ─────────────────────────────────────────────────────────────
function ProviderRow({ selected, onSelect, icon, name, valid, accountLabel, connectLabel, onConnect, onDisconnect }) {
  const btnBase = {
    fontSize: 11, borderRadius: 5, padding: '4px 10px',
    border: '1px solid var(--c-border3)', cursor: 'pointer',
    background: 'transparent', transition: 'opacity 0.15s',
  };

  return (
    <button
      onClick={onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '10px 12px', borderRadius: 8, textAlign: 'left',
        border: `1px solid ${selected ? 'var(--c-accent)' : 'var(--c-border3)'}`,
        background: selected
          ? 'color-mix(in srgb, var(--c-accent) 6%, transparent)'
          : 'transparent',
        cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <RadioDot selected={selected} />

      {/* 아이콘 */}
      <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1 }}>{icon}</span>

      {/* 이름 + 계정 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--c-text)', lineHeight: 1.3 }}>{name}</div>
        {valid && accountLabel && (
          <div style={{ fontSize: 10, color: 'var(--c-text5)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {accountLabel}
          </div>
        )}
      </div>

      {/* 상태 + 액션 버튼 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        onClick={e => e.stopPropagation()} // 버튼 클릭이 행 선택으로 bubble되지 않도록
      >
        {valid ? (
          <>
            <span style={{ fontSize: 10, color: '#22c55e', whiteSpace: 'nowrap' }}>● 연결됨</span>
            <button
              onClick={onDisconnect}
              style={{ ...btnBase, color: 'var(--c-text5)' }}
            >
              연결 해제
            </button>
          </>
        ) : (
          <button
            onClick={onConnect}
            style={{
              ...btnBase,
              color: selected ? 'var(--c-accent)' : 'var(--c-text4)',
              borderColor: selected ? 'var(--c-accent)' : 'var(--c-border3)',
              fontWeight: selected ? 600 : 400,
            }}
          >
            {connectLabel}
          </button>
        )}
      </div>
    </button>
  );
}

// ── 클라우드 저장소 선택 섹션 ─────────────────────────────────────────────────
export default function StorageSettingsSection() {
  const { valid: googleValid } = useDriveAuthState();
  const { valid: dropboxValid } = useDropboxAuthState();

  const [activeProvider, setActive] = useState(getActiveProvider);

  // storage:provider-changed 이벤트로 다른 곳에서 변경했을 때 동기화
  useEffect(() => {
    const update = () => setActive(getActiveProvider());
    window.addEventListener('storage:provider-changed', update);
    return () => window.removeEventListener('storage:provider-changed', update);
  }, []);

  // Google 계정 이메일 — localStorage 'drama_auth_user'에서 읽음
  const [googleEmail, setGoogleEmail] = useState(() => {
    try { return JSON.parse(localStorage.getItem('drama_auth_user'))?.email ?? null; } catch { return null; }
  });
  useEffect(() => {
    const update = () => {
      try { setGoogleEmail(JSON.parse(localStorage.getItem('drama_auth_user'))?.email ?? null); } catch { setGoogleEmail(null); }
    };
    window.addEventListener('drive:auth-changed', update);
    return () => window.removeEventListener('drive:auth-changed', update);
  }, []);

  const handleSelect = (p) => {
    setActive(p);
    setActiveProvider(p);
  };

  return (
    <div
      className="rounded-lg"
      style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', padding: '12px 16px' }}
    >
      <div className="text-sm font-medium mb-1" style={{ color: 'var(--c-text)' }}>클라우드 저장소</div>
      <div className="text-xs mb-3" style={{ color: 'var(--c-text5)' }}>
        자동 저장에 사용할 클라우드 서비스를 선택하세요. 선택한 서비스에 연결되어 있어야 동기화됩니다.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <ProviderRow
          selected={activeProvider === 'google'}
          onSelect={() => handleSelect('google')}
          icon="🔵"
          name="Google Drive"
          valid={googleValid}
          accountLabel={googleEmail}
          connectLabel="Google로 로그인"
          onConnect={() => guardedSignInWithGoogle()}
          onDisconnect={() => clearAccessToken()}
        />
        <ProviderRow
          selected={activeProvider === 'dropbox'}
          onSelect={() => handleSelect('dropbox')}
          icon="🟦"
          name="Dropbox"
          valid={dropboxValid}
          accountLabel={null}
          connectLabel="Dropbox 연결하기"
          onConnect={() => connectDropbox()}
          onDisconnect={() => clearDropboxToken()}
        />
      </div>

      {/* 선택된 프로바이더가 미연결인 경우 안내 */}
      {activeProvider === 'google' && !googleValid && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--c-text6)', lineHeight: 1.5 }}>
          ※ Google 계정으로 로그인하면 Drive에 자동으로 연결됩니다.
        </div>
      )}
      {activeProvider === 'dropbox' && !dropboxValid && (
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--c-text6)', lineHeight: 1.5 }}>
          ※ Dropbox 연결 후 자동 저장이 활성화됩니다.
        </div>
      )}
    </div>
  );
}
