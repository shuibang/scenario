import { useEffect, useRef } from 'react';

/**
 * 메뉴바 전용 신규 단축키 훅
 *
 * 아래 키들은 이미 다른 곳에서 처리되므로 등록하지 말 것:
 *   Ctrl+S  → App.jsx 전역 핸들러
 *   Ctrl+Z/Y → App.jsx 전역 핸들러
 *   Ctrl+B/I/U → ScriptEditor.jsx 내부 핸들러
 *   Ctrl+X/C/V/A → 브라우저 기본 동작
 *
 * shortcuts 형식:
 *   { 'ctrl+alt+n': (e) => ..., 'ctrl+f': (e) => ..., 'f11': (e) => ... }
 *
 * 모든 매칭 시 preventDefault + stopPropagation 호출.
 */
export default function useKeyboardShortcuts(shortcuts) {
  const ref = useRef(shortcuts);
  useEffect(() => { ref.current = shortcuts; }, [shortcuts]);

  useEffect(() => {
    const handler = (e) => {
      const map = ref.current;
      for (const [combo, action] of Object.entries(map)) {
        if (matchesCombo(e, combo)) {
          e.preventDefault();
          e.stopPropagation();
          action(e);
          break;
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

function matchesCombo(e, combo) {
  const parts  = combo.toLowerCase().split('+');
  const key    = parts[parts.length - 1];
  const ctrl   = parts.includes('ctrl');
  const shift  = parts.includes('shift');
  const alt    = parts.includes('alt');

  const ctrlMatch  = ctrl  ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
  const shiftMatch = shift ? e.shiftKey : !e.shiftKey;
  const altMatch   = alt   ? e.altKey   : !e.altKey;

  // e.key 비교 (F1–F12, 한/영 전환 등도 처리)
  const keyMatch =
    e.key.toLowerCase() === key ||
    e.code.toLowerCase() === `key${key}` ||
    e.code.toLowerCase() === key;

  return ctrlMatch && shiftMatch && altMatch && keyMatch;
}
