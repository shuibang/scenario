/**
 * SharedReviewView — 공유 링크로 열었을 때 보이는 읽기전용 미리보기 + 피드백 패널
 *
 * URL hash: #review=SHORT_ID  (Supabase 저장, 새 방식)
 *           #review=BASE64    (구형 링크 폴백)
 */
import React, { useState, useEffect } from 'react';
import PreviewRenderer from '../print/PreviewRenderer';
import { loadReviewPayload, isShortReviewId } from '../utils/reviewShare';

function decodeLegacy(hash) {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(hash.slice(8))))));
  } catch {
    return null;
  }
}

export default function SharedReviewView() {
  const [data, setData]       = useState(null);
  const [bad,  setBad]        = useState(false);
  const [feedback, setFeedback] = useState('');
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    const val = window.location.hash.slice(8); // '#review=' 제거
    if (isShortReviewId(val)) {
      loadReviewPayload(val)
        .then(setData)
        .catch(() => setBad(true));
    } else {
      const result = decodeLegacy(window.location.hash);
      if (result) setData(result);
      else setBad(true);
    }
  }, []);

  if (bad) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888', fontSize: 14 }}>
      링크가 올바르지 않거나 만료되었습니다.
    </div>
  );
  if (!data) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#aaa', fontSize: 13 }}>
      불러오는 중…
    </div>
  );

  const appState = {
    projects:     data.projects     || [],
    episodes:     data.episodes     || [],
    characters:   data.characters   || [],
    scenes:       data.scenes       || [],
    scriptBlocks: data.scriptBlocks || [],
    coverDocs:    data.coverDocs    || [],
    synopsisDocs: data.synopsisDocs || [],
    activeProjectId: data.activeProjectId,
    stylePreset:  data.stylePreset  || {},
    initialized: true,
  };
  const selections = data.selections || { cover: true, synopsis: true, episodes: {}, chars: true };
  const projectTitle = data.projects?.[0]?.title || '대본';

  const handleCopy = async () => {
    const text = `[${projectTitle} 피드백]\n\n${feedback}`.trim();
    try { await navigator.clipboard.writeText(text); }
    catch {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el);
      el.select(); document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#d8d8d8', fontFamily: 'sans-serif' }}>

      {/* ── 미리보기 ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 16px' }}>
        <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '13px', color: '#555', fontWeight: 600 }}>
          {projectTitle} — 검토 요청
        </div>
        <PreviewRenderer appState={appState} selections={selections} columnWidth={340} />
      </div>

      {/* ── 피드백 패널 ── */}
      <div style={{
        width: '280px', flexShrink: 0,
        background: '#fff', borderLeft: '1px solid #ddd',
        display: 'flex', flexDirection: 'column',
        padding: '20px 16px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#222', marginBottom: '4px' }}>피드백</div>
        <div style={{ fontSize: '11px', color: '#999', marginBottom: '16px' }}>
          작성 후 복사해서 전달하세요.
        </div>

        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          placeholder={`${projectTitle}에 대한 피드백을 자유롭게 작성하세요.`}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #e0e0e0',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '12px',
            lineHeight: 1.7,
            color: '#333',
            outline: 'none',
            fontFamily: 'inherit',
          }}
          onFocus={e => { e.target.style.borderColor = '#5a5af5'; }}
          onBlur={e => { e.target.style.borderColor = '#e0e0e0'; }}
        />

        <button
          onClick={handleCopy}
          disabled={!feedback.trim()}
          style={{
            marginTop: '12px',
            padding: '10px',
            background: feedback.trim() ? '#5a5af5' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: feedback.trim() ? 'pointer' : 'default',
            fontSize: '13px',
            fontWeight: 600,
            transition: 'background 0.15s',
          }}
        >
          {copied ? '복사됨 ✓' : '피드백 복사'}
        </button>

        <div style={{ marginTop: '10px', fontSize: '10px', color: '#bbb', lineHeight: 1.5, textAlign: 'center' }}>
          복사한 피드백을 메시지·이메일로<br/>작가에게 전달하세요.
        </div>
      </div>
    </div>
  );
}
