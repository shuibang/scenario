import React, { useState } from 'react';

/**
 * 업데이트 공지 띠
 *
 * 새 공지 추가: ANNOUNCEMENTS 배열 맨 앞에 항목 추가 (id는 고유값)
 * 사용자가 닫으면 localStorage에 id를 기록 → 재방문 시 안 보임
 */
// 공지 (배너 + 공지 모달) — 새 항목은 맨 앞에 추가
export const ANNOUNCEMENTS = [
  {
    id: 'ann-20260423-sync-incident',
    date: '2026-04-23',
    title: '[공지] 일시적 오류 안내 및 복구 방법',
    content: `안녕하세요, 대본 작업실입니다.\n\n4월 22일, 어제 오후 22시부터 0시 사이, 동기화 기능에 오류가 발생했습니다.\n이로 인해 일부 사용자분들께 아래와 같은 현상이 나타났습니다.\n\n• 작성하신 데이터가 사라진 것처럼 보이는 현상\n• "기기 데이터가 다름" 팝업이 반복적으로 뜨는 현상\n\n데이터는 삭제되지 않았습니다.\n상단 '파일' 메뉴의 '백업/복원'에서 이전 작업 내용을 다시 불러오실 수 있습니다.\n\n현재 오류는 수정되었으며, 불편을 드려 진심으로 죄송합니다.\n앞으로 더 안정적인 서비스로 찾아뵙겠습니다.\n\n문의: daejak.official@gmail.com`,
  },
  {
    id: 'ann-20260422-restore',
    date: '2026-04-22',
    title: '⚠️ 작품이 보이지 않을 때 복원 방법 (긴급 안내)',
    content: `작품 목록에 이전 작업하던 대본이 보이지 않는 문제가 일부 사용자에게서 보고되어\n긴급 수정을 배포했어요.\n\n복원 방법\n1. 대본 작업실에 로그인\n2. 상단 메뉴 파일 → 백업 / 복원 클릭\n3. Drive에 저장된 스냅샷 중 최근 시점 선택 → 복원\n4. 복원 완료 직후 Ctrl+S(저장) 한 번 눌러 주세요\n   — 안전장치로 수동 저장을 권장합니다.\n\n스냅샷이 안 보이면\n로그아웃 → Google 재로그인 후 다시 시도해 주세요.\n\n원인\n업데이트 과정에서 Drive 자동 동기화가\nIndexedDB에 저장된 최신 상태를 제대로 감지하지 못해\n드물게 Drive의 이전 버전이 최신을 덮어쓰는 사례가 발생했습니다.\n방금 배포된 수정에서는 복원 직후에도\nDrive에 즉시 반영되도록 고쳐졌습니다.\n\n불편을 드려서 정말 죄송합니다.\n문의: daejak.official@gmail.com`,
  },
  {
    id: 'ann-20260411-domain',
    date: '2026-04-11',
    title: '🔴 서비스 주소 변경 안내',
    content: `베타 서비스 주소가 변경됩니다.\n\n기존 주소: scenario-876h.vercel.app\n새 주소: daejak.kr\n\n기존 주소로 작업하신 분들은\n이동 전에 꼭 백업해주세요!\n\n백업 방법:\n1. 기존 주소 접속\n2. 상단 백업/복원 버튼 클릭\n3. 백업 파일 다운로드\n4. daejak.kr 접속\n5. 백업/복원 → 복원으로 불러오기\n\n불편을 드려서 죄송해요.\n새 주소에서 더 안정적인 서비스로\n찾아뵐게요 🎬\n\n문의: daejak.official@gmail.com`,
  },
  {
    id: 'ann-20260406-beta',
    date: '2026-04-06',
    title: '📢 대본 작업실 베타 테스트 안내',
    content: `안녕하세요, 대본 작업실 개발자입니다.\n오늘 처음 문을 열었어요.\n가장 먼저 찾아와 주신 분들께 진심으로 감사드려요.\n여러분이 이 작업실의 첫 번째 입주 작가님들이에요. 🎬\n\n📅 베타 테스트 기간\n약 2~3개월 동안 진행될 예정이에요.\n종료 전 최소 2주 전에 미리 공지할게요.\n\n💡 베타 종료 이후 서비스 구조\n유료화 방향이 확정되면 아래와 같이 운영될 예정이에요.\n\n✅ 무료 (광고형)\n• 대본 작성 기능 전체\n• 시놉시스(인물설명 포함)\n• 트리트먼트\n• PDF/DOCX/HWPX 출력\n\n기본적인 집필과 준비에는 전혀 문제 없게 구성할게요.\n\n⭐ 유료 (멤버십)\n• 무료 기능 전체 포함\n• 인물현황 (등장 씬, 대사량, 흐름 분석)\n• 설계 파트\n• 광고 없음\n• 추후 다양한 기능 추가 예정\n\n합리적인 가격으로 제공할게요.\n\n지금 베타 기간 동안은\n모든 기능을 자유롭게 써보실 수 있어요.\n버그나 불편한 점은 오류제출 또는 스레드 댓글로 알려주세요.\n피드백 하나하나 다 읽고 반영할게요.\n곧 설문 페이지를 오픈하고 이벤트 소식 전해드릴게요.\n\n아직 완성형은 아니지만,\n처음을 함께해 주셔서 정말 감사해요. 🎬`,
  },
];

const STORAGE_KEY = 'drama_dismissed_notice';

export default function UpdateBanner() {
  const announcement = ANNOUNCEMENTS[0];
  const [dismissed, setDismissed] = useState(() => {
    try {
      return announcement ? localStorage.getItem(STORAGE_KEY) === announcement.id : false;
    } catch { return false; }
  });

  if (!announcement || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, announcement.id); } catch {}
    setDismissed(true);
  };

  return (
    <div className="no-print" style={{ display: 'flex', padding: '7px 14px', background: 'var(--c-active)', borderBottom: '1px solid var(--c-border2)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--c-accent)', fontWeight: 600, flexShrink: 0 }}>
          공지
        </span>
        <span style={{ fontSize: 11, color: 'var(--c-text2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {announcement.title}
        </span>
        <button
          onClick={dismiss}
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
