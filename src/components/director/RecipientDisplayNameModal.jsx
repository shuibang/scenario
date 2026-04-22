import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getFeedbackDisplayNameMaxLength,
  normalizeFeedbackDisplayName,
} from '../../utils/feedbackDisplayName';

export default function RecipientDisplayNameModal({
  open,
  initialValue = '',
  suggestedValue = '',
  allowClose = false,
  onSubmit,
  onClose,
}) {
  const inputRef = useRef(null);
  const [value, setValue] = useState(initialValue || suggestedValue || '');
  const [error, setError] = useState('');

  const maxLength = getFeedbackDisplayNameMaxLength();
  const helperText = useMemo(
    () => `작가에게 보일 이름입니다. 이후 언제든 변경할 수 있어요. (${maxLength}자 이하)`,
    [maxLength]
  );

  useEffect(() => {
    if (!open) return;
    setValue(initialValue || suggestedValue || '');
    setError('');
  }, [open, initialValue, suggestedValue]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const handleSubmit = () => {
    const parsed = normalizeFeedbackDisplayName(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || '표시 이름을 다시 확인해주세요.');
      return;
    }
    setError('');
    onSubmit?.(parsed.data);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 20px 50px rgba(0,0,0,0.24)',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 6 }}>
            표시 이름을 설정해주세요
          </div>
          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
            {helperText}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            ref={inputRef}
            value={value}
            maxLength={maxLength}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError('');
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit();
              if (event.key === 'Escape' && allowClose) onClose?.();
            }}
            placeholder={suggestedValue || '이름 또는 닉네임'}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 10,
              border: `1px solid ${error ? '#ef4444' : '#d4d4d8'}`,
              padding: '0 12px',
              fontSize: 14,
              color: '#111',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
            <span style={{ color: error ? '#dc2626' : '#888' }}>
              {error || '예: 김연출, 연출팀A'}
            </span>
            <span style={{ color: '#999', whiteSpace: 'nowrap' }}>
              {value.trim().length}/{maxLength}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {allowClose && (
            <button
              onClick={onClose}
              style={{
                padding: '9px 14px',
                borderRadius: 8,
                border: '1px solid #ddd',
                background: '#fff',
                color: '#666',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              취소
            </button>
          )}
          <button
            onClick={handleSubmit}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: 'none',
              background: '#e8b84b',
              color: '#1a1a1a',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
