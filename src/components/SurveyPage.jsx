/**
 * SurveyPage — 대본 작업실 베타 테스트 설문
 * 접근: /#survey
 */
import React, { useState, useMemo } from 'react';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 1, emoji: '📝', title: '기본 정보' },
  { id: 2, emoji: '⭐', title: '기능 평가' },
  { id: 3, emoji: '🖥️', title: '사용 경험' },
  { id: 4, emoji: '🔧', title: '개선 요청' },
  { id: 5, emoji: '💬', title: '마지막' },
];

const FEATURE_OPTIONS = [
  '대본 편집 (씬번호/지문/대사)',
  '씬번호 자동 연동',
  '시놉시스 편집',
  '인물 관리',
  '인물이력서',
  '트리트먼트',
  '씬리스트',
  '구조 점검',
  '출력 (PDF/DOCX/HWPX)',
  '검토 링크 공유',
  '다크모드',
];

// ─── 유틸 컴포넌트 ─────────────────────────────────────────────────────────────

function SectionHeader({ emoji, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
      <span style={{
        background: 'var(--c-accent)', color: '#fff',
        borderRadius: 8, padding: '4px 10px', fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {emoji} {title}
      </span>
    </div>
  );
}

function Required() {
  return <span style={{ color: 'var(--c-error)', marginLeft: 3, fontSize: 12 }}>*</span>;
}

function Optional() {
  return <span style={{ color: 'var(--c-text4)', fontSize: 11, marginLeft: 4 }}>(선택)</span>;
}

function QuestionLabel({ children }) {
  return (
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-text)', marginBottom: 12, lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      background: 'var(--c-card)', border: '1px solid var(--c-border2)',
      borderRadius: 12, padding: '24px 20px', marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function SingleSelect({ options, value, onChange, allowOther }) {
  const [otherText, setOtherText] = useState('');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name={opt}
            checked={value === opt}
            onChange={() => onChange(opt)}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>{opt}</span>
        </label>
      ))}
      {allowOther && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            checked={value === '__other__'}
            onChange={() => onChange('__other__')}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>기타</span>
          {value === '__other__' && (
            <input
              type="text"
              value={otherText}
              onChange={e => { setOtherText(e.target.value); onChange('__other__:' + e.target.value); }}
              placeholder="직접 입력"
              style={{
                background: 'var(--c-input)', border: '1px solid var(--c-border3)',
                borderRadius: 6, padding: '4px 10px', fontSize: 13, color: 'var(--c-text)',
                outline: 'none', flex: 1,
              }}
            />
          )}
        </label>
      )}
    </div>
  );
}

function MultiSelect({ options, value, onChange, allowOther }) {
  const [otherText, setOtherText] = useState('');
  const toggle = (opt) => {
    const next = value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt];
    onChange(next);
  };
  const otherChecked = value.some(v => v.startsWith('__other__'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={value.includes(opt)}
            onChange={() => toggle(opt)}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>{opt}</span>
        </label>
      ))}
      {allowOther && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={otherChecked}
            onChange={() => {
              if (otherChecked) onChange(value.filter(v => !v.startsWith('__other__')));
              else onChange([...value, '__other__:']);
            }}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>기타</span>
          {otherChecked && (
            <input
              type="text"
              value={otherText}
              onChange={e => {
                setOtherText(e.target.value);
                onChange([...value.filter(v => !v.startsWith('__other__')), '__other__:' + e.target.value]);
              }}
              placeholder="직접 입력"
              style={{
                background: 'var(--c-input)', border: '1px solid var(--c-border3)',
                borderRadius: 6, padding: '4px 10px', fontSize: 13, color: 'var(--c-text)',
                outline: 'none', flex: 1,
              }}
            />
          )}
        </label>
      )}
    </div>
  );
}

function ScaleRating({ value, onChange, leftLabel, rightLabel }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n} type="button" onClick={() => onChange(n)}
            style={{
              width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: value === n ? 'var(--c-accent)' : 'var(--c-input)',
              color: value === n ? '#fff' : 'var(--c-text3)',
              fontSize: 15, fontWeight: 700,
              transition: 'all 0.15s',
            }}
          >{n}</button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text4)' }}>
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TextArea({ value, onChange, placeholder }) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '자유롭게 입력해주세요'}
      rows={3}
      style={{
        width: '100%', background: 'var(--c-input)', border: '1px solid var(--c-border3)',
        borderRadius: 8, padding: '10px 12px', color: 'var(--c-text)', fontSize: 14,
        resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
        lineHeight: 1.6,
      }}
    />
  );
}

// ─── 진행률 바 ────────────────────────────────────────────────────────────────

function ProgressBar({ answers }) {
  const total = 16;
  const filled = Object.values(answers).filter(v =>
    v !== '' && v !== null && v !== 0 && !(Array.isArray(v) && v.length === 0)
  ).length;
  const pct = Math.round((filled / total) * 100);

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'var(--c-header)', borderBottom: '1px solid var(--c-border)',
      padding: '10px 20px',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text3)' }}>대본 작업실 베타 테스트 설문</span>
          <span style={{ fontSize: 12, color: 'var(--c-accent)', fontWeight: 700 }}>{pct}%</span>
        </div>
        <div style={{ background: 'var(--c-border2)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
          <div style={{
            width: pct + '%', height: '100%',
            background: 'var(--c-accent)', borderRadius: 4,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function SurveyPage() {
  const [answers, setAnswers] = useState({
    q1: '', q2: [], q3: [], q4: '', q5: '', q6: [],
    q7: 0, q8: '', q9: '', q9detail: '', q10: '', q10detail: '',
    q11: '', q12: '', q13: 0, q14: '', q15: '', q16: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const set = (key, val) => setAnswers(prev => ({ ...prev, [key]: val }));

  // Q3 기반 동적 선택지 (Q4, Q5)
  const usedFeatures = useMemo(() => answers.q3.filter(f => !f.startsWith('__other__')), [answers.q3]);

  const validate = () => {
    const e = {};
    if (!answers.q1) e.q1 = true;
    if (answers.q2.length === 0) e.q2 = true;
    if (answers.q3.length === 0) e.q3 = true;
    if (usedFeatures.length > 0 && !answers.q4) e.q4 = true;
    if (usedFeatures.length > 1 && !answers.q5) e.q5 = true;
    if (answers.q6.length === 0) e.q6 = true;
    if (!answers.q7) e.q7 = true;
    if (!answers.q9) e.q9 = true;
    if (!answers.q10) e.q10 = true;
    if (!answers.q13) e.q13 = true;
    if (!answers.q15) e.q15 = true;
    return e;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = Object.keys(errs)[0];
      document.getElementById('q' + firstKey.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    console.log('[Survey] 응답:', answers);
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const errStyle = { border: '1px solid var(--c-error) !important' };
  const errMsg = <div style={{ color: 'var(--c-error)', fontSize: 12, marginTop: 8 }}>필수 항목입니다.</div>;

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--c-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🎬</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--c-text)', marginBottom: 14 }}>
            소중한 피드백 감사해요!
          </h1>
          <p style={{ color: 'var(--c-text3)', fontSize: 15, lineHeight: 1.8 }}>
            더 좋은 툴로 돌아올게요 🎬<br />
            여러분의 의견이 대본 작업실을 만들어갑니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--c-bg)' }}>
      <ProgressBar answers={answers} />

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 80px' }}>

        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--c-text)', marginBottom: 10 }}>
            대본 작업실 베타 테스트 설문
          </h1>
          <p style={{ color: 'var(--c-text3)', fontSize: 14, lineHeight: 1.7 }}>
            실제 사용해보신 경험을 솔직하게 알려주세요.<br />
            약 5분 소요됩니다.
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ── 섹션 1: 기본 정보 ── */}
          <SectionHeader emoji="📝" title="기본 정보" />

          <Card>
            <div id="q1">
              <QuestionLabel>Q1. 주로 어떤 글을 쓰시나요?<Required /></QuestionLabel>
              <SingleSelect
                options={['드라마/시트콤 대본', '영화 시나리오', '웹드라마/숏폼', '아직 입봉 전 / 공부 중']}
                value={answers.q1}
                onChange={v => { set('q1', v); setErrors(p => ({ ...p, q1: false })); }}
                allowOther
              />
              {errors.q1 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q2">
              <QuestionLabel>Q2. 평소 대본 작업에 주로 사용하는 툴은?<Required /> <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12 }}>(복수 선택)</span></QuestionLabel>
              <MultiSelect
                options={['한글(HWP)', '워드', '파이널 드래프트', '스크리브너', '씨네한글', '그냥 메모장/구글독스']}
                value={answers.q2}
                onChange={v => { set('q2', v); setErrors(p => ({ ...p, q2: false })); }}
                allowOther
              />
              {errors.q2 && errMsg}
            </div>
          </Card>

          {/* ── 섹션 2: 기능 평가 ── */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="⭐" title="기능 평가" />
          </div>

          <Card>
            <div id="q3">
              <QuestionLabel>Q3. 아래 기능 중 실제로 사용해본 것을 모두 골라주세요.<Required /> <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12 }}>(복수 선택)</span></QuestionLabel>
              <MultiSelect
                options={FEATURE_OPTIONS}
                value={answers.q3}
                onChange={v => {
                  set('q3', v);
                  set('q4', '');
                  set('q5', '');
                  setErrors(p => ({ ...p, q3: false }));
                }}
              />
              {errors.q3 && errMsg}
            </div>
          </Card>

          {usedFeatures.length > 0 && (
            <Card>
              <div id="q4">
                <QuestionLabel>Q4. 가장 유용했던 기능은 무엇인가요?<Required /></QuestionLabel>
                <SingleSelect
                  options={usedFeatures}
                  value={answers.q4}
                  onChange={v => { set('q4', v); setErrors(p => ({ ...p, q4: false })); }}
                />
                {errors.q4 && errMsg}
              </div>
            </Card>
          )}

          {usedFeatures.length > 1 && (
            <Card>
              <div id="q5">
                <QuestionLabel>Q5. 가장 손이 안 갔던 기능은?<Required /></QuestionLabel>
                <SingleSelect
                  options={usedFeatures.filter(f => f !== answers.q4)}
                  value={answers.q5}
                  onChange={v => { set('q5', v); setErrors(p => ({ ...p, q5: false })); }}
                />
                {errors.q5 && errMsg}
              </div>
            </Card>
          )}

          <Card>
            <div id="q6">
              <QuestionLabel>Q6. 손이 안 간 이유는 무엇인가요?<Required /> <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12 }}>(복수 선택)</span></QuestionLabel>
              <MultiSelect
                options={['필요성을 못 느꼈어요', '어떻게 쓰는지 몰랐어요', '써봤는데 불편했어요', '내 작업 방식과 안 맞아요']}
                value={answers.q6}
                onChange={v => { set('q6', v); setErrors(p => ({ ...p, q6: false })); }}
                allowOther
              />
              {errors.q6 && errMsg}
            </div>
          </Card>

          {/* ── 섹션 3: 사용 경험 ── */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="🖥️" title="사용 경험" />
          </div>

          <Card>
            <div id="q7">
              <QuestionLabel>Q7. 전반적인 사용 난이도는?<Required /></QuestionLabel>
              <ScaleRating
                value={answers.q7}
                onChange={v => { set('q7', v); setErrors(p => ({ ...p, q7: false })); }}
                leftLabel="아주 어려웠어요"
                rightLabel="아주 쉬웠어요"
              />
              {errors.q7 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q8">
              <QuestionLabel>Q8. 특별히 어렵거나 헷갈렸던 부분이 있었나요?<Optional /></QuestionLabel>
              <TextArea value={answers.q8} onChange={v => set('q8', v)} placeholder="어떤 부분이 헷갈리셨나요?" />
            </div>
          </Card>

          <Card>
            <div id="q9">
              <QuestionLabel>Q9. 모바일/태블릿에서도 사용해보셨나요?<Required /></QuestionLabel>
              <SingleSelect
                options={['네, 편했어요', '네, 불편했어요', '아직 PC로만 써봤어요']}
                value={answers.q9}
                onChange={v => { set('q9', v); set('q9detail', ''); setErrors(p => ({ ...p, q9: false })); }}
              />
              {answers.q9 === '네, 불편했어요' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 6 }}>어떤 점이 불편하셨나요?</div>
                  <TextArea value={answers.q9detail} onChange={v => set('q9detail', v)} placeholder="불편했던 점을 알려주세요" />
                </div>
              )}
              {errors.q9 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q10">
              <QuestionLabel>Q10. 출력(PDF/DOCX/HWPX) 기능을 사용해보셨나요?<Required /></QuestionLabel>
              <SingleSelect
                options={['네, 잘 됐어요', '네, 문제가 있었어요', '아직 안 써봤어요']}
                value={answers.q10}
                onChange={v => { set('q10', v); set('q10detail', ''); setErrors(p => ({ ...p, q10: false })); }}
              />
              {answers.q10 === '네, 문제가 있었어요' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 6 }}>어떤 문제가 있었나요?</div>
                  <TextArea value={answers.q10detail} onChange={v => set('q10detail', v)} placeholder="문제 상황을 알려주세요" />
                </div>
              )}
              {errors.q10 && errMsg}
            </div>
          </Card>

          {/* ── 섹션 4: 개선 요청 ── */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="🔧" title="개선 요청" />
          </div>

          <Card>
            <div id="q11">
              <QuestionLabel>Q11. 꼭 추가됐으면 하는 기능이 있나요?<Optional /></QuestionLabel>
              <TextArea value={answers.q11} onChange={v => set('q11', v)} placeholder="원하는 기능을 자유롭게 적어주세요" />
            </div>
          </Card>

          <Card>
            <div id="q12">
              <QuestionLabel>Q12. 가장 불편했던 점은?<Optional /></QuestionLabel>
              <TextArea value={answers.q12} onChange={v => set('q12', v)} placeholder="불편했던 점을 솔직하게 알려주세요" />
            </div>
          </Card>

          <Card>
            <div id="q13">
              <QuestionLabel>Q13. 이 툴을 다른 작가에게 추천할 의향이 있나요?<Required /></QuestionLabel>
              <ScaleRating
                value={answers.q13}
                onChange={v => { set('q13', v); setErrors(p => ({ ...p, q13: false })); }}
                leftLabel="전혀 없어요"
                rightLabel="무조건 추천해요"
              />
              {errors.q13 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q14">
              <QuestionLabel>Q14. 추천하거나 안 하는 이유를 알려주세요.<Optional /></QuestionLabel>
              <TextArea value={answers.q14} onChange={v => set('q14', v)} placeholder="이유를 자유롭게 적어주세요" />
            </div>
          </Card>

          {/* ── 섹션 5: 마지막 ── */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="💬" title="마지막" />
          </div>

          <Card>
            <div id="q15">
              <QuestionLabel>
                Q15. 앞으로 유료 멤버십이 생긴다면, 광고 제거 + 추가 기능 기준으로<br />
                어느 정도 금액이 적당할 것 같으신가요?<Required />
              </QuestionLabel>
              <SingleSelect
                options={[
                  '무조건 무료만 쓸 것 같아요',
                  '월 3,000원 이하면 고려해볼게요',
                  '월 5,000~7,000원 정도면 적당해요',
                  '월 10,000원 이상도 괜찮아요',
                  '연간 결제라면 더 저렴하면 고려해볼게요',
                ]}
                value={answers.q15}
                onChange={v => { set('q15', v); setErrors(p => ({ ...p, q15: false })); }}
              />
              {errors.q15 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q16">
              <QuestionLabel>Q16. 베타 테스터로 계속 참여하고 싶으시다면 이메일을 남겨주세요.<Optional /></QuestionLabel>
              <input
                type="email"
                value={answers.q16}
                onChange={e => set('q16', e.target.value)}
                placeholder="example@email.com"
                style={{
                  width: '100%', background: 'var(--c-input)', border: '1px solid var(--c-border3)',
                  borderRadius: 8, padding: '10px 12px', color: 'var(--c-text)', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
          </Card>

          {/* 에러 요약 */}
          {Object.values(errors).some(Boolean) && (
            <div style={{
              background: '#2a0f0f', border: '1px solid var(--c-error)', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16, color: 'var(--c-error)', fontSize: 13,
            }}>
              필수 항목을 모두 입력해주세요.
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%', padding: '15px 0', borderRadius: 10, border: 'none',
              background: 'var(--c-accent)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--c-accent-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--c-accent)'}
          >
            설문 제출하기
          </button>
        </form>
      </div>
    </div>
  );
}
