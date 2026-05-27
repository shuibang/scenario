import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';
import { PROJECT_TYPE_PRESETS, getTypeLabel } from '../utils/projectTypes';
import { serializeProject } from '../utils/projectSerializer';

const STATUS_OPTIONS = [
  { value: 'draft',    label: '초고' },
  { value: 'revision', label: '수정' },
  { value: 'final',    label: '탈고' },
];

function safeName(title) {
  return (title || '대본').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || '대본';
}

// ─── Default fields (order-preserving array)
const DEFAULT_FIELDS = [
  { id: 'title',       label: '대본명',          type: 'input',    required: true },
  { id: 'subtitle',    label: '부제 / 형식',      type: 'input',    required: false },
  { id: 'writer',      label: '작가',             type: 'input',    required: false },
  { id: 'genre',       label: '장르',             type: 'input',    required: false },
];

function defaultValues() {
  const v = {};
  DEFAULT_FIELDS.forEach(f => { v[f.id] = ''; });
  return v;
}

// ─── Migrate old flat doc → new fields format
function migrateDoc(doc) {
  if (!doc) return { values: defaultValues(), customFields: [], noteMigrated: false };

  // note 값 추출 (신/구 포맷 모두 지원)
  const getNoteValue = (d) => {
    if (d.fields) return d.fields.find(f => f.id === 'note')?.value || '';
    return d.note || '';
  };

  const injectNoteMigration = (customFields, noteValue) => {
    if (!noteValue) return { customFields, noteMigrated: false };
    if (customFields.some(cf => cf.label === '기타 메모')) return { customFields, noteMigrated: false };
    return {
      customFields: [...customFields, { id: genId(), label: '기타 메모', value: noteValue }],
      noteMigrated: true,
    };
  };

  if (doc.fields) {
    const values = defaultValues();
    doc.fields.forEach(f => { if (f.id in values) values[f.id] = f.value || ''; });
    const noteValue = getNoteValue(doc);
    const { customFields, noteMigrated } = injectNoteMigration(doc.customFields || [], noteValue);
    return { values, customFields, noteMigrated };
  }

  // Old flat format
  const values = {
    title:       doc.title || '',
    subtitle:    doc.subtitle || '',
    writer:      doc.writer || '',
    coWriter:    doc.coWriter || '',
    genre:       doc.genre || '',
    broadcaster: doc.broadcaster || '',
  };
  const noteValue = getNoteValue(doc);
  const { customFields, noteMigrated } = injectNoteMigration(doc.customFields || [], noteValue);
  return { values, customFields, noteMigrated };
}

// ─── CoverPreview — used both in editor and for print/export
export function CoverPreview({ values, customFields }) {
  const allFields = [
    ...DEFAULT_FIELDS.map(f => ({ id: f.id, label: f.label, value: values[f.id] || '' })),
    ...(customFields || []),
  ].filter(f => f.value);

  const titleField = allFields.find(f => f.id === 'title');
  const subtitleField = allFields.find(f => f.id === 'subtitle');
  const rest = allFields.filter(f => f.id !== 'title' && f.id !== 'subtitle');

  // Dynamic title font size based on length
  const titleText = titleField?.value || '';
  const titleFontSize = titleText.length === 0 ? '1.75rem'
    : titleText.length <= 6  ? '2.25rem'
    : titleText.length <= 12 ? '1.75rem'
    : titleText.length <= 20 ? '1.4rem'
    : '1.1rem';

  // Subtitle: one line, smaller than title but not smaller than 0.8rem
  const subtitleFontSize = titleText.length <= 6 ? '1rem'
    : titleText.length <= 12 ? '0.9rem'
    : '0.8rem';

  return (
    <div
      className="rounded-lg shadow-2xl relative"
      style={{
        background: 'var(--c-header)',
        border: '1px solid var(--c-border2)',
        aspectRatio: '210/297',
        minHeight: '360px',
        overflow: 'hidden',
      }}
    >
      <div
        className="text-[9px] uppercase tracking-widest absolute top-4 w-full text-center"
        style={{ color: 'var(--c-text6)' }}
      >
        표지
      </div>

      {/* Title positioned at ~1/3 from top */}
      <div
        style={{
          position: 'absolute',
          top: '28%',
          left: 0,
          right: 0,
          textAlign: 'center',
          padding: '0 10%',
        }}
      >
        <div
          className="font-bold leading-snug mb-2"
          style={{ color: 'var(--c-text)', fontSize: titleFontSize }}
        >
          {titleText || <span style={{ color: 'var(--c-text6)' }}>대본명</span>}
        </div>
        {subtitleField?.value && (
          <div
            className="leading-snug"
            style={{ color: 'var(--c-text3)', fontSize: subtitleFontSize, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {subtitleField.value}
          </div>
        )}
      </div>

      {/* Divider at ~55% */}
      <div style={{ position: 'absolute', top: '55%', left: '10%', right: '10%', borderTop: '1px solid var(--c-border2)' }} />

      {/* Rest fields: below divider, max 13pt */}
      <div
        className="absolute text-center space-y-1"
        style={{ top: '58%', left: 0, right: 0, padding: '0 10%', fontSize: '13px', color: 'var(--c-text4)' }}
      >
        {rest.map(f => (
          <div key={f.id}>{f.label}: {f.value}</div>
        ))}
      </div>

    </div>
  );
}

// ─── CoverEditor
export default function CoverEditor() {
  const { state, dispatch } = useApp();
  const { activeProjectId, coverDocs, projects } = state;

  const existing = coverDocs.find(d => d.projectId === activeProjectId);
  const [values, setValues] = useState(defaultValues());
  const [customFields, setCustomFields] = useState([]);
  const [dirty, setDirty] = useState(false);
  const valuesRef = useRef(values);
  const customFieldsRef = useRef(customFields);
  valuesRef.current = values;
  customFieldsRef.current = customFields;
  const saveTimerRef = useRef(null);
  const dirtyRef = useRef(false);
  const existingRef = useRef(existing);
  const activeProjectIdRef = useRef(activeProjectId);
  const projectsRef = useRef(projects);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { existingRef.current = existing; }, [existing]);
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  // Load / migrate on project change
  useEffect(() => {
    const migrated = migrateDoc(existing);
    // 표지에 대본명이 없으면 프로젝트 제목으로 pre-fill
    if (!migrated.values.title) {
      const project = projects.find(p => p.id === activeProjectId);
      if (project?.title) migrated.values.title = project.title;
    }
    setValues(migrated.values);
    setCustomFields(migrated.customFields);
    // note 마이그레이션이 발생했으면 dirty로 표시해 자동 저장으로 반영
    setDirty(migrated.noteMigrated);
  }, [activeProjectId, existing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVal = (id, v) => {
    setValues(prev => ({ ...prev, [id]: v }));
    setDirty(true);
    // 대본명 변경 시 프로젝트 제목 즉시 동기화
    if (id === 'title') {
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, title: v } });
    }
  };

  const setCustomVal = (idx, v) => {
    setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, value: v } : f));
    setDirty(true);
  };

  const addCustomField = () => {
    setCustomFields(prev => [...prev, { id: genId(), label: '항목명', value: '' }]);
    setDirty(true);
  };

  const removeCustomField = (idx) => {
    setCustomFields(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateCustomLabel = (idx, label) => {
    setCustomFields(prev => prev.map((f, i) => i === idx ? { ...f, label } : f));
    setDirty(true);
  };

  const handleSave = React.useCallback(() => {
    const v = valuesRef.current;
    const cf = customFieldsRef.current;
    const fields = DEFAULT_FIELDS.map(f => ({ id: f.id, label: f.label, value: v[f.id] || '' }));
    const doc = {
      ...(existing || { id: genId(), createdAt: now() }),
      projectId: activeProjectId,
      title: v.title, subtitle: v.subtitle, writer: v.writer,
      coWriter: v.coWriter, genre: v.genre, broadcaster: v.broadcaster,
      note: v.note,
      fields, customFields: cf,
      updatedAt: now(),
    };
    dispatch({ type: 'SET_COVER', payload: doc });
    const project = projects.find(p => p.id === activeProjectId);
    if (project && v.title && project.title !== v.title) {
      dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, title: v.title } });
    }
    setDirty(false);
  }, [existing, activeProjectId, projects, dispatch]);

  // 1초 debounce 자동 저장
  useEffect(() => {
    if (!dirty || !activeProjectId) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => handleSave(), 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [dirty, values, customFields]); // eslint-disable-line react-hooks/exhaustive-deps

  // unmount 시 dirty이면 즉시 저장 (debounce 중 이탈 방지)
  useEffect(() => {
    return () => {
      if (!dirtyRef.current || !activeProjectIdRef.current) return;
      clearTimeout(saveTimerRef.current);
      const v = valuesRef.current;
      const cf = customFieldsRef.current;
      const fields = DEFAULT_FIELDS.map(f => ({ id: f.id, label: f.label, value: v[f.id] || '' }));
      const ex = existingRef.current;
      const doc = {
        ...(ex || { id: genId(), createdAt: now() }),
        projectId: activeProjectIdRef.current,
        title: v.title, subtitle: v.subtitle, writer: v.writer,
        coWriter: v.coWriter, genre: v.genre, broadcaster: v.broadcaster,
        note: v.note,
        fields, customFields: cf,
        updatedAt: now(),
      };
      dispatch({ type: 'SET_COVER', payload: doc });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 상단바 저장 버튼 이벤트 수신
  useEffect(() => {
    const onSave = () => handleSave();
    window.addEventListener('script:requestSave', onSave);
    return () => window.removeEventListener('script:requestSave', onSave);
  }, [handleSave]);

  const project = projects.find(p => p.id === activeProjectId);
  const [versionDialog, setVersionDialog] = useState(false);

  const handleVersionBump = (save) => {
    setVersionDialog(false);
    const currentVersion = project?.version ?? 1;
    if (save) {
      // cover 먼저 sync
      handleSave();
      // 현재 state + 방금 save한 cover doc으로 snapshot 빌드
      const v = valuesRef.current;
      const cf = customFieldsRef.current;
      const fields = DEFAULT_FIELDS.map(f => ({ id: f.id, label: f.label, value: v[f.id] || '' }));
      const coverDoc = {
        ...(existingRef.current || { id: genId(), createdAt: now() }),
        projectId: activeProjectId,
        title: v.title, subtitle: v.subtitle, writer: v.writer,
        coWriter: v.coWriter, genre: v.genre, broadcaster: v.broadcaster,
        note: v.note, fields, customFields: cf, updatedAt: now(),
      };
      const snapshotState = {
        ...state,
        coverDocs: [
          ...state.coverDocs.filter(d => d.projectId !== activeProjectId),
          coverDoc,
        ],
      };
      const snap = serializeProject(snapshotState, activeProjectId);
      if (snap) {
        const filename = `${safeName(v.title || project?.title)}_v${currentVersion}.djs`;
        const blob = new Blob(
          [JSON.stringify({ _readme: '대본작업실(daejak.kr) 전용 파일입니다.', ...snap }, null, 2)],
          { type: 'application/json' },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    }
    dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, version: currentVersion + 1 } });
  };

  if (!activeProjectId) return null;

  const inputCls = 'w-full text-sm px-3 py-2 rounded outline-none t-input-field';

  return (
    <div className="h-full overflow-y-auto relative" style={{ background: 'var(--c-bg)' }}>
      <div style={{ padding: 10 }}>

        {/* Form */}
        <div className="space-y-3">
          {DEFAULT_FIELDS.map(f => (
            <div key={f.id} className="flex items-center gap-3">
              <label className="text-xs shrink-0 text-center" style={{ width: '25%', color: 'var(--c-text5)' }}>
                {f.label}{f.required && ' *'}
              </label>
              <div style={{ width: '75%' }}>
                {f.type === 'textarea' ? (
                  <textarea
                    value={values[f.id]}
                    onChange={e => setVal(f.id, e.target.value)}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                ) : (
                  <input
                    value={values[f.id]}
                    onChange={e => setVal(f.id, e.target.value)}
                    className={inputCls}
                  />
                )}
              </div>
            </div>
          ))}

          {/* Custom fields */}
          {customFields.map((cf, idx) => (
            <div key={cf.id} className="flex items-center gap-3">
              <div className="shrink-0 text-center" style={{ width: '25%' }}>
                <input
                  value={cf.label}
                  onChange={e => updateCustomLabel(idx, e.target.value)}
                  placeholder="항목명"
                  className="text-xs bg-transparent outline-none text-center w-full"
                  style={{ color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border3)' }}
                />
              </div>
              <div className="flex items-center gap-2" style={{ width: '75%' }}>
                <input
                  value={cf.value}
                  onChange={e => setCustomVal(idx, e.target.value)}
                  className={`${inputCls} flex-1`}
                />
                <button
                  onClick={() => removeCustomField(idx)}
                  className="w-7 h-7 rounded text-sm shrink-0 flex items-center justify-center"
                  style={{ color: 'var(--c-text5)', border: '1px solid var(--c-border3)', background: 'transparent' }}
                  title="항목 삭제"
                >−</button>
              </div>
            </div>
          ))}

          {/* Add field button */}
          <button
            onClick={addCustomField}
            className="w-full py-2 rounded text-sm"
            style={{
              color: 'var(--c-text4)',
              border: '1px dashed var(--c-border3)',
              background: 'transparent',
            }}
          >
            + 항목 추가
          </button>
        </div>

        {/* ── 대본 정보 ── */}
        <div style={{ marginTop: 28, borderTop: '1px solid var(--c-border2)', paddingTop: 18 }}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>대본 정보</span>
            <span style={{ fontSize: 11, color: 'var(--c-text5)' }}>표지에 표기되지 않습니다</span>
          </div>

          {/* 형식 */}
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span className="text-xs shrink-0 text-center" style={{ width: '25%', color: 'var(--c-text5)' }}>형식</span>
            <select
              value={PROJECT_TYPE_PRESETS.some(t => t.id === project?.projectType) ? project.projectType : PROJECT_TYPE_PRESETS[0].id}
              onChange={e => dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, projectType: e.target.value } })}
              className="text-sm rounded outline-none t-input-field"
              style={{ width: '75%', padding: '6px 10px' }}
            >
              {PROJECT_TYPE_PRESETS.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* 분량 */}
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span className="text-xs shrink-0 text-center" style={{ width: '25%', color: 'var(--c-text5)' }}>분량</span>
            <div className="flex items-center gap-2" style={{ width: '75%' }}>
              <input
                type="number"
                min={1}
                value={project?.totalMins ?? ''}
                onChange={e => dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, totalMins: Number(e.target.value) } })}
                className="text-sm rounded outline-none t-input-field"
                style={{ width: 72, padding: '6px 10px' }}
              />
              <span className="text-xs" style={{ color: 'var(--c-text5)' }}>분</span>
            </div>
          </div>

          {/* 상태 */}
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span className="text-xs shrink-0 text-center" style={{ width: '25%', color: 'var(--c-text5)' }}>상태</span>
            <div className="flex gap-1" style={{ width: '75%' }}>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, status: opt.value } })}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
                    border: '1px solid var(--c-border2)', cursor: 'pointer',
                    background: (project?.status || 'draft') === opt.value ? 'var(--c-accent)' : 'transparent',
                    color: (project?.status || 'draft') === opt.value ? '#fff' : 'var(--c-text4)',
                    transition: 'background 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 메모 */}
          <div className="flex items-start gap-3" style={{ marginBottom: 10 }}>
            <span className="text-xs shrink-0 text-center" style={{ width: '25%', color: 'var(--c-text5)', paddingTop: 8 }}>메모</span>
            <textarea
              value={project?.memo || ''}
              onChange={e => dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, memo: e.target.value } })}
              rows={3}
              placeholder="메모"
              className={`${inputCls} resize-none`}
              style={{ width: '75%' }}
            />
          </div>

          {/* 버전 — 수정 상태일 때만 표시 */}
          {(project?.status || 'draft') === 'revision' && (
          <div className="flex items-center gap-3" style={{ marginBottom: 10 }}>
            <span className="text-xs shrink-0 text-center" style={{ width: '25%', color: 'var(--c-text5)' }}>버전</span>
            <div className="flex items-center gap-2" style={{ width: '75%' }}>
              {project?.version != null ? (
                <>
                  <span className="text-sm font-semibold" style={{ color: 'var(--c-accent)' }}>v{project.version}</span>
                  <button
                    onClick={() => setVersionDialog(true)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12,
                      border: '1px solid var(--c-border2)', background: 'transparent',
                      color: 'var(--c-text4)', cursor: 'pointer',
                    }}
                  >
                    버전 올리기 →
                  </button>
                </>
              ) : (
                <button
                  onClick={() => dispatch({ type: 'UPDATE_PROJECT', payload: { id: activeProjectId, version: 1 } })}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 12,
                    border: '1px dashed var(--c-border3)', background: 'transparent',
                    color: 'var(--c-text4)', cursor: 'pointer',
                  }}
                >
                  + 버전 관리 시작
                </button>
              )}
            </div>
          </div>
          )}

          {/* 생성일 / 수정일 */}
          {project && (
            <div className="flex gap-3 text-xs" style={{ color: 'var(--c-text5)', marginTop: 6 }}>
              <span>생성 {new Date(project.createdAt).toLocaleDateString('ko-KR')}</span>
              <span>·</span>
              <span>수정 {new Date(project.updatedAt).toLocaleDateString('ko-KR')}</span>
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>

      {/* 버전 올리기 확인 다이얼로그 */}
      {versionDialog && project?.version != null && (
        <div
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
          }}
          onClick={() => setVersionDialog(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--c-card)', border: '1px solid var(--c-border2)',
              borderRadius: 12, padding: '22px 24px', maxWidth: 300, width: '90%',
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 8 }}>
              버전 올리기
            </div>
            <div style={{ fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.7, marginBottom: 18 }}>
              현재까지 작성한 내용을 <strong>v{project.version}</strong>으로 저장합니다.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => handleVersionBump(false)}
                style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 13,
                  border: '1px solid var(--c-border2)', background: 'transparent',
                  color: 'var(--c-text4)', cursor: 'pointer',
                }}
              >
                닫기
              </button>
              <button
                onClick={() => handleVersionBump(true)}
                style={{
                  padding: '7px 16px', borderRadius: 7, fontSize: 13,
                  background: 'var(--c-accent)', color: '#fff', border: 'none', cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
