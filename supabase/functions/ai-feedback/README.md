# ai-feedback

대본 1개 회차를 받아 제작용/공모전용 관점의 검토를 돌려주는 Edge Function.

현재 **1단계(서버)까지만** 되어 있다. 클라이언트 연결은 없다.

```
POST /functions/v1/ai-feedback
Authorization: Bearer <access_token>

요청  { mode, synopsis, characters, episode: { number, content }, previousFeedbacks: [...] }
응답  { feedback, remaining, isPremium }
```

| 상태 | 응답 | 뜻 |
|---|---|---|
| 400 | `{ reason: 'CONTENT_TOO_LONG', message }` | 대본 분량 상한 초과. **차감 전이라 환불 불필요** |
| 400 | `{ error: 'INVALID_MODE' \| 'EPISODE_REQUIRED' \| 'INVALID_BODY', message }` | 요청 형식 오류 |
| 401 | `{ error: 'Unauthorized' }` | 토큰 없음 또는 무효 |
| 402 | `{ error: 'LIMIT_REACHED', remaining, isPremium, message }` | 한도 소진 |
| 403 | `{ error: 'FEATURE_DISABLED', message }` | 킬스위치 내려감 또는 미등록 기능 |
| 413 | `{ error: 'REQUEST_TOO_LARGE', message }` | 본문 바이트 상한 초과(서버 보호용) |
| 502 | `{ error: 'AI_FAILED' \| 'AI_EMPTY', message }` | AI 호출 실패. 차감은 되돌려진 상태 |
| 503 | `{ error: 'NOT_CONFIGURED', message }` | `ANTHROPIC_API_KEY` 미설정 |

## 배포

마이그레이션(`20260816120000` → `130000` → `140000`)을 콘솔에서 먼저 실행한 뒤:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # 한 번만
supabase functions deploy ai-feedback
```

키는 Edge Function 시크릿에만 둔다. 저장소·클라이언트·로그 어디에도 두지 않는다.

## 지켜야 할 것

**무상태.** 대본과 피드백을 어디에도 저장하지 않는다. DB에도 로그에도 남기지 않는다.
회차를 넘는 기억은 클라이언트가 이전 `[AI]` 피드백 요약을 함께 보내는 것으로 만든다.
`console` 에는 메타데이터(모드·길이·상태 코드)만 남긴다.

**차감은 AI 호출 전에.** 반대 순서로 두면 응답을 받고 연결을 끊는 것만으로 무한 호출이 된다.
호출이 실패하면 `refund_usage` 로 되돌린다.

**feature 이름과 한도를 요청에서 읽지 않는다.** `'ai_feedback'` 하드코딩,
한도는 `feature_limits` 테이블이 정한다.

**AI는 쓰지 않는다.** 시스템 프롬프트 8번 원칙. 문제를 짚고 방향을 설명하되
대체 대사·지문·문장·씬을 직접 써주지 않는다. 예외 없음.

## 상한

| 값 | 위치 | 성격 |
|---|---|---|
| 대본 10만자 | `MAX_CONTENT_CHARS` (request.ts) | 영화 장편 시나리오는 포용, 드라마 다회차 합본은 차단 |
| 본문 500 KiB | `MAX_BODY_BYTES` (request.ts) | 서버 보호용 바깥 울타리. 항상 분량 상한보다 넉넉해야 한다 |
| 이전 피드백 20건 × 2000자 | `MAX_PREVIOUS_FEEDBACKS`, `MAX_PREVIOUS_SUMMARY_CHARS` | 회차가 쌓여도 입력이 선형으로 늘지 않게 |

**분량 상한 수치를 밖에 알리지 않는다.** 상한을 알리면 "최대한 채워 넣자"는 유인이 된다.
사전 안내·툴팁·문서 어디에도 숫자를 쓰지 않고, 걸렸을 때만 숫자 없이 안내한다
(`TOO_LONG_MESSAGE`). 이 규칙은 테스트로 잠겨 있다.

---

## 2단계 (클라이언트) 요구사항

아직 구현하지 않았다. 붙일 때 아래를 함께 처리한다.

### 회차 단위 전송

- UI는 **회차 선택 방식**을 전제한다. 자유 붙여넣기가 아니다.
- 전송 전 `MAX_CONTENT_CHARS` 로 자체 검사하고, 초과하면 전송하지 않는다.
  안내는 숫자 없이 `TOO_LONG_MESSAGE` 와 같은 문구로 한다.
- 기능 안내에는 권장만 쓴다: "피드백은 회차 단위로 받을 때 가장 깊고 구체적입니다"
  (상한이 있다는 사실 자체를 홍보하지 않는다)

### 동의 모달

최초 사용 시 동의 모달에 아래 문구를 포함한다.

> 피드백 문장을 작품에 그대로 옮기지 마세요.
> AI 생성 텍스트에는 기계가 식별할 수 있는 표식이 포함될 수 있습니다

시스템 프롬프트 8번(대체 문장 금지)과 짝이다. 프롬프트로 완성 문장 생성을 막고,
모달로 그래도 옮겨 쓰는 경우의 위험을 알린다.

### 에러 처리

- `reason: 'CONTENT_TOO_LONG'` 과 `error: '...'` 두 키를 모두 본다.
  (분량 초과만 `reason` 을 쓴다. 이때 한쪽으로 통일하는 편이 낫다)
- 402/403 은 재시도 버튼을 주지 않는다. 재시도해도 결과가 같다.
- 502 는 차감이 되돌려진 상태이므로 재시도를 권해도 된다.

### 이전 피드백 전달

- 저장된 `[AI]` 피드백 중 **요약만** 보낸다. 전문을 보내면 회차가 쌓일수록 입력이 커진다.
- 대본 본문은 서버에 저장되지 않으므로 매 요청에 실어 보내야 한다.
