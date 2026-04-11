/**
 * SurveyPage — 대본 작업실 베타 테스트 설문
 * 접근: /#survey
 * DB: supabase > survey_responses
 */
import React, { useState, useEffect } from 'react';
import { supabase } from '../store/supabaseClient';

// ─── 전역 overflow:hidden 해제 ────────────────────────────────────────────────
function usePageScroll() {
  useEffect(() => {
    const root = document.getElementById('root');
    const prev = {
      htmlOverflow: document.documentElement.style.overflow,
      htmlHeight:   document.documentElement.style.height,
      bodyOverflow: document.body.style.overflow,
      bodyHeight:   document.body.style.height,
      rootOverflow: root ? root.style.overflow : '',
      rootHeight:   root ? root.style.height   : '',
    };
    document.documentElement.style.overflow = 'auto';
    document.documentElement.style.height   = 'auto';
    document.body.style.overflow = 'auto';
    document.body.style.height   = 'auto';
    if (root) { root.style.overflow = 'auto'; root.style.height = 'auto'; }
    return () => {
      document.documentElement.style.overflow = prev.htmlOverflow;
      document.documentElement.style.height   = prev.htmlHeight;
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.height   = prev.bodyHeight;
      if (root) { root.style.overflow = prev.rootOverflow; root.style.height = prev.rootHeight; }
    };
  }, []);
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const FEATURE_OPTIONS = [
  '대본 편집 (씬번호/지문/대사)',
  '씬번호 자동 연동',
  '태그 기능',
  '시놉시스 편집',
  '인물 관리',
  '인물이력서',
  '트리트먼트',
  '씬리스트',
  '구조 - 씬보드/지문별/인물별',
  '출력 (PDF/DOCX/HWPX)',
  '검토 링크 공유',
];

const Q11_OPTIONS = [
  { id: 'emotion', label: '감정 태그',  desc: '씬/지문/대사에 감정을 태그하고 흐름 시각화' },
  { id: 'search',  label: '씬 검색',    desc: '키워드로 씬 빠르게 찾기' },
];

const Q16_FREE_GROUPS = [
  {
    label: '기본 기능',
    items: ['대본 편집 (씬번호/지문/대사/단축키)', '씬번호 자동 연동', '자동저장'],
  },
  {
    label: '작업 보조',
    items: ['시놉시스 편집', '인물 관리 (인물 현황)', '트리트먼트 작성', '씬리스트 자동 생성', '자료수집 페이지'],
  },
  {
    label: '출력 / 공유',
    items: ['PDF 출력', 'DOCX/HWPX 출력', '검토 링크 공유'],
  },
];

const Q16_PAID_ITEMS = [
  '인물이력서',
  '구조 페이지 (씬보드/지문별/인물별)',
  '감정 태그 & 감정 흐름 시각화',
  '씬보드 드래그 편집',
  '각종 분석 페이지 (대사량/등장 비중 등)',
  '구글 드라이브 자동 백업',
  '검토 링크 공유 고도화',
  '추후 추가 기능 우선 제공',
  '광고 없음',
];

// ─── 공용 스타일 ──────────────────────────────────────────────────────────────

const inlineInputStyle = {
  background: 'var(--c-input)', border: '1px solid var(--c-border3)',
  borderRadius: 6, padding: '4px 10px', fontSize: 13, color: 'var(--c-text)',
  outline: 'none', flex: 1,
};

// ─── UI 컴포넌트 ──────────────────────────────────────────────────────────────

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

const errMsg = <div style={{ color: 'var(--c-error)', fontSize: 12, marginTop: 8 }}>필수 항목입니다.</div>;

// 라디오 단일 선택
function SingleSelect({ name, options, value, onChange, allowOther }) {
  const [otherText, setOtherText] = useState('');
  const isOther = value.startsWith('__other__');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio" name={name}
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
            type="radio" name={name}
            checked={isOther}
            onChange={() => onChange('__other__:' + otherText)}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>기타</span>
          {isOther && (
            <input
              type="text" value={otherText}
              onChange={e => { setOtherText(e.target.value); onChange('__other__:' + e.target.value); }}
              placeholder="직접 입력"
              style={inlineInputStyle}
            />
          )}
        </label>
      )}
    </div>
  );
}

// 체크박스 복수 선택
function MultiSelect({ options, value, onChange, allowOther }) {
  const [otherText, setOtherText] = useState('');
  const toggle = (opt) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  const otherEntry = value.find(v => v.startsWith('__other__:'));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {options.map(opt => (
        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>{opt}</span>
        </label>
      ))}
      {allowOther && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox" checked={!!otherEntry}
            onChange={() => {
              if (otherEntry) onChange(value.filter(v => !v.startsWith('__other__:')));
              else onChange([...value, '__other__:']);
            }}
            style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>기타</span>
          {otherEntry && (
            <input
              type="text" value={otherText}
              onChange={e => {
                setOtherText(e.target.value);
                onChange([...value.filter(v => !v.startsWith('__other__:')), '__other__:' + e.target.value]);
              }}
              placeholder="직접 입력"
              style={inlineInputStyle}
            />
          )}
        </label>
      )}
    </div>
  );
}

// 10점 척도
function ScaleRating({ value, onChange, leftLabel, rightLabel }) {
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button
            key={n} type="button" onClick={() => onChange(n)}
            style={{
              width: 40, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: value === n ? 'var(--c-accent)' : 'var(--c-input)',
              color: value === n ? '#fff' : 'var(--c-text3)',
              fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
            }}
          >{n}</button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text4)' }}>
        <span>{leftLabel}</span><span>{rightLabel}</span>
      </div>
    </div>
  );
}

function TextArea({ value, onChange, placeholder, rows = 3 }) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder || '자유롭게 입력해주세요'}
      rows={rows}
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
  const filled = [
    answers.q1, answers.q2.length > 0, answers.q3.length > 0, answers.q4,
    answers.q5, answers.q6.length > 0, answers.q7, answers.q8,
    answers.q9, answers.q10, answers.q11.length > 0, answers.q12,
    answers.q13, answers.q14, answers.q15, answers.q16.length > 0,
    answers.q17, answers.q18, answers.q19, answers.q20Email,
  ].filter(Boolean).length;
  const pct = Math.round((filled / 20) * 100);

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
  usePageScroll();

  const [answers, setAnswers] = useState({
    q1: '', q2: [], q3: [], q5: '', q6: '',
    q7: 0, q8: '', q9: '', q9Detail: '', q10: '', q10Detail: '',
    q11: [], q11Other: '', q12: '', q13: '', q14: 0, q15: '',
    q16: [], q17: '', q18: '', q19: '', q20Email: '',
  });
  const [errors, setErrors]       = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const set = (key, val) => setAnswers(prev => ({ ...prev, [key]: val }));
  const clearErr = (...keys) => setErrors(prev => {
    const next = { ...prev };
    keys.forEach(k => delete next[k]);
    return next;
  });

  const skipQ18Q19 = answers.q17 === '사용하지 않을 것 같아요';

  // ── 유효성 검사 ──
  const validate = () => {
    const e = {};
    if (!answers.q1)         e.q1  = true;
    if (!answers.q2.length)  e.q2  = true;
    if (!answers.q3.length)  e.q3  = true;
    if (!answers.q7)         e.q7  = true;
    if (!answers.q9)         e.q9  = true;
    if (!answers.q10)        e.q10 = true;
    if (!answers.q14)        e.q14 = true;
    if (!answers.q17)        e.q17 = true;
    return e;
  };

  // ── 제출 ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = Object.keys(errs)[0];
      document.getElementById(firstKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (supabase) {
        const { error } = await supabase.from('survey_responses').insert([{
          q1:         answers.q1,
          q2:         answers.q2,
          q3:         answers.q3,
          q5:         answers.q5   || null,
          q6:         answers.q6   || null,
          q7:         answers.q7,
          q8:         answers.q8   || null,
          q9:         answers.q9,
          q9_detail:  answers.q9Detail  || null,
          q10:        answers.q10,
          q10_detail: answers.q10Detail || null,
          q11:        answers.q11,
          q11_other:  answers.q11Other  || null,
          q12:        answers.q12  || null,
          q13:        answers.q13  || null,
          q14:        answers.q14,
          q15:        answers.q15  || null,
          q16:        answers.q16,
          q17:        answers.q17,
          q18:        skipQ18Q19 ? null : (answers.q18 || null),
          q19:        skipQ18Q19 ? null : (answers.q19 || null),
          q20_email:  answers.q20Email || null,
        }]);
        if (error) throw error;
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('[Survey] 제출 오류:', err);
      setSubmitError('제출 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 완료 화면 ──
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

  // ── 본문 ──
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
            약 5~10분 소요됩니다.
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* ══════════════════════════════════════════
              섹션 1: 기본 정보
          ══════════════════════════════════════════ */}
          <SectionHeader emoji="📝" title="기본 정보" />

          <Card>
            <div id="q1">
              <QuestionLabel>Q1. 주로 어떤 글을 쓰시나요?<Required /></QuestionLabel>
              <SingleSelect
                name="q1"
                options={['드라마 대본', '영화 시나리오', '웹드라마/숏폼']}
                value={answers.q1}
                onChange={v => { set('q1', v); clearErr('q1'); }}
                allowOther
              />
              {errors.q1 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q2">
              <QuestionLabel>
                Q2. 평소 대본 작업에 주로 사용하는 툴은?<Required />
                <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12, marginLeft: 4 }}>(복수 선택)</span>
              </QuestionLabel>
              <MultiSelect
                options={['한글(HWP)', '워드', '파이널 드래프트', '스크리브너', '씨네한글', '그냥 메모장/구글독스']}
                value={answers.q2}
                onChange={v => { set('q2', v); clearErr('q2'); }}
                allowOther
              />
              {errors.q2 && errMsg}
            </div>
          </Card>

          {/* ══════════════════════════════════════════
              섹션 2: 기능 평가
          ══════════════════════════════════════════ */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="⭐" title="기능 평가" />
          </div>

          <Card>
            <div id="q3">
              <QuestionLabel>
                Q3. 아래 기능 중 실제로 사용해본 것을 모두 골라주세요.<Required />
                <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12, marginLeft: 4 }}>(복수 선택)</span>
              </QuestionLabel>
              <MultiSelect
                options={FEATURE_OPTIONS}
                value={answers.q3}
                onChange={v => { set('q3', v); set('q4', ''); clearErr('q3', 'q4'); }}
              />
              {errors.q3 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q5">
              <QuestionLabel>Q4. 좋았던 기능과 그 기능이 좋았던 이유를 알려주세요.<Optional /></QuestionLabel>
              <TextArea value={answers.q5} onChange={v => set('q5', v)} placeholder="예) 씬리스트가 자동으로 정리돼서 편했어요" />
            </div>
          </Card>

          <Card>
            <div id="q6">
              <QuestionLabel>Q5. 손이 안 갔던 기능과 그 이유를 알려주세요.<Optional /></QuestionLabel>
              <TextArea value={answers.q6} onChange={v => set('q6', v)} placeholder="예) 인물이력서는 어떻게 쓰는지 몰라서 안 썼어요" />
            </div>
          </Card>

          {/* ══════════════════════════════════════════
              섹션 3: 사용 경험
          ══════════════════════════════════════════ */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="🖥️" title="사용 경험" />
          </div>

          <Card>
            <div id="q7">
              <QuestionLabel>Q6. 전반적인 사용 난이도는?<Required /></QuestionLabel>
              <ScaleRating
                value={answers.q7}
                onChange={v => { set('q7', v); clearErr('q7'); }}
                leftLabel="아주 어려웠어요"
                rightLabel="아주 쉬웠어요"
              />
              {errors.q7 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q8">
              <QuestionLabel>Q7. 특별히 어렵거나 헷갈렸던 부분이 있었나요?<Optional /></QuestionLabel>
              <TextArea value={answers.q8} onChange={v => set('q8', v)} placeholder="어떤 부분이 헷갈리셨나요?" />
            </div>
          </Card>

          <Card>
            <div id="q9">
              <QuestionLabel>Q8. 모바일/태블릿에서도 사용해보셨나요?<Required /></QuestionLabel>
              <SingleSelect
                name="q9"
                options={['네, 편했어요', '네, 불편했어요', '아직 PC로만 써봤어요']}
                value={answers.q9}
                onChange={v => { set('q9', v); set('q9Detail', ''); clearErr('q9'); }}
              />
              {/* 조건부: 불편했어요 선택 시 추가 입력 */}
              {answers.q9 === '네, 불편했어요' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 6 }}>어떤 점이 불편하셨나요?</div>
                  <TextArea value={answers.q9Detail} onChange={v => set('q9Detail', v)} placeholder="불편했던 점을 알려주세요" />
                </div>
              )}
              {errors.q9 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q10">
              <QuestionLabel>Q9. 출력(PDF/DOCX/HWPX) 기능을 사용해보셨나요?<Required /></QuestionLabel>
              <SingleSelect
                name="q10"
                options={['네, 잘 됐어요', '네, 문제가 있었어요', '아직 안 써봤어요']}
                value={answers.q10}
                onChange={v => { set('q10', v); set('q10Detail', ''); clearErr('q10'); }}
              />
              {/* 조건부: 문제가 있었어요 선택 시 추가 입력 */}
              {answers.q10 === '네, 문제가 있었어요' && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, color: 'var(--c-text3)', marginBottom: 6 }}>어떤 문제가 있었나요?</div>
                  <TextArea value={answers.q10Detail} onChange={v => set('q10Detail', v)} placeholder="문제 상황을 알려주세요" />
                </div>
              )}
              {errors.q10 && errMsg}
            </div>
          </Card>

          {/* ══════════════════════════════════════════
              섹션 4: 개선 요청
          ══════════════════════════════════════════ */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="🔧" title="개선 요청" />
          </div>

          <Card>
            <div id="q11">
              <QuestionLabel>
                Q10. 추후 업데이트 예정 기능 중 기대되는 것을 골라주세요!<Optional />
                <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12, marginLeft: 4 }}>(복수 선택)</span>
              </QuestionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Q11_OPTIONS.map(({ id, label, desc }) => (
                  <label key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={answers.q11.includes(label)}
                      onChange={() => {
                        const next = answers.q11.includes(label)
                          ? answers.q11.filter(v => v !== label)
                          : [...answers.q11, label];
                        set('q11', next);
                      }}
                      style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0, marginTop: 2 }}
                    />
                    <div>
                      <span style={{ fontSize: 14, color: 'var(--c-text2)', fontWeight: 500 }}>{label}</span>
                      <span style={{ fontSize: 13, color: 'var(--c-text4)', marginLeft: 6 }}>({desc})</span>
                    </div>
                  </label>
                ))}

                {/* Q11 기타 — 조건부 입력창 */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={answers.q11.includes('__other__')}
                    onChange={() => {
                      const checked = answers.q11.includes('__other__');
                      set('q11', checked ? answers.q11.filter(v => v !== '__other__') : [...answers.q11, '__other__']);
                      if (checked) set('q11Other', '');
                    }}
                    style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, color: 'var(--c-text2)', fontWeight: 500 }}>기타, 이런 기능이 생겼으면 해요</span>
                    {answers.q11.includes('__other__') && (
                      <input
                        type="text"
                        value={answers.q11Other}
                        onChange={e => set('q11Other', e.target.value)}
                        placeholder="원하는 기능을 자유롭게 적어주세요"
                        style={{
                          display: 'block', marginTop: 8, width: '100%',
                          background: 'var(--c-input)', border: '1px solid var(--c-border3)',
                          borderRadius: 6, padding: '8px 12px', color: 'var(--c-text)', fontSize: 13,
                          outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>
          </Card>

          <Card>
            <div id="q12">
              <QuestionLabel>Q11. 꼭 추가됐으면 하는 기능이 있나요?<Optional /></QuestionLabel>
              <TextArea value={answers.q12} onChange={v => set('q12', v)} placeholder="원하는 기능을 자유롭게 적어주세요" />
            </div>
          </Card>

          <Card>
            <div id="q13">
              <QuestionLabel>Q12. 가장 불편했던 점은?<Optional /></QuestionLabel>
              <TextArea value={answers.q13} onChange={v => set('q13', v)} placeholder="불편했던 점을 솔직하게 알려주세요" />
            </div>
          </Card>

          <Card>
            <div id="q14">
              <QuestionLabel>Q13. 이 툴을 다른 작가에게 추천할 의향이 있나요?<Required /></QuestionLabel>
              <ScaleRating
                value={answers.q14}
                onChange={v => { set('q14', v); clearErr('q14'); }}
                leftLabel="전혀 없어요"
                rightLabel="무조건 추천해요"
              />
              {errors.q14 && errMsg}
            </div>
          </Card>

          <Card>
            <div id="q15">
              <QuestionLabel>Q14. 추천하거나 안 하는 이유를 알려주세요.<Optional /></QuestionLabel>
              <TextArea value={answers.q15} onChange={v => set('q15', v)} placeholder="이유를 자유롭게 적어주세요" />
            </div>
          </Card>

          {/* ══════════════════════════════════════════
              섹션 5: 유료 전환 의향
          ══════════════════════════════════════════ */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="💰" title="유료 전환 의향" />
          </div>

          <Card>
            <div id="q16">
              <QuestionLabel>
                Q15. 현재 무료로 제공되는 기능 중 "이것만으로도 충분하다"고 느끼는 기능을 모두 골라주세요.<Optional />
                <span style={{ fontWeight: 400, color: 'var(--c-text4)', fontSize: 12, marginLeft: 4 }}>(복수 선택)</span>
              </QuestionLabel>
              {Q16_FREE_GROUPS.map(group => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--c-accent)',
                    letterSpacing: 0.5, marginBottom: 10,
                  }}>{group.label}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {group.items.map(item => (
                      <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={answers.q16.includes(item)}
                          onChange={() => {
                            const next = answers.q16.includes(item)
                              ? answers.q16.filter(v => v !== item)
                              : [...answers.q16, item];
                            set('q16', next);
                          }}
                          style={{ accentColor: 'var(--c-accent)', width: 16, height: 16, flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 14, color: 'var(--c-text2)' }}>{item}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{
                marginTop: 8, padding: '10px 14px',
                background: 'var(--c-active)', borderRadius: 8,
                fontSize: 13, color: 'var(--c-text3)',
              }}>
                💡 선택하지 않은 기능은 유료 전환 시 참고할게요!
              </div>
            </div>
          </Card>

          {/* Q17: 유료 구독 의사 (구성 예시 포함) */}
          <Card>
            <div id="q17">
              {/* 구성 예시 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                marginBottom: 24, fontSize: 13,
              }}>
                <div style={{
                  background: 'var(--c-active)', borderRadius: 10, padding: '16px 14px',
                  border: '1px solid var(--c-border2)',
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--c-text)', marginBottom: 10, fontSize: 14 }}>무료</div>
                  {[
                    '대본 편집 전체',
                    '씬번호 자동 연동',
                    '자동저장',
                    '출력 (PDF/DOCX/HWPX)',
                    '씬리스트/시놉시스/트리트먼트',
                    '인물 관리 (인물 현황)',
                    '자료수집 페이지',
                  ].map(t => (
                    <div key={t} style={{ color: 'var(--c-text2)', marginBottom: 5 }}>✅ {t}</div>
                  ))}
                  <div style={{ color: 'var(--c-text4)', marginTop: 6 }}>🚫 하단 광고 있음</div>
                </div>
                <div style={{
                  background: 'var(--c-active)', borderRadius: 10, padding: '16px 14px',
                  border: '1px solid var(--c-accent)',
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--c-accent)', marginBottom: 10, fontSize: 14 }}>유료</div>
                  {Q16_PAID_ITEMS.map(t => (
                    <div key={t} style={{ color: 'var(--c-text2)', marginBottom: 5 }}>✅ {t}</div>
                  ))}
                </div>
              </div>

              <QuestionLabel>Q16. 사용해보신 결과 계속 사용하실 계획인가요?<Required /></QuestionLabel>
              <SingleSelect
                name="q17"
                options={[
                  '무료로 계속 사용할게요',
                  '유료가 된다면 결제할 의향이 있어요',
                  '아직 고민 중이에요',
                  '사용하지 않을 것 같아요',
                ]}
                value={answers.q17}
                onChange={v => {
                  set('q17', v);
                  if (v === '사용하지 않을 것 같아요') { set('q18', ''); set('q19', ''); }
                  clearErr('q17');
                }}
              />
              {errors.q17 && errMsg}
            </div>
          </Card>

          {/* Q18, Q19: "유료라면 안 쓸 것 같아요" 선택 시 건너뜀 */}
          {answers.q17 && !skipQ18Q19 && (
            <>
              <Card>
                <div id="q18">
                  <QuestionLabel>Q17. 유료라면 어떤 방식을 선호하시나요?<Optional /></QuestionLabel>
                  <SingleSelect
                    name="q18"
                    options={[
                      '월 구독 (매달 결제)',
                      '연 구독 (1년치 한번에, 할인 적용)',
                      '크라우드펀딩 참여 (와디즈 같은 방식)',
                      '앱 유료 구매 (일회성)',
                    ]}
                    value={answers.q18}
                    onChange={v => set('q18', v)}
                    allowOther
                  />
                </div>
              </Card>

              <Card>
                <div id="q19">
                  <QuestionLabel>Q18. 광고 없는 버전을 위해 낼 수 있는 금액은?<Optional /></QuestionLabel>
                  <SingleSelect
                    name="q19"
                    options={[
                      '월 3,000원 이하',
                      '월 5,000~7,000원',
                      '월 10,000원 이상',
                      '연 30,000~49,000원 (월 환산 시 더 저렴)',
                      '연 50,000원 이상도 괜찮아요',
                    ]}
                    value={answers.q19}
                    onChange={v => set('q19', v)}
                  />
                </div>
              </Card>
            </>
          )}

          {/* ══════════════════════════════════════════
              섹션 6: 마지막
          ══════════════════════════════════════════ */}
          <div style={{ marginTop: 36 }}>
            <SectionHeader emoji="💬" title="마지막" />
          </div>

          <Card>
            <div id="q20Email">
              <QuestionLabel>
                Q19. 이메일을 남겨주시면 추후 업데이트 소식을 전해드릴게요.<Optional />
              </QuestionLabel>
              <input
                type="email"
                value={answers.q20Email}
                onChange={e => set('q20Email', e.target.value)}
                placeholder="example@email.com"
                style={{
                  width: '100%', background: 'var(--c-input)', border: '1px solid var(--c-border3)',
                  borderRadius: 8, padding: '10px 12px', color: 'var(--c-text)', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--c-text4)', lineHeight: 1.6 }}>
                💌 정식 출시 소식을 전해드립니다.
              </div>
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

          {submitError && (
            <div style={{
              background: '#2a0f0f', border: '1px solid var(--c-error)', borderRadius: 8,
              padding: '12px 16px', marginBottom: 16, color: 'var(--c-error)', fontSize: 13,
            }}>
              {submitError}
            </div>
          )}

          <p style={{
            fontSize: 12, color: '#888', textAlign: 'center',
            lineHeight: 1.7, marginBottom: 16,
          }}>
            응답하신 내용은 안전한 데이터베이스에 암호화되어 저장되며, 서비스 개선 목적으로만 활용됩니다.{' '}
            이메일을 남기신 경우 오류 답변 및 베타 테스터 안내 외의 용도로는 사용되지 않습니다.
            <br /><br />
            개인정보 관련 문의:{' '}
            <a href="mailto:daejak.official@gmail.com" style={{ color: '#888', textDecoration: 'underline' }}>
              daejak.official@gmail.com
            </a>
            {'  '}
            스레드:{' '}
            <a href="https://www.threads.net/@edam_essay" target="_blank" rel="noopener noreferrer" style={{ color: '#888', textDecoration: 'underline' }}>
              @edam_essay
            </a>
          </p>

          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 10, border: 'none',
              background: submitting ? 'var(--c-border2)' : 'var(--c-accent)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {submitting ? '제출 중...' : '설문 제출하기'}
          </button>

        </form>
      </div>
    </div>
  );
}
