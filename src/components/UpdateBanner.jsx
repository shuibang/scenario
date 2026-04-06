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
    id: 'ann-20260406-beta',
    date: '2026-04-06',
    title: '📢 대본 작업실 베타 테스트 안내',
    content: `안녕하세요, 대본 작업실 개발자입니다.\n오늘 처음 문을 열었어요.\n가장 먼저 찾아와 주신 분들께 진심으로 감사드려요.\n여러분이 이 작업실의 첫 번째 입주 작가님들이에요. 🎬\n\n📅 베타 테스트 기간\n약 2~3개월 동안 진행될 예정이에요.\n종료 전 최소 2주 전에 미리 공지할게요.\n\n💡 베타 종료 이후 서비스 구조\n유료화 방향이 확정되면 아래와 같이 운영될 예정이에요.\n\n✅ 무료 (광고형)\n• 대본 작성 기능 전체\n• 시놉시스(인물설명 포함)\n• 트리트먼트\n• PDF/DOCX/HWPX 출력\n\n기본적인 집필과 준비에는 전혀 문제 없게 구성할게요.\n\n⭐ 유료 (멤버십)\n• 무료 기능 전체 포함\n• 인물현황 (등장 씬, 대사량, 흐름 분석)\n• 설계 파트\n• 광고 없음\n• 추후 다양한 기능 추가 예정\n\n합리적인 가격으로 제공할게요.\n\n지금 베타 기간 동안은\n모든 기능을 자유롭게 써보실 수 있어요.\n버그나 불편한 점은 오류제출 또는 스레드 댓글로 알려주세요.\n피드백 하나하나 다 읽고 반영할게요.\n곧 설문 페이지를 오픈하고 이벤트 소식 전해드릴게요.\n\n아직 완성형은 아니지만,\n처음을 함께해 주셔서 정말 감사해요. 🎬`,
  },
];

// 수정사항 (업데이트 탭) — 새 항목은 맨 앞에 추가
export const NOTICES = [
  {
    id: 'v5-20260407',
    date: '2026-04-07',
    content: 'DOCX 출력 권장, PDF는 개선 중: 현재 PDF 출력은 줄바꿈·페이지 나누기를 개선하고 있어요. 당분간 DOCX 출력을 권장합니다.',
  },
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
  const announcement = ANNOUNCEMENTS[0];
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
    <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '5px 14px', background: 'var(--c-active)', borderBottom: '1px solid var(--c-border2)', flexShrink: 0 }}>
      {/* 공지사항 배너 */}
      {announcement && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--c-accent)', fontWeight: 600, flexShrink: 0 }}>공지</span>
          <span style={{
            flex: 1, textAlign: 'left', fontSize: 11, color: 'var(--c-text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {announcement.title}
          </span>
        </div>
      )}
      {/* 업데이트 배너 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
    </div>
  );
}
