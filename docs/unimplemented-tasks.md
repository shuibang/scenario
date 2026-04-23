# 미구현 과제

## 유료화 이후 진행

### Google 로그인 도메인 브랜딩 개선
- 상태: 보류
- 우선순위: 중간
- 진행 시점: 유료화 이후

#### 배경
- 현재 Google 로그인 화면에 Supabase 기본 도메인(`project-ref.supabase.co`)이 길게 노출되어 서비스 신뢰감과 브랜드 완성도가 떨어져 보임.
- `daejak.kr` 도메인은 보유 중이므로 추후 `auth.daejak.kr` 같은 전용 인증 도메인으로 정리 가능.

#### 목표
- Google 로그인 화면에서 랜덤한 Supabase 주소 대신 브랜드 도메인이 보이도록 변경
- 로그인 화면의 브랜드 일관성과 신뢰감 개선

#### 작업 항목
1. Supabase Auth 커스텀 도메인 연결
   - 후보: `auth.daejak.kr`
2. DNS 설정
   - Supabase가 안내하는 `CNAME` / 검증용 레코드 반영
3. Google OAuth 설정 수정
   - 새 인증 도메인 기준 redirect URI 추가
4. 앱 환경 변수 변경
   - `VITE_SUPABASE_URL`을 커스텀 인증 도메인으로 교체
5. Google 브랜딩 보강
   - 앱 이름, 로고, 홈페이지, 개인정보처리방침, 이용약관 점검

#### 참고
- 커스텀 인증 도메인은 Supabase 유료화 이후 진행 예정
- 팝업 로그인 여부와 별개로, 로그인 화면의 긴 주소 문제는 인증 도메인 교체가 핵심
