/**
 * SurveyPage — 테스터 설문 페이지
 * 접근: https://scenario-876h.vercel.app/#survey
 */
import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const FEATURES = [
  { id: 'script',        label: '대본 쓰기',             desc: '씬 헤딩·지문·대사 입력, 단축키 편집' },
  { id: 'scenelist',     label: '씬리스트',               desc: '씬 목록 관리, 가로/세로 뷰' },
  { id: 'treatment',     label: '트리트먼트',             desc: '회차별 줄거리·장면 정리' },
  { id: 'cover',         label: '표지 편집',              desc: '작품명·작가명·형식 등 표지 구성' },
  { id: 'synopsis',      label: '시놉시스',               desc: '기획의도·줄거리·주제 정리' },
  { id: 'characters',    label: '인물 관리',              desc: '등장인물 목록·정보 입력' },
  { id: 'relationships', label: '인물 관계도',            desc: '인물 간 관계 시각화' },
  { id: 'biography',     label: '인물 전기',              desc: '주요 인물 서사·배경 정리' },
  { id: 'resources',     label: '자료 수집',              desc: '메모·이미지 카드 형식으로 자료 정리' },
  { id: 'structure',     label: '구조 점검',              desc: '분량·페이지 예측, 막 구조 분석' },
  { id: 'print',         label: '출력 (PDF/DOCX/HWPX)',  desc: '대본 인쇄 형식으로 내보내기' },
  { id: 'drive',         label: '구글 드라이브 자동저장', desc: '로그인 후 Drive에 자동 백업' },
  { id: 'reviewlink',    label: '검토 링크 공유',         desc: '링크로 타인에게 대본 공유' },
];

const ROLES = ['극작가 지망생', '현역 작가', '프로듀서 / 조연출', '방송국 / 제작사 관계자', '기타'];
const EXPERIENCES = ['없음 (처음)', '1년 미만', '1~3년', '3년 이상'];

function StarRating({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const labels = ['', '별로예요', '아쉬워요', '보통이에요', '좋아요', '완전 좋아요'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n} type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            fontSize: 22, color: (hover || value) >= n ? '#f59e0b' : '#374151',
            transition: 'color 0.1s',
          }}
        >★</button>
      ))}
      {value > 0 && (
        <span style={{ fontSize: 12, color: '#6b7280', marginLeft: 6 }}>
          {labels[value]}
        </span>
      )}
    </div>
  );
}

function ChipGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => (
        <button
          key={opt} type="button" onClick={() => onChange(opt)}
          style={{
            padding: '7px 14px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
            border: value === opt ? '2px solid #6366f1' : '1px solid #334155',
            background: value === opt ? '#1e1b4b' : '#111827',
            color: value === opt ? '#a5b4fc' : '#9ca3af',
            fontWeight: value === opt ? 600 : 400,
            transition: 'all 0.15s',
          }}
        >{opt}</button>
      ))}
    </div>
  );
}

export default function SurveyPage() {
  const [role, setRole] = useState('');
  const [experience, setExperience] = useState('');
  const [features, setFeatures] = useState(() =>
    Object.fromEntries(FEATURES.map(f => [f.id, { used: null, rating: 0 }]))
  );
  const [overallRating, setOverallRating] = useState(0);
  const [bestFeature, setBestFeature] = useState('');
  const [worstFeature, setWorstFeature] = useState('');
  const [wantedFeature, setWantedFeature] = useState('');
  const [freeOpinion, setFreeOpinion] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const setFeatureUsed = (id, val) =>
    setFeatures(prev => ({ ...prev, [id]: { ...prev[id], used: val, rating: val ? prev[id].rating : 0 } }));

  const setFeatureRating = (id, val) =>
    setFeatures(prev => ({ ...prev, [id]: { ...prev[id], rating: val } }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!role) { setError('역할을 선택해주세요.'); return; }
    if (!experience) { setError('경력을 선택해주세요.'); return; }
    if (overallRating === 0) { setError('전체 만족도를 선택해주세요.'); return; }
    setError('');
    setSubmitting(true);
    try {
      const { error: sbErr } = await supabase.from('survey_responses').insert({
        role,
        experience,
        features,
        overall_rating: overallRating,
        best_feature: bestFeature,
        worst_feature: worstFeature,
        wanted_feature: wantedFeature,
        free_opinion: freeOpinion,
      });
      if (sbErr) throw new Error(sbErr.message);
      setSubmitted(true);
    } catch (err) {
      setError('제출 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0f172a', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 24,
      }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
            설문 완료!
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.8 }}>
            소중한 의견 감사합니다.<br />
            여러분의 피드백으로 대본 작업실이 더 좋아집니다.
          </p>
        </div>
      </div>
    );
  }

  const fieldStyle = {
    width: '100%', background: '#0f172a', border: '1px solid #334155',
    borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 14,
    resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  const sectionStyle = {
    background: '#1e293b', border: '1px solid #334155', borderRadius: 12,
    padding: '28px 24px', marginBottom: 16,
  };

  const sectionTitleStyle = {
    fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 24,
    display: 'flex', alignItems: 'center', gap: 10,
  };

  const badgeStyle = {
    background: '#6366f1', color: '#fff', borderRadius: '50%',
    width: 24, height: 24, display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '48px 16px 80px' }}>
      <div style={{ maxWidth: 660, margin: '0 auto' }}>

        {/* 헤더 */}
        <div style={{ marginBottom: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
            대본 작업실 MVP 테스트
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f1f5f9', margin: '0 0 12px' }}>
            사용 경험 설문
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.8, margin: 0 }}>
            어떤 기능을 쓰셨나요? 솔직한 답변이 큰 도움이 됩니다. (약 5분 소요)
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* 섹션 1: 응답자 정보 */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>
              <span style={badgeStyle}>1</span>
              응답자 정보
            </h2>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>직업 / 역할</div>
              <ChipGroup options={ROLES} value={role} onChange={setRole} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>드라마 집필 경력</div>
              <ChipGroup options={EXPERIENCES} value={experience} onChange={setExperience} />
            </div>
          </div>

          {/* 섹션 2: 기능별 사용 여부 & 만족도 */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>
              <span style={badgeStyle}>2</span>
              기능별 사용 경험
            </h2>
            <p style={{ fontSize: 13, color: '#475569', marginBottom: 20, marginTop: -12, marginLeft: 34 }}>
              각 기능을 사용해보셨나요? 사용했다면 만족도도 알려주세요.
            </p>

            {FEATURES.map((f, i) => (
              <div key={f.id} style={{ padding: '16px 0', borderTop: i > 0 ? '1px solid #0f172a' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#cbd5e1', marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>{f.desc}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {[{ val: true, label: '사용함' }, { val: false, label: '안 씀' }].map(({ val, label }) => (
                      <button
                        key={label} type="button"
                        onClick={() => setFeatureUsed(f.id, val)}
                        style={{
                          padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                          border: features[f.id].used === val ? '2px solid #6366f1' : '1px solid #334155',
                          background: features[f.id].used === val ? '#1e1b4b' : '#0f172a',
                          color: features[f.id].used === val ? '#a5b4fc' : '#475569',
                          fontWeight: features[f.id].used === val ? 600 : 400,
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                {features[f.id].used === true && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: '#475569', marginBottom: 6 }}>만족도</div>
                    <StarRating value={features[f.id].rating} onChange={v => setFeatureRating(f.id, v)} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 섹션 3: 전체 평가 */}
          <div style={sectionStyle}>
            <h2 style={sectionTitleStyle}>
              <span style={badgeStyle}>3</span>
              전체 평가
            </h2>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 10 }}>
                전체 만족도 <span style={{ color: '#f87171' }}>*</span>
              </div>
              <StarRating value={overallRating} onChange={setOverallRating} />
            </div>

            {[
              { label: '가장 유용했던 기능은?', placeholder: '예: 씬리스트, 대본 쓰기…', val: bestFeature, set: setBestFeature },
              { label: '가장 불편하거나 아쉬웠던 점은?', placeholder: '예: 저장이 느림, UI가 복잡함…', val: worstFeature, set: setWorstFeature },
              { label: '추가로 원하는 기능이 있다면?', placeholder: '예: 공동 작업, 모바일 앱…', val: wantedFeature, set: setWantedFeature },
              { label: '기타 자유 의견', placeholder: '무엇이든 편하게 적어주세요.', val: freeOpinion, set: setFreeOpinion },
            ].map(({ label, placeholder, val, set }) => (
              <div key={label} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>{label}</div>
                <textarea
                  value={val} onChange={e => set(e.target.value)}
                  placeholder={placeholder} rows={3}
                  style={fieldStyle}
                />
              </div>
            ))}
          </div>

          {error && (
            <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>{error}</div>
          )}

          <button
            type="submit" disabled={submitting}
            style={{
              width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
              background: submitting ? '#334155' : '#6366f1', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
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
