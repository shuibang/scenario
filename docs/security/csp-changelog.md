# CSP Changelog

vercel.json의 Content-Security-Policy 헤더 변경 이력.

---

## 2026-04-27 (2): Pretendard sourcemap 차단 수정

연결 변경: connect-src에 cdn.jsdelivr.net 추가

사유:
DevTools가 Pretendard CSS의 sourcemap(.map)을 connect-src로
fetch하는데 차단되어 콘솔 violation 발생. 폰트 자체는
style-src/font-src로 정상 로드 중. 콘솔 정리 목적의 수정.

---

## 2026-04-27: 외부 서비스 통합 (Pretendard / GA / AdSense)

### 변경 사항

| Directive   | 추가                                          | 제거    |
|-------------|-----------------------------------------------|---------|
| script-src  | *.google-analytics.com, *.googlesyndication.com, googleads.g.doubleclick.net | www.google-analytics.com (와일드카드 흡수) |
| style-src   | cdn.jsdelivr.net                              | -       |
| connect-src | *.google-analytics.com, *.analytics.google.com, *.googlesyndication.com | www.google-analytics.com, region1.google-analytics.com (와일드카드 흡수) |
| font-src    | cdn.jsdelivr.net                              | -       |
| frame-src   | googleads.g.doubleclick.net, *.googlesyndication.com | 'none' |

### 사유
- Pretendard 폰트(jsdelivr) 정상 적용
- GA 추적 정상화
- AdSense 승인/표시 준비

### 유지된 보호
- default-src 'self'
- object-src 'none'
- base-uri 'self'
- X-Frame-Options: DENY (별도 헤더, 페이지 끼워넣기 차단)

### frame-src 완화 사유
'none' → 화이트리스트로 완화했지만, frame-src는 "우리 페이지가 부르는 iframe"
화이트리스트일 뿐. 우리 페이지를 외부에서 iframe으로 끼워넣는 공격은
X-Frame-Options DENY로 계속 차단됨.

### 향후 추가 가능성
- Kakao/Naver 로그인 추가 시: connect-src + script-src 갱신 필요
- 추가 외부 폰트 CDN 사용 시: style-src + font-src 갱신
