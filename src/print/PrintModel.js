/**
 * PrintModel — renderer-agnostic document model.
 *
 * buildPrintModel(appState, selections, preset) → PrintDocument
 *
 * PrintDocument = {
 *   sections: PrintSection[],
 *   preset: StylePreset,
 *   projectTitle: string,
 * }
 *
 * PrintSection:
 *   { type:'cover',     title, fields:[{label,value}] }
 *   { type:'synopsis',  genre, theme, intent, story, characters:[...] }
 *   { type:'episode',   episodeId, episodeNumber, episodeTitle, blocks:[PrintBlock] }
 *   { type:'characters', characters:[...] }
 *
 * PrintBlock:
 *   { id, type, label, content, charName, sceneId }
 */

import { resolveSceneLabel, SCENE_PREFIX_STRIP_RE } from '../utils/sceneResolver';

// ─── Character field compat helpers (new model: surname/givenName/occupation/intro)
function charFullName(c) {
  if (c.surname || c.givenName) return [c.surname, c.givenName].filter(Boolean).join('');
  return c.name || '';
}
function charOccupation(c) { return c.occupation ?? c.job ?? ''; }
function charIntro(c) { return c.intro ?? c.description ?? ''; }

// ─── Resolve character name (givenName-first, then name fallback)
function resolveCharName(block, characters) {
  if (block.characterId) {
    const c = characters.find(c => c.id === block.characterId);
    if (c) return c.givenName || c.name || '';
  }
  return block.characterName || block.charName || '';
}

// ─── Normalize a single script block for print
function stripLiteralTags(str) {
  return (str || '')
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')            // &lt;br&gt; → 줄바꿈
    .replace(/<br\s*\/?>/gi, '\n')                   // <br> → 줄바꿈
    .replace(/<(p|div|li|h[1-6])[^>]*>/gi, '\n')    // 블록 열림 태그 → 줄바꿈 (Chrome 엔터 = <div> 래핑)
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '')       // 블록 닫힘 태그 → 그냥 제거 (열림에서 이미 \n 처리)
    .replace(/&lt;[^&]*&gt;/g, '')                   // 나머지 엔티티 태그 제거
    .replace(/<[^>]+>/g, '')                         // 나머지 실제 태그 제거
    .replace(/\n{3,}/g, '\n\n')                     // 연속 3개 이상 줄바꿈 → 2개로 압축
    .replace(/^\n+/, '')                             // 선행 줄바꿈 제거 (<div>로 시작하는 경우)
    .trimEnd();                                      // 끝 빈 줄 제거
}

// action/dialogue/parenthetical 전용: <b>/<i>/<u>/<s> 인라인 서식 태그는 보존하고 나머지만 제거
function stripDisallowedTags(str) {
  return (str || '')
    .replace(/&lt;br\s*\/?&gt;/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(p|div|li|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '')
    .replace(/&lt;[^&]*&gt;/g, '')
    .replace(/<(?!\/?(?:b|i|u|s|strong|em)\b)[^>]+>/gi, '')  // b/i/u/s/strong/em 제외하고 제거
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trimEnd();
}

function normalizeBlock(block, characters) {
  const charName = resolveCharName(block, characters);
  const richTypes = new Set(['action', 'dialogue', 'parenthetical']);
  let content = richTypes.has(block.type)
    ? stripDisallowedTags(block.content || '')
    : stripLiteralTags(block.content || '');
  // scene_number: content에 라벨 prefix(S#n.) 포함된 경우 제거 (에디터 저장 방식 혼용 대응)
  if (block.type === 'scene_number') {
    // resolveSceneLabel로 유저 포맷 재조합 후 label prefix 제거 → body만 추출
    const full = resolveSceneLabel({ ...block, label: '' });
    content = full || content.replace(SCENE_PREFIX_STRIP_RE, '');
  }
  // Migration: old badge-span format stored charName at start of content
  if (block.type === 'dialogue' && charName && content.startsWith(charName)) {
    content = content.slice(charName.length).trimStart();
  }
  return {
    id:         block.id,
    type:       block.type,
    label:      stripLiteralTags(block.label || ''),
    content,
    charName,
    alignment:  block.alignment || undefined,
    sceneId:    block.sceneId,
    refSceneId: block.refSceneId || '',
  };
}

// ─── Main builder
export function buildPrintModel(appState, selections, preset) {
  const { projects, episodes, scriptBlocks, characters, coverDocs, synopsisDocs, scenes, activeProjectId } = appState;

  const project    = projects.find(p => p.id === activeProjectId);
  const coverDoc   = coverDocs.find(d => d.projectId === activeProjectId);
  const synopsisDoc = synopsisDocs.find(d => d.projectId === activeProjectId);
  const projectChars = characters.filter(c => c.projectId === activeProjectId);

  const sections = [];

  // ── 1. Cover (no page numbers)
  if (selections.cover && coverDoc) {
    const fixedFields  = (coverDoc.fields       || []).filter(f => f.id !== 'title' && f.value);
    const customFields = (coverDoc.customFields  || []).filter(f => f.value);
    sections.push({
      type:   'cover',
      title:  coverDoc.title || project?.title || '',
      fields: [...fixedFields, ...customFields].map(f => ({ id: f.id, label: f.label, value: stripLiteralTags(f.value) })),
    });
  }

  // ── 2. Synopsis (page numbers reset per section)
  if (selections.synopsis && synopsisDoc) {
    const s = synopsisDoc;
    const st = (v) => stripLiteralTags(v || '');
    sections.push({
      type:       'synopsis',
      genre:      st(s.genre),
      theme:      st(s.theme),
      intent:     st(s.intent),
      story:      st(s.story || s.content),
      characters: projectChars.map(c => ({
        id:          c.id,
        name:        st(charFullName(c)),
        gender:      st(c.gender),
        age:         st(c.age),
        job:         st(charOccupation(c)),
        role:        c.role,
        description: st(charIntro(c)),
      })),
    });
  }

  // ── 3. Episode scripts (each episode resets page counter)
  const allEpisodes = episodes
    .filter(e => e.projectId === activeProjectId)
    .sort((a, b) => a.number - b.number);

  allEpisodes.forEach(ep => {
    if (!selections.episodes?.[ep.id]) return;
    const blocks = scriptBlocks
      .filter(b => b.episodeId === ep.id)
      .map(b => normalizeBlock(b, characters));
    sections.push({
      type:          'episode',
      episodeId:     ep.id,
      episodeNumber: ep.number,
      episodeTitle:  ep.title || '',
      blocks,
    });
  });

  // ── 4. Characters reference
  if (selections.chars) {
    // 다중 역할 라벨 매핑 (옛 단일 키도 호환).
    const roleLabel = {
      // 주인공 계열
      protagonist: '주인공', hero: '히어로', antihero: '안티히어로',
      anti_protagonist: '반주인공', deuteragonist: '공동주인공',
      narrator_observer: '관찰자 화자', growth_protagonist: '성장형 주인공',
      tragic_protagonist: '비극적 주인공',
      // 대립
      antagonist: '적대자', villain: '빌런', rival: '라이벌', competitor: '경쟁자',
      mastermind: '흑막', final_boss: '최종보스', traitor: '배신자',
      internal_enemy: '내부 적', false_ally: '거짓 조력자', foil: '반동인물',
      // 조력
      ally: '조력자', mentor: '멘토', teacher: '스승', partner: '파트너',
      companion: '동료', sidekick: '사이드킥', patron: '후원자', savior: '구원자',
      informant: '정보 제공자', mediator: '중재자',
      // 감정·관계
      love: '러브인터레스트', family_protector: '가족 보호자', protectee: '보호 대상',
      victim: '희생자', revenge_target: '복수 대상', salvation_target: '구원 대상',
      friend: '친구', crush: '썸 상대', ex_lover: '전 연인', destined: '운명적 상대',
      family: '가족',
      // 사건 유발
      inciter: '촉발자', client: '의뢰인', messenger: '메신저',
      event_provider: '사건 제공자', scapegoat: '희생양', survivor: '생존자',
      // 긴장
      troublemaker: '트러블메이커', obstructor: '방해자', tempter: '유혹자',
      instigator: '선동가', watcher: '감시자', judge: '심판자', negotiator: '협상자',
      // 세계관
      explainer: '해설자', narrator: '화자', observer: '관찰자',
      guide: '안내자', briefer: '정보 브리핑',
      // 기타
      comic: '감초', other: '기타',
      // 옛 데이터
      lead: '주인공', support: '기타', extra: '기타',
    };

    // 카테고리 우선 정렬 (주인공 → 대립 → 조력 → 감정관계 → 사건 → 긴장 → 세계관 → 기타)
    const categoryOrder = {
      protagonist: 0, hero: 0, antihero: 0, anti_protagonist: 0, deuteragonist: 0,
      narrator_observer: 0, growth_protagonist: 0, tragic_protagonist: 0,
      antagonist: 1, villain: 1, rival: 1, competitor: 1, mastermind: 1,
      final_boss: 1, traitor: 1, internal_enemy: 1, false_ally: 1, foil: 1,
      ally: 2, mentor: 2, teacher: 2, partner: 2, companion: 2, sidekick: 2,
      patron: 2, savior: 2, informant: 2, mediator: 2,
      love: 3, family_protector: 3, protectee: 3, victim: 3, revenge_target: 3,
      salvation_target: 3, friend: 3, crush: 3, ex_lover: 3, destined: 3, family: 3,
      inciter: 4, client: 4, messenger: 4, event_provider: 4, scapegoat: 4, survivor: 4,
      troublemaker: 5, obstructor: 5, tempter: 5, instigator: 5, watcher: 5,
      judge: 5, negotiator: 5,
      explainer: 6, narrator: 6, observer: 6, guide: 6, briefer: 6,
      comic: 7, other: 7,
      lead: 0, support: 7, extra: 7,
    };
    const charPrimaryRole = (c) => {
      const rs = Array.isArray(c.roles) && c.roles.length ? c.roles : (c.role ? [c.role] : []);
      return rs[0] || '';
    };
    const sorted = [...projectChars].sort((a, b) =>
      (categoryOrder[charPrimaryRole(a)] ?? 99) - (categoryOrder[charPrimaryRole(b)] ?? 99)
    );
    if (sorted.length) {
      sections.push({
        type:       'characters',
        characters: sorted.map(c => {
          const rs = Array.isArray(c.roles) && c.roles.length ? c.roles : (c.role ? [c.role] : []);
          return {
            id:          c.id,
            name:        charFullName(c),
            gender:      c.gender         || '',
            age:         c.age            || '',
            job:         charOccupation(c),
            roles:       rs,
            role:        rs[0] || c.role || '',
            roleLabel:   rs.map((r) => roleLabel[r] || r).filter(Boolean).join(' · '),
            description: charIntro(c),
          };
        }),
      });
    }
  }

  // ── 5. Biography (인물이력서)
  if (selections.biography) {
    const hasBio = (c) => (c.biographyItems?.length > 0) || (c.bioTraits?.length > 0);
    const charsWithBio = projectChars.filter(hasBio);
    if (charsWithBio.length) {
      sections.push({
        type: 'biography',
        characters: charsWithBio.map(c => ({
          id:     c.id,
          name:   charFullName(c),
          traits: (c.bioTraits || []).map(t => ({
            label:   t.label   || '',
            content: t.content || '',
          })),
          items: (c.biographyItems || []).map(it => ({
            period:  it.period  ?? it.year  ?? '',
            content: it.content ?? it.event ?? '',
          })),
        })),
      });
    }
  }

  // ── 6. Treatment (트리트먼트) — per episode
  if (selections.treatment) {
    allEpisodes.forEach(ep => {
      const items = (ep.summaryItems || [])
        .filter(it => it.text)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (!items.length) return;
      sections.push({
        type:          'treatment',
        episodeId:     ep.id,
        episodeNumber: ep.number,
        episodeTitle:  ep.title || '',
        items,
      });
    });
  }

  return {
    sections,
    preset: preset || {},
    projectTitle: project?.title || '대본',
  };
}
