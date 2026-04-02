import React, { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { genId, now } from '../store/db';

// ─── Default fields (order-preserving array)
const DEFAULT_FIELDS = [
  { id: 'title',       label: '작품명',          type: 'input',    required: true },
  { id: 'subtitle',    label: '부제 / 형식',      type: 'input',    required: false },
  { id: 'writer',      label: '작가',             type: 'input',    required: false },
  { id: 'coWriter',    label: '보조작가',          type: 'input',    required: false },
  { id: 'genre',       label: '장르',             type: 'input',    required: false },
  { id: 'broadcaster', label: '방송사',            type: 'input',    required: false },
  { id: 'note',        label: '기타 메모',         type: 'textarea', required: false },
];

function defaultValues() {
  const v = {};
  DEFAULT_FIELDS.forEach(f => { v[f.id] = ''; });
  return v;
}

// ─── Migrate old flat doc → new fields format
function migrateDoc(doc) {
  if (!doc) return { values: defaultValues(), customFields: [] };
  if (doc.fields) {
    // Already new format
    const values = defaultValues();
    const customFields = doc.customFields || [];
    doc.fields.forEach(f => { if (f.id in values) values[f.id] = f.value || ''; });
    return { values, customFields };
  }
  // Old flat format
  const values = {
    title:       doc.title || '',
    subtitle:    doc.subtitle || '',
    writer:      doc.writer || '',
    coWriter:    doc.coWriter || '',
    genre:       doc.genre || '',
    broadcaster: doc.broadcaster || '',
    note:        doc.note || '',
  };
  return { values, customFields: doc.customFields || [] };
}

// ─── CoverPreview — used both in editor and for print/export
export function CoverPreview({ values, customFields }) {
  const allFields = [
    ...DEFAULT_FIELDS.map(f => ({ id: f.id, label: f.label, value: values[f.id] || '' })),
    ...(customFields || []),
  ].filter(f => f.value);

  const titleField = allFields.find(f => f.id === 'title');
  const subtitleField = allFields.find(f => f.id === 'subtitle');
  const rest = allFields.filter(f => f.id !== 'title' && f.id !== 'subtitle' && f.id !== 'note');
  const noteField = allFields.find(f => f.id === 'note');

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
          {titleText || <span style={{ color: 'var(--c-text6)' }}>작품명</span>}
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

      {noteField?.value && (
        <div
          className="absolute bottom-4 italic text-center w-full"
          style={{ fontSize: '11px', color: 'var(--c-text5)', padding: '0 10%' }}
        >
          {noteField.value}
        </div>
      )}
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
  const valuesRef = React.useRef(values);
  const customFieldsRef = React.useRef(customFields);
  valuesRef.current = values;
  customFieldsRef.current = customFields;

  // Load / migrate on project change
  useEffect(() => {
    const migrated = migrateDoc(existing);
    setValues(migrated.values);
    setCustomFields(migrated.customFields);
    setDirty(false);
  }, [activeProjectId, existing?.id]);

  const setVal = (id, v) => {
    setValues(prev => ({ ...prev, [id]: v }));
    setDirty(true);
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

  // 상단바 저장 버튼 이벤트 수신
  useEffect(() => {
    const onSave = () => handleSave();
    window.addEventListener('script:requestSave', onSave);
    return () => window.removeEventListener('script:requestSave', onSave);
  }, [handleSave]);

  if (!activeProjectId) return null;

  const inputCls = 'w-full text-sm px-3 py-2 rounded outline-none t-input-field';

  return (
    <div className="h-full overflow-y-auto relative" style={{ background: 'var(--c-bg)' }}>
      <div className="max-w-xl mx-auto py-4 px-8">

        {/* Form */}
        <div className="space-y-3">
          {DEFAULT_FIELDS.map(f => (
            <div key={f.id} className="flex items-start gap-2">
              <div className="flex-1">
                <label className="block text-xs mb-1" style={{ color: 'var(--c-text5)' }}>
                  {f.label}{f.required && ' *'}
                </label>
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
              {/* Fixed fields cannot be removed, show placeholder */}
              <div className="w-7 shrink-0 mt-6" />
            </div>
          ))}

          {/* Custom fields */}
          {customFields.map((cf, idx) => (
            <div key={cf.id} className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  value={cf.label}
                  onChange={e => updateCustomLabel(idx, e.target.value)}
                  placeholder="항목명"
                  className="block text-xs mb-1 bg-transparent outline-none"
                  style={{ color: 'var(--c-text5)', borderBottom: '1px solid var(--c-border3)', width: '100%' }}
                />
                <input
                  value={cf.value}
                  onChange={e => setCustomVal(idx, e.target.value)}
                  className={inputCls}
                />
              </div>
              <button
                onClick={() => removeCustomField(idx)}
                className="w-7 h-7 rounded text-sm shrink-0 mt-5 flex items-center justify-center"
                style={{
                  color: 'var(--c-text5)',
                  border: '1px solid var(--c-border3)',
                  background: 'transparent',
                }}
                title="항목 삭제"
              >
                −
              </button>
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

        <div className="h-8" />
      </div>
    </div>
  );
}
