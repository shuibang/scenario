# 버전 스냅샷 기반 피드백 노트 개편 설계안

## 1. 목표

현재 검토 링크/연출 피드백 흐름을 다음 기준으로 재구성한다.

- `공유링크 생성 = 버전 스냅샷 생성`
- 피드백은 항상 특정 버전에 귀속된다.
- 수신자는 링크가 가리키는 버전에만 회신한다.
- 작가는 버전별로 피드백을 전환해서 본다.
- 피드백 위치는 "가변 원본 대본"이 아니라 "고정 스냅샷" 기준으로 유지한다.

신규 링크 피드백의 canonical source는 "writer 소유 Drive 스냅샷 번들"이다.

- Supabase DB는 수신/회신을 위한 임시 저장소로 쓴다.
- 공유 생성 후 7일이 지나면 DB에서는 삭제되어야 한다.
- 장기 보관이 필요한 버전/피드백은 Drive 번들에 남긴다.

기존 `director_notes`, `director_deliveries`, `director_deliveries_received(localStorage)`는
신규 링크 피드백의 canonical source로 계속 쓰지 않는다.

## 1.1 보존 원칙

중요한 제품 원칙:

- 공유를 주고받은 이후의 민감한 대본/피드백 데이터는 서비스 DB(Supabase)에 영구 보관하지 않는다.
- 기존 검토 링크와 동일하게 서버 보관 기한은 기본 7일이다.
- 7일 후에는 링크/버전/세션/코멘트가 DB에서 제거되어야 한다.
- 대신 writer가 계속 봐야 하는 버전별 피드백은 writer 개인 Google Drive `appDataFolder`의 전용 파일에 남긴다.
- 개인 Drive 파일은 서비스가 임의로 자동 삭제하지 않는다.
- 개인 Drive 파일 삭제는 사용자가 버전 삭제를 실행하거나 Drive에서 직접 삭제할 때만 일어난다.

즉 이 기능에서 DB는 "협업 중계 레이어", Drive는 "writer 보관 레이어"다.
대본작업실의 기본 원칙은 "유저 자료를 서비스가 장기 보관하지 않는다"는 점이다.


## 2. 현재 코드 기준 관찰

### 2.1 현재 공유 링크

- 작가 쪽 링크 생성은 `buildReviewURL()` -> `saveReviewPayload()` 흐름이다.
- 현재 `review_links` 테이블에는 `payload` JSON 전체가 저장된다.
- 링크는 `#review=<uuid>` 해시로 접근하고, `SharedReviewView`가 읽기 전용 미리보기를 렌더한다.

### 2.2 현재 연출 피드백

- 연출 작업실은 `shared_scripts` + Google Drive 파일을 기준으로 대본을 가져온다.
- 연출 코멘트는 `director_notes` 테이블에 `shared_script_id + block_id` 기준으로 저장된다.
- 작가에게 전달할 때는 `director_deliveries`에 스냅샷과 메모 배열을 통째로 복사한다.
- 작가 쪽 피드백 페이지는 결국 `director_deliveries_received` localStorage를 읽는다.

### 2.3 현재 구조의 한계

- writer ownership이 서버 데이터에 안정적으로 남아 있지 않다.
  - legacy `review_links`에는 작성자 컬럼이 없다.
  - `director_deliveries`에도 writer id가 없다.
- 따라서 "기존 서버 데이터만으로 특정 writer 계정 아래로 자동 귀속"은 어렵다.
- 기존 writer 쪽 보관본은 localStorage가 섞여 있어서 순수 SQL 마이그레이션만으로는 완전 복구가 불가능하다.

이 제약은 7단계 마이그레이션 전략에 반드시 반영해야 한다.


## 3. 제안 아키텍처

## 3.1 핵심 객체

### A. `feedback_versions`

작가가 공유 링크를 만들 때 생성되는 "불변 대본 스냅샷 버전".

권장 컬럼:

- `id uuid pk`
- `author_user_id uuid not null`
  - writer owner. RLS 핵심 컬럼.
- `script_id text not null`
  - 현재 앱의 `project.id`를 opaque id로 저장.
  - 현재 저장소에는 서버 쪽 `projects` 테이블이 없으므로 FK는 두지 않는다.
- `version_name text not null`
  - 기본값 `ver.1`, `ver.2` ...
- `version_order int not null`
  - script 단위 증가값. 삭제 후 재사용하지 않는다.
- `drive_file_id text not null`
  - 해당 버전의 Drive 보관 번들 파일 id.
  - 이 번들 안에 snapshot + sessions + comments를 함께 저장한다.
- `last_linked_at timestamptz not null default now()`
  - 해당 버전에 대해 마지막으로 request/reply 링크가 발급된 시각.
  - 버전 자체 만료 시각이 아니라 링크 운영용 메타다.
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz null`
  - hard delete 대신 soft delete를 고려하려면 필요.
  - 하지만 사용자 요구가 "복구 불가"라서 최종 구현은 hard delete 가능.

중요:

- 초기 제안의 `snapshot_content jsonb`는 Supabase 장기 보관 원칙과 충돌한다.
- 실제 snapshot 본문과 누적 세션/코멘트는 Drive bundle의 canonical data로 둔다.
- `feedback_versions`는 장기적으로 메타데이터와 포인터만 남긴다.

권장 인덱스:

- `(author_user_id, script_id, created_at desc)`
- unique `(author_user_id, script_id, version_order)`
- `(author_user_id, script_id, last_linked_at desc)`


### B. `feedback_sessions`

한 사람이 한 번 "회신 저장"한 묶음.

권장 컬럼:

- `id uuid pk`
- `version_id uuid not null references feedback_versions(id) on delete cascade`
- `sender_user_id uuid null`
  - 신규 플로우에서는 로그인 필수라 앱 레벨에서 항상 채운다.
  - 다만 legacy migration fallback을 위해 DB 레벨 nullable 권장.
- `sender_display_name text not null`
  - 로그인 후 최초 1회 입력, localStorage 캐시, 제출 시 세션에 복사 저장.
- `submitted_at timestamptz not null default now()`
- `is_read boolean not null default false`
- `read_at timestamptz null`
- `synced_to_drive_at timestamptz null`
  - 세션/코멘트가 writer Drive bundle에 반영된 시각.
  - 7일 purge 대상 판정에 사용.
- `legacy_source text null`
  - 예: `migration`, `review-link`

권장 인덱스:

- `(version_id, submitted_at desc)`
- `(version_id, is_read, submitted_at desc)`
- `(sender_user_id, submitted_at desc)`


### C. `feedback_comments`

세션 안의 개별 코멘트.

권장 컬럼:

- `id uuid pk`
- `session_id uuid not null references feedback_sessions(id) on delete cascade`
- `scene_id text null`
- `line_ref jsonb not null`
- `comment_text text not null`
- `position_offset smallint not null default 0`
- `created_at timestamptz not null default now()`

`line_ref` 권장 shape:

```json
{
  "episode_id": "ep_x",
  "block_id": "blk_x",
  "scene_id": "scene_x",
  "scene_label": "1씬 INT. 거실 (밤)",
  "block_type": "action",
  "scene_order": 1,
  "block_order": 14,
  "start_offset": 0,
  "end_offset": 18,
  "excerpt": "문이 천천히 열린다"
}
```

설계 이유:

- `scene_id`만으로는 같은 씬 안의 위치가 부족하다.
- `block_id + offset`이 있어야 오버레이와 우측 패널 정렬이 안정적이다.
- `scene_order / block_order`를 같이 저장하면 우측 패널을
  `1씬 a -> 2씬 b -> 3씬 a` 같은 문서 순서대로 바로 정렬할 수 있다.

권장 인덱스:

- `(session_id, created_at asc)`
- `(scene_id)`
- `gin(line_ref jsonb_path_ops)` 또는 최소한 `(session_id)` + 앱 정렬


## 3.2 보조 테이블/기존 테이블 변경

### `review_links`는 재사용 권장

현재 공개 링크 엔트리 포인트가 이미 `review_links`이므로 그대로 재사용하는 편이 비용이 적다.

권장 추가/변경 컬럼:

- `created_by uuid null`
  - legacy 행 때문에 nullable 시작 가능.
  - 신규 행은 writer 또는 director auth uid 저장.
- `link_type text not null default 'legacy_review'`
  - 값 예시: `legacy_review`, `feedback_version`, `log_export`
- `link_role text null`
  - 값 예시: `request`, `reply`
  - 같은 version에 여러 링크를 허용하기 위해 필요.
- `version_id uuid null`
  - `feedback_versions.id` 참조용
- `session_id uuid null`
  - reply 링크인 경우 해당 회신 세션을 직접 가리킬 수 있다.
- `expires_at timestamptz`
  - 기존 유지

신규 피드백 링크 행에서는 `payload`를 최소화한다.

- legacy 링크: 기존처럼 full payload 유지
- 신규 링크: `payload`는 최소 메타만 보관하고 snapshot은 `feedback_versions.snapshot_content`가 canonical

예시 payload:

```json
{
  "type": "feedback-version",
  "version_id": "uuid",
  "script_id": "project_x",
  "link_role": "request"
}
```

## 3.2.1 Drive 보관 번들

DB 7일 purge 원칙을 만족하려면 `feedback_versions.drive_file_id`는 단순 대본 스냅샷이 아니라
"버전 보관 번들"을 가리키는 편이 맞다.

권장 Drive JSON shape:

```json
{
  "type": "feedback-version-bundle",
  "version": {
    "id": "uuid",
    "script_id": "project_x",
    "version_name": "ver.1",
    "version_order": 1,
    "created_at": "2026-04-22T10:00:00Z"
  },
  "snapshot_content": {},
  "sessions": [
    {
      "id": "uuid",
      "sender_user_id": "uuid-or-null",
      "sender_display_name": "연출A",
      "submitted_at": "2026-04-22T12:00:00Z",
      "is_read": false,
      "comments": []
    }
  ]
}
```

이 구조를 쓰면:

- 협업 중에는 Supabase에서 읽고 쓸 수 있고
- 7일 뒤 DB purge 후에도 writer는 Drive만으로 버전별 피드백을 계속 볼 수 있다.

## 3.2.2 링크 수명 주기

한 버전은 여러 개의 임시 링크를 가질 수 있다.

### A. 작가 -> 연출 request 링크

- 공유링크 생성 시 `version_id`가 만들어진다.
- 같은 시점에 request 링크 1개가 발급된다.
- 이 링크는 발급 시점부터 7일 유효하다.
- 연출이 링크를 열어 `shared_scripts + 연출 쪽 Drive 파일`로 가져오는 순간,
  링크의 핵심 역할은 끝난다.
- 이후 request 링크가 만료되어도 연출작업실에 가져온 대본 작업본은 유지된다.

### B. 연출 -> 작가 reply 링크

- 연출이 특정 버전에 대한 피드백을 회신할 때 reply 링크를 발급한다.
- 이 링크도 발급 시점부터 별도로 7일 유효하다.
- 즉 첫 request 링크의 만료와 독립적으로 계산된다.

### C. 같은 버전에 계속 누적

- 피드백의 부모는 링크가 아니라 `version_id`다.
- 따라서:
  - request 링크가 만료된 뒤에도
  - 같은 버전에서 새 reply 링크를 만들 수 있고
  - 필요하면 같은 버전에 대해 새 request 링크도 다시 발급할 수 있다.
- 결과적으로 세션은 하나의 버전 아래 계속 누적될 수 있다.


## 3.3 공유 링크 생성 시 트랜잭션 개념

`공유링크 생성 = 버전 생성`의 실제 순서:

1. 현재 선택 범위 기준 snapshot payload 생성
2. Google Drive에 version bundle 파일 저장
3. `feedback_versions` insert
4. `review_links` insert (`link_type='feedback_version'`, `link_role='request'`)

실패 처리 원칙:

- 2 실패 -> 버전 생성 자체 중단
- 3/4 실패 -> 이미 저장된 Drive 파일 rollback 시도
- 생성이 끝난 뒤에만 링크를 사용자에게 보여준다

추가 원칙:

- 코멘트 세션이 새로 저장될 때마다 해당 version bundle도 갱신한다.
- DB가 purge되어도 Drive bundle만으로 버전 복원이 가능해야 한다.
- request 링크 만료가 버전 삭제를 의미하지는 않는다.
- reply 링크는 같은 `version_id` 아래에서 별도로 발급된다.


## 4. RLS 설계

## 4.1 기본 원칙

- writer owner는 자신의 버전/세션/코멘트를 전부 읽고 수정/삭제 가능
- receiver는 "링크가 가리키는 버전"에 대해서만 접근 가능
- receiver는 다른 사람 세션 전체를 읽지 않는다
- anonymous는 둘러보기용 스냅샷 읽기만 가능


## 4.2 `feedback_versions`

### writer owner

- `select/update/delete`
- 조건: `author_user_id = auth.uid()`

### receiver/anonymous browse

- `select`
- 조건:
  - 연결된 `review_links` 행이 존재
  - `link_type = 'feedback_version'`
  - `expires_at is null or expires_at > now()`

주의:

- 이 정책은 `version_id`를 아는 사용자는 해당 스냅샷을 읽을 수 있다는 전제다.
- 실무적으로는 `version_id`가 UUID이고 외부 노출 경로가 `review_links`뿐이라면 충분히 현실적이다.
- 더 엄격히 하려면 2단계 구현에서 `security definer RPC`로
  `review_link token -> snapshot load`를 감싸는 방식도 가능하다.


## 4.3 `feedback_sessions`

### writer owner

- `select/update/delete`
- 조건: 상위 `feedback_versions.author_user_id = auth.uid()`

### receiver

- `insert`
- 조건:
  - 로그인 사용자
  - 상위 version이 유효한 공개 링크에 연결됨
- `select`
  - 자기 자신이 보낸 세션만 허용
  - 조건: `sender_user_id = auth.uid()`

권장:

- 세션은 "저장 완료본"만 만들고 draft는 클라이언트 state로 처리
- 그러면 receiver 쪽 `update/delete` 권한이 거의 필요 없다


## 4.4 `feedback_comments`

### writer owner

- `select/update/delete`
- 조건: 상위 version owner

### receiver

- `insert`
- 조건: 상위 session의 `sender_user_id = auth.uid()`
- `select`
  - 자기 session 소속 코멘트만 허용

이렇게 하면 다른 receiver가 이전 수신자의 코멘트를 링크에서 그대로 열람하지 못한다.


## 4.5 `review_links`

### legacy

- 기존 정책 유지

### 신규 feedback_version 링크

- public `select`
  - `expires_at`가 유효한 행만
- authenticated user `insert/update/delete`
  - `created_by = auth.uid()`
  - writer는 request 링크를, director는 reply 링크를 발급할 수 있다.


## 4.6 7일 purge 정책

RLS만으로는 만료 데이터 삭제가 자동 수행되지 않는다.
따라서 별도 purge 실행 경로가 필요하다.

권장 방식:

- Supabase Scheduled Function 또는 외부 cron 1일 1회 실행
- 대상:
  - `review_links.expires_at < now()`
  - `feedback_sessions.submitted_at < now() - interval '7 days' and synced_to_drive_at is not null`
- 삭제 순서:
  1. 만료된 `review_links` delete
  2. Drive에 반영 완료된 오래된 `feedback_comments` / `feedback_sessions` delete
  3. 내용 payload가 없는 `feedback_versions` 메타는 유지 가능

중요:

- 7일 purge는 DB에서만 수행한다.
- writer 개인 Drive 번들은 자동 만료 대상이 아니다.
- writer가 직접 버전을 삭제할 때만 Drive 번들까지 같이 삭제한다.
- 즉 "자동 만료 = DB 정리", "수동 삭제 = DB + Drive 동시 삭제"로 분리한다.
- request 링크 만료가 연출작업실의 imported copy 삭제를 의미하지는 않는다.
- reply 링크도 request 링크와 별도로 7일 수명을 가진다.


## 5. 검증/보안 패턴

## 5.1 Zod

현재 저장소에는 `urlSchemas.js`의 Zod 패턴이 이미 있다.
신규 설계도 같은 방식으로 간다.

권장 스키마:

- `feedbackVersionSnapshotSchema`
  - 기존 `reviewLegacySchema` 재사용/확장
- `feedbackSessionSubmitSchema`
  - `version_id`
  - `sender_display_name`
  - `comments: feedbackCommentSchema[]`
- `feedbackCommentSchema`
  - `scene_id?`
  - `line_ref`
  - `comment_text`
  - `position_offset`


## 5.2 DOMPurify

- 피드백 텍스트는 rich text가 아니라 plain text 기준 권장
- 그래도 렌더 직전 escape 또는 DOMPurify 경계를 유지
- `sender_display_name`, `comment_text`는 HTML 저장을 허용하지 않는 편이 안전하다


## 6. UI/도메인 설계 메모

## 6.1 writer 피드백 노트 화면

- 상단: 버전 칩 목록, 최신순
- 버전 unread badge:
  - 하위 세션 중 `is_read = false`가 하나라도 있으면 표시
- 좌측/상단 세션 목록:
  - `sender_display_name`
  - `submitted_at`
  - unread badge
- 본문:
  - `snapshot_content` 기준 read-only 렌더
  - 코멘트는 기본 접힘
  - 제목 줄에는 보낸 사람만 먼저 보임
  - unread는 색/뱃지 이중 표기
- 우측 패널:
  - `line_ref.scene_order`, `line_ref.block_order`, `position_offset` 기준 정렬


## 6.2 receiver 플로우

- 비로그인:
  - 둘러보기 전용
  - 스냅샷 본문만 표시
- 로그인 후:
  - 최초 1회 `display name` 입력 모달
  - `localStorage['feedback_display_name']`에 캐시
  - 제출 시 세션에 복사 저장
  - 이후 이름 변경 UI 제공


## 6.3 모바일

- 버전 목록: 가로 스크롤 칩
- 세션 목록: 접이식 하단 시트 또는 상단 탭
- 코멘트 오버레이:
  - hover 의존 금지
  - 탭/토글 중심
  - 44px 이상 hit target


## 7. 마이그레이션 전략

## 7.1 중요한 제약

기존 구조에서는 writer owner가 서버 데이터에 안정적으로 남아 있지 않다.

- `review_links` legacy row에 writer id 없음
- `director_deliveries`에도 writer id 없음
- writer가 실제로 확인하던 목록은 localStorage `director_deliveries_received`

즉, **순수 SQL만으로 "어떤 legacy feedback가 어떤 writer 소유인지"를 완전하게 복원할 수 없다.**

이 점을 인정하고, 마이그레이션은 **DB 스키마 마이그레이션 + 최초 실행 시 사용자 컨텍스트 기반 이관**으로 나누는 것이 맞다.


## 7.2 권장 마이그레이션 방식

### Phase A. 서버 스키마 준비

- 신규 3개 테이블 생성
- `review_links` 보조 컬럼 추가
- RLS 추가
- `expires_at` 기반 purge job 준비

### Phase B. writer 앱 1회성 이관 마법사

로그인한 writer가 프로젝트를 열었을 때:

1. localStorage `director_deliveries_received`에서 현재 `projectId`에 대응하는 항목 탐지
2. 항목이 있으면 "이전 피드백 가져오기" 배너 노출
3. 사용자가 승인하면:
   - 현재 writer 계정 아래에 `feedback_versions` 1개 생성
   - `version_name = '이전 피드백 (마이그레이션)'`
   - `snapshot_content`는
     - 우선: 가장 최신 delivery의 `appState`
     - 없으면: 현재 프로젝트 상태
   - 동시에 Drive version bundle 생성
   - 각 legacy delivery를 `feedback_sessions` 1개로 생성
   - 그 안의 notes를 `feedback_comments`로 생성

### Phase C. sender 정보 보강

legacy local copy에는 sender 정보가 부족할 수 있다.

보강 순서:

1. 가능하면 delivery id로 서버의 `director_deliveries`를 조회
2. 거기서 `director_id` 확보
3. 서버 함수 또는 privileged query에서 `auth.users`의 `full_name / name / email`로 `sender_display_name` 추론
4. 그래도 못 찾으면
   - `sender_display_name = '이름 미상 (마이그레이션)'`
   - `sender_user_id = null`

이 때문에 `feedback_sessions.sender_user_id`는 DB 레벨 nullable이 더 현실적이다.
신규 제출 플로우에서는 앱/서버 검증으로 필수 보장한다.

### Phase D. DB 정리

마이그레이션으로 생성된 서버 row도 예외 없이 7일 정책을 따른다.

- migration 직후 writer가 Drive bundle을 보유하게 만들고
- 이후 DB row는 일반 버전과 동일하게 purge 대상에 포함한다.


## 7.3 "기존 누적형 피드백은 단일 버전으로"

요구사항대로 프로젝트 단위로 하나의 migration version으로 몰아넣는다.

- 버전명: `이전 피드백 (마이그레이션)`
- 버전당 세션 수: legacy delivery 수
- 세션당 코멘트 수: 해당 delivery에 포함된 note 수

이 방식이 좋은 이유:

- 기존 데이터의 시간순/발신자 단위를 잃지 않는다
- writer 입장에서는 새 구조로 진입할 때 버전 탭이 과도하게 늘어나지 않는다


## 8. 이번 단계 결론

권장 방향은 다음이다.

1. 공개 링크 엔트리 포인트는 `review_links`를 재사용한다.
2. Supabase는 7일짜리 협업 저장소로만 사용한다.
3. 장기 보관 canonical source는 `feedback_versions.drive_file_id`가 가리키는 Drive bundle이다.
4. `feedback_versions`는 버전 메타/포인터를, 실제 snapshot/comments는 Drive bundle이 가진다.
5. 한 버전은 여러 개의 request/reply 링크를 가질 수 있고, 링크는 각각 7일씩 독립 만료된다.
6. request 링크 만료가 연출작업실 imported copy 삭제를 뜻하지는 않는다.
7. receiver는 로그인 후 세션/코멘트를 생성하고, writer만 전체 피드백을 읽는다.
8. 7일 후 DB에서는 임시 링크와 반영 완료된 협업 데이터를 자동 정리하고, writer 개인 Drive 데이터는 사용자가 지울 때만 삭제한다.
9. legacy migration은 pure SQL이 아니라 **writer 컨텍스트가 있는 1회성 이관 플로우**를 전제로 설계한다.

이 설계가 현재 코드베이스와 사용자 요구를 동시에 만족시키는 가장 현실적인 방향이다.
