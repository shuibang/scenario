# 대본 작업실 아키텍처 노트

## 데이터 모델

### 씬의 두 가지 상태
- 구조화 씬: location 또는 specialSituation 채워짐
- 레거시 씬: 구조화 필드 비어있고 content에만 문자열
- 전환: SceneListPage에서 명시 입력 시 구조화 씬으로 승격

### 저장 구조
- 로컬: IndexedDB (script-workshop DB)
- 클라우드: 구글 드라이브 (사용자 계정)
- **서버측 DB 없음** (마이그레이션은 로드 시점 자동)

## 불변 원칙

### 원칙 1: 사용자 데이터는 명시 동의 없이 변형되지 않는다
- 자동 파싱 결과로 원본 표기 덮어쓰기 금지
- 대량 삭제 시 확인 모달
- 관련: Phase 0 방어선 (commits aaf4bea, f9e8d30, 82110d5, 0d559bd)

### 원칙 2: DOM 표시 값 = 저장된 content
- blockDisplayContent와 resolveSceneLabel이 동일 로직 사용
- rawText 불변 시도 content 재조합으로 일관성 유지

### 원칙 3: 현재 포맷을 알면 정확히, 모르면 보수적으로
- parseWithFormat: 현재 포맷 기반
- parseSceneHeaderFlexibly: 포맷 모를 때 (현재 dead code 상태)
- buildSceneNumberBlock: 구조화 여부로 분기

## 알려진 한계

### SceneListPage의 timeOfDay 손실 (후속 이슈)
- handleMetaChange가 meta에 timeOfDay 없을 때 기존 content 파싱 안 함
- 영향: 레거시 씬 구조화 전환 시 시간대 정보 소실 가능

### 전역 포맷 vs 대본별 포맷
- 현재: 전역 localStorage에 포맷 저장
- 문제: 여러 대본이 다른 포맷 사용 시 충돌
- 해결 방향: Phase 2에서 대본별 속성 이관

## Phase 진행 상황

- Phase 0 (완료): 데이터 안전 방어선 구축
- Phase 1 (보류): sceneFormat.js 엄격화 (#2~#8)
- Phase 2 (계획): 대본별 포맷 아키텍처
- Phase 1.5 (계획): 워터마크 + 유출 추적