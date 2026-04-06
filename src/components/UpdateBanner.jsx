import React, { useState } from 'react';

/**
 * 업데이트 공지 띠
 *
 * 새 공지 추가: NOTICES 배열 맨 앞에 항목 추가 (id는 고유값)
 * 사용자가 닫으면 localStorage에 id를 기록 → 재방문 시 안 보임
 */
// 별도 소식 (공지 탭) — 새 항목은 맨 앞에 추가
export const ANNOUNCEMENTS = [
  {
    id: 'ann-20260404',
    date: '2026-04-04',
    content: '대본 작업실 베타 서비스를 시작합니다. 다양한 기능을 자유롭게 사용해 보시고 피드백 주시면 적극 반영하겠습니다.',
  },
];

// 수정사항 (업데이트 탭) — 새 항목은 맨 앞에 추가
export const NOTICES = [
  {
    id: 'v4-20260406',
    date: '2026-04-06',
    content: '백업/복원 시스템 추가: 자동저장(10분, 3개)·수동저장(5개)·백업(5개) 스냅샷 관리, 복원 시 현재 상태 자동 보존, 기기 정보 표시. Drive 동기화 버그 수정: 다른 기기 불러오기 선택 후 화면이 즉시 갱신되지 않던 문제 해결. 모바일 툴바 ↩↪ 되돌리기·다시하기 버튼 추가, 메모 탭 하단 광고 클릭 차단 문제 수정.',
  },
  {
    id: 'v3-20260406',
    date: '2026-04-06',
    content: 'Drive 동기화 안정화: 빈 화면 버그 수정, 빈 배열 덮어쓰기 방지, 로그인 타이밍 경쟁 조건 수정',
  },
  {
    id: 'v1-20260406',
    date: '2026-04-06',
    content: '구조 페이지 [첫등장] 뱃지, 검토링크 모바일 하단 피드백 패널, 마이페이지 탭 여백 정비, 인물이력서 설명 문구, 클릭 시 에디터 스크롤 방지, 하단 패널 포커스 유지',
  },
  {
    id: 'v3-20260404',
    date: '2026-04-04',
    content: 'UI 개선: 광고영역 표기, 씬리스트 가로출력, 인물 첫등장 뱃지, 체크리스트 줄바꿈, Save the Cat 기본 접힘',
  },
  {
    id: 'v2-20260404',
    date: '2026-04-04',
    content: '자료수집 그리드/목록 뷰 토글, 메모/이미지 카드 타입 분리, 표지↔작품명 동기화',
  },
  {
    id: 'v1-20260404',
    date: '2026-04-04',
    content: '씬리스트 버그 수정: 씬 추가 후 목록이 사라지던 문제, 대본 연동 개선',
  },
];

const STORAGE_KEY      = 'drama_dismissed_notice';
const STORAGE_HIDE_KEY = 'drama_hide_notice_forever';

export default function UpdateBanner() {
  const latest = NOTICES[0];
  const [dismissed, setDismissed] = useState(() => {
    try {
      if (localStorage.getItem(STORAGE_HIDE_KEY) === 'true') return true;
      return localStorage.getItem(STORAGE_KEY) === latest.id;
    } catch { return false; }
  });

  if (!latest || dismissed) return null;

  const dismissOnce = () => {
    try { localStorage.setItem(STORAGE_KEY, latest.id); } catch {}
    setDismissed(true);
  };

  const dismissForever = () => {
    try { localStorage.setItem(STORAGE_HIDE_KEY, 'true'); } catch {}
    setDismissed(true);
  };

  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '5px 14px',
        background: 'var(--c-active)',
        borderBottom: '1px solid var(--c-border2)',
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--c-accent)', fontWeight: 600, flexShrink: 0 }}>
        업데이트 {latest.date}
      </span>
      <span style={{ fontSize: 11, color: 'var(--c-text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {latest.content}
      </span>
      <button
        onClick={dismissForever}
        style={{
          background: 'none', border: '1px solid var(--c-border3)', borderRadius: 4,
          cursor: 'pointer', color: 'var(--c-text6)', fontSize: 10,
          flexShrink: 0, padding: '2px 6px', whiteSpace: 'nowrap',
        }}
        title="이 배너를 다시 표시하지 않습니다"
      >다시 보지 않기</button>
      <button
        onClick={dismissOnce}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--c-text5)', fontSize: 14, lineHeight: 1,
          flexShrink: 0, padding: '0 2px',
        }}
        title="닫기"
      >×</button>
    </div>
  );
}
