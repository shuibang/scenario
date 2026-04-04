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
function normalizeBlock(block, characters) {
  const charName = resolveCharName(block, characters);
  let content = block.content || '';
  // Migration: old badge-span format stored charName at start of content
  if (block.type === 'dialogue' && charName && content.startsWith(charName)) {
    content = content.slice(charName.length).trimStart();
  }
  return {
    id:         block.id,
    type:       block.type,
    label:      block.label || '',
    content,
    charName,
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
      fields: [...fixedFields, ...customFields].map(f => ({ label: f.label, value: f.value })),
    });
  }

  // ── 2. Synopsis (page numbers reset per section)
  if (selections.synopsis && synopsisDoc) {
    const s = synopsisDoc;
    sections.push({
      type:       'synopsis',
      genre:      s.genre  || '',
      theme:      s.theme  || '',
      intent:     s.intent || '',
      story:      s.story  || s.content || '',
      characters: projectChars.map(c => ({
        id:          c.id,
        name:        charFullName(c),
        gender:      c.gender         || '',
        age:         c.age            || '',
        job:         charOccupation(c),
        role:        c.role,
        description: charIntro(c),
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
    const roleLabel = { lead: '주인공', support: '조연', extra: '단역' };
    const sorted = [...projectChars].sort((a, b) => {
      const o = { lead: 0, support: 1, extra: 2 };
      return (o[a.role] ?? 3) - (o[b.role] ?? 3);
    });
    if (sorted.length) {
      sections.push({
        type:       'characters',
        characters: sorted.map(c => ({
          id:          c.id,
          name:        charFullName(c),
          gender:      c.gender         || '',
          age:         c.age            || '',
          job:         charOccupation(c),
          role:        c.role,
          roleLabel:   roleLabel[c.role] || '',
          description: charIntro(c),
        })),
      });
    }
  }

  // ── 5. Biography (인물이력서)
  if (selections.biography) {
    const charsWithBio = projectChars.filter(c => c.biographyItems?.length > 0);
    if (charsWithBio.length) {
      sections.push({
        type: 'biography',
        characters: charsWithBio.map(c => ({
          id:    c.id,
          name:  charFullName(c),
          items: [...(c.biographyItems || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
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

  // ── 7. SceneList (씬리스트) — per episode
  if (selections.scenelist) {
    allEpisodes.forEach(ep => {
      const epScenes = (scenes || [])
        .filter(s => s.episodeId === ep.id)
        .sort((a, b) => (a.sceneSeq ?? 0) - (b.sceneSeq ?? 0));
      if (!epScenes.length) return;
      sections.push({
        type:          'scenelist',
        episodeId:     ep.id,
        episodeNumber: ep.number,
        episodeTitle:  ep.title || '',
        scenes: epScenes.map((s, i) => {
          const snBlock = (scriptBlocks || []).find(b => b.sceneId === s.id && b.type === 'scene_number');
          const charNames = (s.characterIds || [])
            .map(cid => { const c = projectChars.find(ch => ch.id === cid); return c ? (c.givenName || c.name) : null; })
            .filter(Boolean);
          return {
            id:              s.id,
            sceneNum:        snBlock?.label || `S#${i + 1}.`,
            content:         s.content         || '',
            location:        s.location        || '',
            subLocation:     s.subLocation     || '',
            timeOfDay:       s.timeOfDay       || '',
            specialSituation: s.specialSituation || '',
            sceneListContent: s.sceneListContent || '',
            characters:      charNames,
            tags:            s.tags || [],
          };
        }),
      });
    });
  }

  return {
    sections,
    preset: preset || {},
    projectTitle: project?.title || '대본',
  };
}
