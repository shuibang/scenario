import React, { useState, useRef } from 'react';
import Modal, { ModalBtn } from './Modal';
import { useApp } from '../../store/AppContext';
import { parseHwpxFile } from '../../utils/hwpxParser';
import { parseScriptText } from '../../utils/parseScriptText';
import { genId, now } from '../../store/db';

export default function ImportHwpxModal({ open, onClose }) {
  const { state, dispatch } = useApp();
  const { activeProjectId, activeEpisodeId, episodes, characters, scriptBlocks } = state;

  const [step, setStep]       = useState('select'); // 'select' | 'confirm'
  const [fileName, setFileName] = useState('');
  const [parsedText, setParsedText] = useState('');
  const [mode, setMode]       = useState('append'); // 'append' | 'new'
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const inputRef = useRef(null);

  const projectEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);
  const activeEp = projectEpisodes.find(e => e.id === activeEpisodeId);
  const currentBlocks = scriptBlocks.filter(b => b.episodeId === activeEpisodeId);
  const hasContent = currentBlocks.length > 0;

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError('파일 크기가 10MB를 초과합니다. 더 작은 파일을 사용해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { paragraphs, metadata } = await parseHwpxFile(file);

      if (!paragraphs.length) {
        setError('내용이 없는 파일입니다.');
        return;
      }

      if (metadata.paragraphCount > 10000) {
        setError(`문단 수가 너무 많습니다 (${metadata.paragraphCount}개). 분할하여 가져오세요.`);
        return;
      }

      const text = paragraphs.map(p => p.text).join('\n');
      setParsedText(text);
      setFileName(file.name);
      setMode(hasContent ? 'new' : 'append');
      setStep('confirm');
    } catch (err) {
      setError('HWPX 파일을 읽을 수 없습니다: ' + (err?.message || String(err)));
    } finally {
      setLoading(false);
      // input 초기화 — 같은 파일 재선택 허용
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleImport = () => {
    const projectChars = characters.filter(c => c.projectId === activeProjectId);

    if (mode === 'append' && activeEpisodeId) {
      const newBlocks = parseScriptText(parsedText, {
        episodeId:  activeEpisodeId,
        projectId:  activeProjectId,
        characters: projectChars,
      });
      dispatch({ type: 'SET_BLOCKS', episodeId: activeEpisodeId,
        payload: [...currentBlocks, ...newBlocks] });
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: activeEpisodeId });
      dispatch({ type: 'SET_PENDING_RELOAD', episodeId: activeEpisodeId });

    } else {
      const nextNum  = (projectEpisodes[projectEpisodes.length - 1]?.number || 0) + 1;
      const baseName = fileName.replace(/\.hwpx$/i, '');
      const ep = {
        id: genId(), projectId: activeProjectId,
        number: nextNum,
        title: baseName,
        majorEpisodes: '', summaryItems: [],
        status: 'draft', createdAt: now(), updatedAt: now(),
      };
      dispatch({ type: 'ADD_EPISODE', payload: ep });

      const newBlocks = parseScriptText(parsedText, {
        episodeId:  ep.id,
        projectId:  activeProjectId,
        characters: projectChars,
      });
      dispatch({ type: 'SET_BLOCKS', episodeId: ep.id, payload: newBlocks });
      dispatch({ type: 'SET_ACTIVE_EPISODE', id: ep.id });
      dispatch({ type: 'SET_PENDING_RELOAD', episodeId: ep.id });
    }

    handleClose();
  };

  const handleClose = () => {
    setStep('select');
    setFileName('');
    setParsedText('');
    setError(null);
    setLoading(false);
    onClose();
  };

  const lineCount = parsedText.split('\n').filter(l => l.trim()).length;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="HWPX 가져오기"
      size="sm"
      description="한글(HWPX) 파일에서 대본을 가져옵니다."
      footer={
        <>
          <ModalBtn variant="secondary" onClick={handleClose}>취소</ModalBtn>
          {step === 'select' && (
            <ModalBtn variant="primary" onClick={() => inputRef.current?.click()} disabled={loading}>
              {loading ? '읽는 중…' : '파일 선택'}
            </ModalBtn>
          )}
          {step === 'confirm' && (
            <ModalBtn variant="primary" onClick={handleImport}>
              가져오기
            </ModalBtn>
          )}
        </>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept=".hwpx"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {step === 'select' && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <p style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 6 }}>
            한글(HWPX) 파일에서 대본을 가져옵니다.
          </p>
          <p style={{ fontSize: 11, color: 'var(--c-text5)', lineHeight: 1.6 }}>
            씬 번호·지문·대사를 자동으로 인식합니다.<br />
            서식(굵기·크기)은 무시되며 텍스트만 가져옵니다.
          </p>
          {error && (
            <p style={{ fontSize: 12, color: 'var(--c-danger, #e53e3e)', marginTop: 12 }}>{error}</p>
          )}
        </div>
      )}

      {step === 'confirm' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--c-text3)', marginBottom: 14 }}>
            <strong>{fileName}</strong> — 텍스트 {lineCount}줄 인식됨
          </div>

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text5)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            가져오기 방식
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
            <input
              type="radio"
              name="hwpx-import-mode"
              checked={mode === 'append'}
              onChange={() => setMode('append')}
              style={{ marginTop: 2, accentColor: 'var(--c-accent)' }}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--c-text2)', fontWeight: 500 }}>
                현재 회차에 이어붙이기
              </div>
              <div style={{ fontSize: 10, color: 'var(--c-text5)', marginTop: 2 }}>
                {activeEp ? `${activeEp.number}회 ${activeEp.title || ''}` : '(현재 회차 없음)'} 끝에 추가
              </div>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
            <input
              type="radio"
              name="hwpx-import-mode"
              checked={mode === 'new'}
              onChange={() => setMode('new')}
              style={{ marginTop: 2, accentColor: 'var(--c-accent)' }}
            />
            <div>
              <div style={{ fontSize: 12, color: 'var(--c-text2)', fontWeight: 500 }}>
                새 회차로 만들기
              </div>
              <div style={{ fontSize: 10, color: 'var(--c-text5)', marginTop: 2 }}>
                {projectEpisodes.length + 1}회차로 생성 — 파일명이 회차 제목으로 설정됩니다
              </div>
            </div>
          </label>

          <div style={{ marginTop: 14, padding: '8px 10px', borderRadius: 6, background: 'var(--c-bg3)', fontSize: 10, color: 'var(--c-text5)', lineHeight: 1.5 }}>
            미인식 줄은 지문으로 처리됩니다. 가져온 후 블록 유형을 직접 수정하세요.
          </div>
        </div>
      )}
    </Modal>
  );
}
