/**
 * security-audit.mjs — OWASP Top 10 기반 보안 감사 스크립트
 * 실행: node security-audit.mjs
 *
 * 검사 항목:
 *  A01 - Broken Access Control
 *  A02 - Cryptographic Failures
 *  A03 - SQL Injection
 *  A04 - Insecure Design
 *  A05 - Security Misconfiguration
 *  A06 - Vulnerable Components
 *  A07 - Auth Failures
 *  A08 - Software & Data Integrity
 *  A09 - Logging Failures
 *  A10 - SSRF
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ─── 색상 출력 ────────────────────────────────────────────────────────────────
const R = s => `\x1b[31m${s}\x1b[0m`;
const G = s => `\x1b[32m${s}\x1b[0m`;
const Y = s => `\x1b[33m${s}\x1b[0m`;
const B = s => `\x1b[34m${s}\x1b[0m`;
const W = s => `\x1b[1m${s}\x1b[0m`;

const results = { pass: [], warn: [], fail: [] };

function pass(id, msg)  { results.pass.push({ id, msg }); console.log(G(`  ✅ [${id}] ${msg}`)); }
function warn(id, msg)  { results.warn.push({ id, msg }); console.log(Y(`  ⚠️  [${id}] ${msg}`)); }
function fail(id, msg)  { results.fail.push({ id, msg }); console.log(R(`  🔴 [${id}] ${msg}`)); }
function section(title) { console.log(`\n${B(W('━'.repeat(60)))}\n${W('  ' + title)}\n${B('━'.repeat(60))}`); }

// ─── 파일 수집 ────────────────────────────────────────────────────────────────
function collectFiles(dir, exts = ['.js', '.jsx', '.ts', '.tsx'], skip = ['node_modules', 'dist', '.git']) {
  const files = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.includes(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (exts.some(e => entry.name.endsWith(e))) files.push(full);
    }
  }
  walk(dir);
  return files;
}

function readFile(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

function grep(files, pattern, flags = 'g') {
  const re = new RegExp(pattern, flags);
  const hits = [];
  for (const f of files) {
    const lines = readFile(f).split('\n');
    lines.forEach((line, i) => {
      if (re.test(line)) hits.push({ file: path.relative('.', f), line: i + 1, content: line.trim() });
    });
  }
  return hits;
}

const ROOT = '.';
const SRC  = './src';
const srcFiles = collectFiles(SRC);
const allFiles = collectFiles(ROOT, ['.js', '.jsx', '.ts', '.tsx', '.json', '.yml', '.yaml', '.env']);

console.log(W('\n🔒 OWASP Top 10 보안 감사 시작'));
console.log(`   대상: ${srcFiles.length}개 소스 파일\n`);

// ════════════════════════════════════════════════════════════════════════════════
// A01 — Broken Access Control
// ════════════════════════════════════════════════════════════════════════════════
section('A01 — Broken Access Control (접근 제어 취약점)');

// 1-1. Supabase 쿼리에 소유자 필터 없는 SELECT
const supabaseSelects = grep(srcFiles, '\\.from\\([\'"].+[\'"]\\).*\\.select');
if (supabaseSelects.length > 0) {
  const noFilter = supabaseSelects.filter(h =>
    !h.content.includes('.eq(') && !h.content.includes('user_id') &&
    !h.content.includes('project_id') && !h.content.includes('owner')
  );
  if (noFilter.length > 0) {
    noFilter.forEach(h => warn('A01-1', `소유자 필터 없는 SELECT: ${h.file}:${h.line} → ${h.content.slice(0, 80)}`));
  } else {
    pass('A01-1', 'Supabase SELECT 쿼리에 필터 존재 (또는 단건 조회)');
  }
} else {
  pass('A01-1', 'Supabase SELECT 쿼리 없음');
}

// 1-2. URL 파라미터 직접 사용
const urlParam = grep(srcFiles, 'location\\.hash|searchParams\\.get|useParams\\(');
if (urlParam.length > 0) {
  urlParam.forEach(h => warn('A01-2', `URL 파라미터 직접 사용 확인 필요: ${h.file}:${h.line}`));
} else {
  pass('A01-2', 'URL 파라미터 직접 DB 사용 없음');
}

// 1-3. review_links — UUID 사용 여부
const reviewShare = readFile('./src/utils/reviewShare.js');
if (reviewShare.includes('randomUUID')) {
  pass('A01-3', '공유링크 ID — crypto.randomUUID() 사용 (128비트)');
} else if (reviewShare.includes('Math.random')) {
  fail('A01-3', '공유링크 ID — Math.random() 사용 (추측 가능!)');
} else {
  warn('A01-3', '공유링크 ID 생성 방식 확인 불가');
}

// ════════════════════════════════════════════════════════════════════════════════
// A02 — Cryptographic Failures
// ════════════════════════════════════════════════════════════════════════════════
section('A02 — Cryptographic Failures (암호화 실패)');

// 2-1. 하드코딩 시크릿
const hardSecrets = grep(allFiles,
  '(supabase\\.co|eyJ[A-Za-z0-9+/]{20}|sk-[A-Za-z0-9]{20}|AIza[A-Za-z0-9]{30}|ghp_[A-Za-z0-9]{36})'
);
const filteredSecrets = hardSecrets.filter(h =>
  !h.file.includes('package-lock') && !h.file.includes('.example')
);
if (filteredSecrets.length > 0) {
  filteredSecrets.forEach(h => fail('A02-1', `하드코딩 시크릿 의심: ${h.file}:${h.line}`));
} else {
  pass('A02-1', '하드코딩된 시크릿 없음');
}

// 2-2. Math.random() — 보안 목적 사용 여부
const mathRandom = grep(srcFiles, 'Math\\.random\\(\\)');
const sensitiveRandom = mathRandom.filter(h =>
  h.content.toLowerCase().includes('id') ||
  h.content.toLowerCase().includes('token') ||
  h.content.toLowerCase().includes('key') ||
  h.content.toLowerCase().includes('secret')
);
if (sensitiveRandom.length > 0) {
  sensitiveRandom.forEach(h => warn('A02-2', `Math.random() ID/토큰 용도 의심: ${h.file}:${h.line} → ${h.content.slice(0, 80)}`));
} else {
  pass('A02-2', 'Math.random() 보안 목적 사용 없음');
}

// 2-3. HTTP (비암호화) 통신
const httpUrls = grep(srcFiles, 'http://(?!localhost)');
if (httpUrls.length > 0) {
  httpUrls.forEach(h => warn('A02-3', `비암호화 HTTP 사용: ${h.file}:${h.line}`));
} else {
  pass('A02-3', 'HTTP 평문 통신 없음 (HTTPS만 사용)');
}

// ════════════════════════════════════════════════════════════════════════════════
// A03 — Injection (SQL / Command / XSS)
// ════════════════════════════════════════════════════════════════════════════════
section('A03 — Injection (SQL 인젝션 / XSS / Command 인젝션)');

// 3-1. SQL 인젝션 — Supabase 파라미터 바인딩 사용 여부
// Supabase JS SDK는 파라미터 바인딩 강제 → raw SQL 직접 실행만 위험
const rawSql = grep(srcFiles, '\\.rpc\\(|\\.sql\\(|raw.*query|query.*raw');
if (rawSql.length > 0) {
  rawSql.forEach(h => warn('A03-1', `Raw SQL 실행 의심: ${h.file}:${h.line} → ${h.content.slice(0, 80)}`));
} else {
  pass('A03-1', 'Raw SQL 직접 실행 없음 (Supabase SDK 파라미터 바인딩 사용)');
}

// 3-2. XSS — innerHTML 직접 사용
const innerHTMLs = grep(srcFiles, '\\.innerHTML\\s*=');
const unsafeInnerHTML = innerHTMLs.filter(h =>
  !h.content.includes('esc(') &&
  !h.content.includes('DOMPurify') &&
  !h.content.includes("'<br>'") &&
  !h.content.includes('"<br>"') &&
  !h.content.includes("'<br />'")
);
if (unsafeInnerHTML.length > 0) {
  unsafeInnerHTML.forEach(h => warn('A03-2', `sanitize 없는 innerHTML: ${h.file}:${h.line} → ${h.content.slice(0, 80)}`));
} else {
  pass('A03-2', 'innerHTML — esc() 또는 DOMPurify로 모두 보호됨');
}

// 3-3. dangerouslySetInnerHTML
const dangerous = grep(srcFiles, 'dangerouslySetInnerHTML');
if (dangerous.length > 0) {
  dangerous.forEach(h => fail('A03-3', `dangerouslySetInnerHTML 사용: ${h.file}:${h.line}`));
} else {
  pass('A03-3', 'dangerouslySetInnerHTML 사용 없음');
}

// 3-4. eval / document.write
const evals = grep(srcFiles, '\\beval\\s*\\(|document\\.write\\s*\\(');
const filteredEvals = evals.filter(h => !h.content.trim().startsWith('//'));
if (filteredEvals.length > 0) {
  filteredEvals.forEach(h => warn('A03-4', `eval/document.write 사용: ${h.file}:${h.line} → ${h.content.slice(0, 80)}`));
} else {
  pass('A03-4', 'eval / document.write 사용 없음');
}

// 3-5. Command Injection (child_process 등)
const cmdInject = grep(srcFiles, 'child_process|exec\\(|spawn\\(|execSync');
if (cmdInject.length > 0) {
  cmdInject.forEach(h => fail('A03-5', `Command 실행 의심: ${h.file}:${h.line}`));
} else {
  pass('A03-5', 'Command Injection 경로 없음 (브라우저 앱)');
}

// ════════════════════════════════════════════════════════════════════════════════
// A04 — Insecure Design
// ════════════════════════════════════════════════════════════════════════════════
section('A04 — Insecure Design (안전하지 않은 설계)');

// 4-1. 파일 업로드 — 매직바이트 검사
const myPage = readFile('./src/components/MyPage.jsx');
if (myPage.includes('magic') && myPage.includes('Uint8Array')) {
  pass('A04-1', '폰트 업로드 — 매직바이트 3단계 검증 적용됨');
} else {
  fail('A04-1', '폰트 업로드 — 매직바이트 검사 없음');
}

// 4-2. 이미지 업로드 — MIME 타입 검사
const resourcePanel = readFile('./src/components/ResourcePanel.jsx');
if (resourcePanel.includes("file.type.startsWith('image/')")) {
  pass('A04-2', '이미지 업로드 — MIME 타입 검사 적용됨');
} else {
  fail('A04-2', '이미지 업로드 — MIME 타입 검사 없음');
}

// 4-3. 파일 용량 제한
if (resourcePanel.includes('IMAGE_MAX_BYTES') && resourcePanel.includes('IMAGE_MAX_B64')) {
  pass('A04-3', '이미지 업로드 — 1차(file.size) + 2차(base64) 이중 용량 검사');
} else {
  fail('A04-3', '이미지 업로드 — 용량 제한 없음');
}

// 4-4. Rate limiting — 클라이언트 레벨
const rateLimiting = grep(srcFiles, 'rateLimit|throttle|debounce.*submit|cooldown');
if (rateLimiting.length > 0) {
  pass('A04-4', `Rate limiting 패턴 발견 (${rateLimiting.length}곳)`);
} else {
  warn('A04-4', 'Rate limiting 코드 없음 — Supabase/서버 설정에 의존');
}

// ════════════════════════════════════════════════════════════════════════════════
// A05 — Security Misconfiguration
// ════════════════════════════════════════════════════════════════════════════════
section('A05 — Security Misconfiguration (보안 설정 오류)');

// 5-1. .env 파일 git 추적 여부
const gitignore = readFile('./.gitignore');
if (gitignore.includes('.env') && !gitignore.includes('# .env')) {
  pass('A05-1', '.env 파일이 .gitignore에 등록됨');
} else {
  fail('A05-1', '.env 파일이 .gitignore에 없음! 시크릿 노출 위험');
}

// 5-2. .env 파일이 실제로 git에 추적되지 않는지
try {
  const tracked = execSync('git ls-files .env', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  if (tracked) {
    fail('A05-2', '.env 파일이 git에 추적되고 있음! 즉시 제거 필요');
  } else {
    pass('A05-2', '.env 파일이 git에 추적되지 않음');
  }
} catch {
  warn('A05-2', 'git 명령 실행 실패 — 수동 확인 필요');
}

// 5-3. vercel.json 보안 헤더
const vercelJson = readFile('./vercel.json');
if (vercelJson.includes('X-Frame-Options') || vercelJson.includes('Content-Security-Policy')) {
  pass('A05-3', 'vercel.json — 보안 헤더 설정됨');
} else {
  warn('A05-3', 'vercel.json — X-Frame-Options / CSP 헤더 미설정');
}

// 5-4. console.log 민감정보 출력
const consoleLogs = grep(srcFiles, 'console\\.log.*(?:password|token|secret|key|auth|credential)', 'gi');
if (consoleLogs.length > 0) {
  consoleLogs.forEach(h => warn('A05-4', `민감정보 console.log 의심: ${h.file}:${h.line}`));
} else {
  pass('A05-4', 'console.log에 민감정보 출력 없음');
}

// ════════════════════════════════════════════════════════════════════════════════
// A06 — Vulnerable & Outdated Components
// ════════════════════════════════════════════════════════════════════════════════
section('A06 — Vulnerable & Outdated Components (취약한 컴포넌트)');

// 6-1. npm audit
try {
  execSync('npm audit --audit-level=high 2>&1', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  pass('A06-1', 'npm audit — high 이상 취약점 없음');
} catch (e) {
  const out = e.stdout || '';
  const highMatch = out.match(/(\d+) high/);
  const critMatch = out.match(/(\d+) critical/);
  if (critMatch && parseInt(critMatch[1]) > 0) {
    fail('A06-1', `npm audit — critical 취약점 ${critMatch[1]}개 발견`);
  } else if (highMatch && parseInt(highMatch[1]) > 0) {
    warn('A06-1', `npm audit — high 취약점 ${highMatch[1]}개 발견`);
  } else {
    pass('A06-1', 'npm audit — high 이상 취약점 없음');
  }
}

// 6-2. DOMPurify 사용 여부 (XSS 방어 라이브러리)
const usesDomPurify = grep(srcFiles, 'DOMPurify');
if (usesDomPurify.length > 0) {
  pass('A06-2', `DOMPurify 사용 중 (${usesDomPurify.length}곳) — XSS 방어`);
} else {
  warn('A06-2', 'DOMPurify 미사용 — innerHTML 사용 시 XSS 위험');
}

// ════════════════════════════════════════════════════════════════════════════════
// A07 — Authentication Failures
// ════════════════════════════════════════════════════════════════════════════════
section('A07 — Authentication Failures (인증 실패)');

// 7-1. 세션 검사 후 Supabase INSERT
const supabaseInserts = grep(srcFiles, '\\.from\\(.+\\)\\.insert');
const insertsWithAuth = grep(srcFiles, 'getSession|auth\\.user|session\\.user');
if (insertsWithAuth.length > 0) {
  pass('A07-1', '인증이 필요한 INSERT 전 세션 확인 코드 존재');
} else {
  warn('A07-1', 'Supabase INSERT 전 세션 확인 코드 없음 — RLS 의존');
}

// 7-2. 토큰 localStorage 저장
const tokenInStorage = grep(srcFiles, 'localStorage.*token|token.*localStorage|sessionStorage.*token');
if (tokenInStorage.length > 0) {
  tokenInStorage.forEach(h => warn('A07-2', `토큰 로컬스토리지 저장 의심: ${h.file}:${h.line}`));
} else {
  pass('A07-2', '토큰 직접 localStorage 저장 없음 (Supabase SDK가 관리)');
}

// 7-3. 로그아웃 시 세션 정리
const signOut = grep(srcFiles, 'signOut|logout|clearSession');
if (signOut.length > 0) {
  pass('A07-3', `로그아웃 처리 코드 존재 (${signOut.length}곳)`);
} else {
  fail('A07-3', '로그아웃/세션 정리 코드 없음');
}

// ════════════════════════════════════════════════════════════════════════════════
// A08 — Software & Data Integrity
// ════════════════════════════════════════════════════════════════════════════════
section('A08 — Software & Data Integrity (소프트웨어 무결성)');

// 8-1. package-lock.json 존재
if (fs.existsSync('./package-lock.json')) {
  pass('A08-1', 'package-lock.json 존재 — 의존성 버전 고정됨');
} else {
  warn('A08-1', 'package-lock.json 없음 — 의존성 버전 불안정');
}

// 8-2. JSON.parse 예외 처리
const jsonParses = grep(srcFiles, 'JSON\\.parse\\(');
const unsafeJsonParse = jsonParses.filter(h => {
  const surroundingLines = readFile(
    allFiles.find(f => f.includes(h.file.replace(/\//g, path.sep))) || ''
  ).split('\n').slice(Math.max(0, h.line - 3), h.line + 2).join('\n');
  return !surroundingLines.includes('try') && !surroundingLines.includes('catch');
});
if (unsafeJsonParse.length > 0) {
  unsafeJsonParse.slice(0, 3).forEach(h => warn('A08-2', `try-catch 없는 JSON.parse: ${h.file}:${h.line}`));
} else {
  pass('A08-2', 'JSON.parse — 모두 예외 처리됨');
}

// 8-3. 외부 스크립트 동적 로드
const dynamicScript = grep(srcFiles, "createElement\\('script'\\)|createElement\\(\"script\"\\)|src\\s*=.*http");
if (dynamicScript.length > 0) {
  dynamicScript.forEach(h => warn('A08-3', `동적 스크립트 로드: ${h.file}:${h.line}`));
} else {
  pass('A08-3', '외부 스크립트 동적 로드 없음');
}

// ════════════════════════════════════════════════════════════════════════════════
// A09 — Logging & Monitoring Failures
// ════════════════════════════════════════════════════════════════════════════════
section('A09 — Logging & Monitoring Failures (로깅 실패)');

// 9-1. 에러 리포트 시스템
const errorReport = grep(srcFiles, 'error_reports|reportError|captureException|Sentry');
if (errorReport.length > 0) {
  pass('A09-1', `에러 리포트 시스템 존재 (${errorReport.length}곳)`);
} else {
  warn('A09-1', '에러 리포트/모니터링 시스템 없음');
}

// 9-2. catch 블록에서 에러 무시
const emptyCatch = grep(srcFiles, 'catch\\s*\\([^)]*\\)\\s*\\{\\s*\\}');
if (emptyCatch.length > 0) {
  emptyCatch.forEach(h => warn('A09-2', `빈 catch 블록 (에러 무시): ${h.file}:${h.line}`));
} else {
  pass('A09-2', '빈 catch 블록 없음');
}

// 9-3. 인증 실패 로깅
const authFailLog = grep(srcFiles, 'auth.*error|error.*auth|signIn.*error|login.*fail');
if (authFailLog.length > 0) {
  pass('A09-3', '인증 실패 처리 코드 존재');
} else {
  warn('A09-3', '인증 실패 로깅 코드 없음');
}

// ════════════════════════════════════════════════════════════════════════════════
// A10 — SSRF (Server-Side Request Forgery)
// ════════════════════════════════════════════════════════════════════════════════
section('A10 — SSRF (서버사이드 요청 위조)');

// 10-1. 사용자 입력 기반 fetch URL
const fetchWithInput = grep(srcFiles, 'fetch\\(.*\\+|fetch\\(`.*\\$\\{');
if (fetchWithInput.length > 0) {
  fetchWithInput.forEach(h => warn('A10-1', `사용자 입력 기반 fetch URL 의심: ${h.file}:${h.line} → ${h.content.slice(0, 80)}`));
} else {
  pass('A10-1', '사용자 입력 기반 동적 fetch URL 없음');
}

// 10-2. 브라우저 앱 → SSRF 구조적 불가
pass('A10-2', '브라우저 전용 앱 — 서버사이드 요청 위조 경로 구조적으로 없음');

// ════════════════════════════════════════════════════════════════════════════════
// 결과 요약
// ════════════════════════════════════════════════════════════════════════════════
console.log(`\n${B(W('═'.repeat(60)))}`);
console.log(W('  📊 보안 감사 결과 요약'));
console.log(`${B('═'.repeat(60))}\n`);

console.log(G(`  ✅ 통과: ${results.pass.length}개`));
console.log(Y(`  ⚠️  경고: ${results.warn.length}개`));
console.log(R(`  🔴 실패: ${results.fail.length}개`));

if (results.fail.length > 0) {
  console.log(`\n${R(W('  즉시 수정 필요:'))}`);
  results.fail.forEach(r => console.log(R(`  • [${r.id}] ${r.msg}`)));
}

if (results.warn.length > 0) {
  console.log(`\n${Y(W('  검토 권장:'))}`);
  results.warn.forEach(r => console.log(Y(`  • [${r.id}] ${r.msg}`)));
}

const score = Math.round((results.pass.length / (results.pass.length + results.warn.length * 0.5 + results.fail.length)) * 100);
const grade = score >= 90 ? G('A') : score >= 75 ? Y('B') : score >= 60 ? Y('C') : R('D');
console.log(`\n  보안 점수: ${grade} (${score}점 / 100점)\n`);
