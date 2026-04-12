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

// 수정사항 (업데이트 탭) — 새 항목은 맨 앞에 추가
export const NOTICES = [
  {
    id: 'v9-20260412',
    date: '2026-04-12',
    title: '🔧 타임라인 분량 계산 수정 및 안정성 개선',
    content: `타임라인 분량 계산 수정\n• 0.5페이지 → 1.0분, 1.2페이지 → 2.4분 등 실제 분량에 비례하게 표시\n• 타임라인 하단에 총 분량(소수점) 레이블 추가\n\n내부 안정성 개선\n• Supabase 중복 연결 오류 수정 — 브라우저 콘솔에 뜨던 GoTrueClient 경고 해소\n• 불필요한 디버그 로그 제거\n• 공통 색상 유틸 정리 (중복 코드 제거)`,
  },
  {
    id: 'v8-20260410',
    date: '2026-04-10',
    title: '⌨️ 기타 단축어 편집 기능 추가 및 UI 개선',
    content: `기타 단축어 편집 기능 추가\n• 편집 버튼 → 단축어 순서 변경(↑/↓) 및 삭제(×) 가능\n• 기본 제공 단축어도 순서 변경·삭제 가능\n• 초기화 버튼으로 기본 목록 복원 가능\n\n방향키 이동 개선\n• 2열 그리드 기준으로 방향키 이동이 직관적으로 동작\n• 목록 끝에서 반대쪽으로 튀는 현상 제거\n\n팝업 색상 개선\n• 선택된 항목과 배경 색상 대비 강화 — 어떤 항목이 선택됐는지 더 잘 보임\n\n괄호체 출력 개선 (2026-04-10)\n• HWPX·DOCX·PDF 모든 출력에서 이탤릭 적용\n• 글자색 검정 고정 (강조색 제거)`,
  },
  {
    id: 'v7-20260408b',
    date: '2026-04-08',
    title: '🗂️ 씬리스트 출력 · 트리트먼트 · 타임라인 · 작품 생성 개편',
    content: `씬리스트 출력 형식 변경\n• 가로 A4(Landscape) 표 형식으로 출력 (PDF·DOCX)\n• 컬럼 구성: 씬번호 / 장소 / 세부장소 / 낮 / 밤 / 등장인물 / 내용 요약 / 비고\n• 낮/밤 칸에 입력된 시간대 텍스트 그대로 표시 (낮·밤·D·N·아침 등)\n• 비고 칸은 빈 칸으로 — 현장 메모용\n\n트리트먼트 개편\n• 회차 선택에 전체 보기 추가 — 모든 회차를 한 화면에서 편집 가능\n• 전체 뷰에서 각 회차별 항목 직접 입력·추가 가능\n• 미니시리즈 미생성 회차 자동생성 선택지 추가\n\n타임라인 눈금 수정\n• 1장 = 2분 고정 계산으로 변경\n• 대본 분량에 따라 타임라인 총 분이 자동 반영 (35매→70분, 40매→80분)\n\n작품 생성 개편\n• 단막 / 미니시리즈 / 영화 / 기타 4가지 형식 선택\n• 유형별 클라이막스 구간 자동 설정\n• 미니시리즈: 부작 수 입력 → 회차 자동 생성\n\n구조 페이지 컬러바 개선\n• 씬 위치를 타임라인 기준 시간 비율로 계산\n• 클라이막스 구간에 가까울수록 색상 짙어짐 (라벤더 → 인디고)\n• ⚡ 버튼으로 총 분량·클라이막스 구간 직접 수정 가능`,
  },
  {
    id: 'v6-20260408',
    date: '2026-04-08',
    title: '🎬 설계 페이지 씬보드 개편',
    content: `설계 페이지의 씬보드가 새롭게 개편되었어요.\n\n✅ 씬보드 카드 구성\n• 씬번호 + 씬정보 (장소·시간)\n• 인물등장 — 인물 정보가 등록된 경우만 표시\n• 내용요약 — 씬리스트 내용이 그대로 연동\n\n✅ 씬 관리\n• 씬 카드 드래그로 순서 변경 → 씬번호 즉시 반영\n• 카드 더블클릭 → 삭제 버튼 표시 (실수 방지)\n• 삭제된 씬 되살리기 가능\n\n✅ 성능 개선\n• 키입력 렉 대폭 감소 (에디터 내부 DOM 업데이트 최적화)\n• 저장 시 불필요한 화면 갱신 제거`,
  },
  {
    id: 'v-archive-20260407',
    date: '2026-04-04 ~ 2026-04-07',
    title: '📋 이전 업데이트 기록',
    content: `2026-04-07\n• DOCX 출력 권장 안내 — PDF 줄바꿈·페이지 나누기 개선 중\n\n2026-04-06\n• 백업/복원 시스템 추가 — 자동저장(10분, 3개)·수동저장(5개)·백업(5개) 스냅샷 관리\n• 복원 시 현재 상태 자동 보존, 기기 정보 표시\n• Drive 동기화 버그 수정 — 다른 기기 불러오기 후 화면 갱신 안 되던 문제 해결\n• 모바일 툴바 되돌리기·다시하기 버튼 추가\n• 메모 탭 하단 광고 클릭 차단 문제 수정\n• Drive 동기화 안정화 — 빈 화면 버그, 빈 배열 덮어쓰기 방지, 로그인 타이밍 수정\n• 구조 페이지 [첫등장] 뱃지 추가\n• 검토링크 모바일 하단 피드백 패널\n• 마이페이지 탭 여백 정비, 인물이력서 설명 문구\n\n2026-04-04\n• 자료수집 그리드/목록 뷰 토글, 메모·이미지 카드 타입 분리\n• 표지↔작품명 동기화\n• UI 개선 — 광고영역 표기, 씬리스트 가로출력, 인물 첫등장 뱃지, 체크리스트 줄바꿈\n• Save the Cat 기본 접힘\n• 씬리스트 버그 수정 — 씬 추가 후 목록 사라지던 문제, 대본 연동 개선`,
  },
];

const STORAGE_KEY = 'drama_dismissed_notice';

export default function UpdateBanner() {
  const latest = NOTICES[0];
  const announcement = ANNOUNCEMENTS[0];
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === latest.id;
    } catch { return false; }
  });

  if (!latest || dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, latest.id); } catch {}
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
