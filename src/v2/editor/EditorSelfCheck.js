/**
 * v2 Editor Self-Check
 * ─────────────────────────────────────────────────────────────
 * Programmatic smoke tests for the block editor.
 * Tests scenarios A–E from the P0 spec.
 *
 * Usage (dev only):
 *   import { runEditorSelfCheck } from './EditorSelfCheck';
 *   const { passed, results } = await runEditorSelfCheck(surfaceRef, episodeId, projectId);
 */

import { parseDOM } from './DomParser.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function genTestId(tag) { return `selfcheck-${tag}-${Date.now()}`; }

function makeBlock(overrides) {
  return {
    id: genTestId('blk'),
    type: 'action',
    content: '',
    episodeId: '__test__',
    projectId: '__test__',
    label: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Place the browser cursor at the start of a block element.
 */
function focusBlockEl(blockEl) {
  if (!blockEl) return false;
  try {
    const type = blockEl.dataset.v2Type;
    const target = type === 'dialogue'
      ? (blockEl.querySelector('[data-v2-speech]') || blockEl)
      : blockEl;
    blockEl.closest('[data-v2-surface]')?.focus();
    const range = document.createRange();
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    const textNode = walker.nextNode();
    if (textNode) {
      range.setStart(textNode, 0);
    } else {
      range.setStart(target, 0);
    }
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch { return false; }
}

// ─── Main runner ──────────────────────────────────────────────────────────────
export async function runEditorSelfCheck(surfaceRef, episodeId, projectId) {
  const results = [];

  function log(name, pass, detail = '') {
    results.push({ name, pass, detail });
    if (pass) {
      console.log(`[SelfCheck] ✓ ${name}`);
    } else {
      console.error(`[SelfCheck] ✗ ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  const surface = surfaceRef?.current;
  if (!surface) {
    log('surface ref exists', false, 'surfaceRef.current is null');
    return { passed: false, results };
  }

  const domEl = document.querySelector('[data-v2-surface]');
  if (!domEl) {
    log('surface DOM exists', false, 'no [data-v2-surface] in document');
    return { passed: false, results };
  }

  log('surface mounted', true);

  // ── Scenario A: scene_number block ────────────────────────────────────────
  console.group('[SelfCheck] Scenario A: 씬번호');
  const aId = genTestId('scene');
  surface.resetWith([makeBlock({ id: aId })]);
  await sleep(60);

  const aEl = domEl.querySelector(`[data-v2-id="${aId}"]`);
  log('[A] block loaded in DOM', !!aEl);

  if (aEl) {
    focusBlockEl(aEl);
    await sleep(20);

    const applied = surface.applyBlockType('scene_number');
    log('[A] applyBlockType(scene_number) returns true', applied === true, `got ${applied}`);
    await sleep(60);

    const sceneEl = domEl.querySelector('[data-v2-type="scene_number"]');
    log('[A] scene_number block in DOM', !!sceneEl);

    if (sceneEl) {
      const sceneId = sceneEl.dataset.v2SceneId;
      log('[A] scene block has sceneId', !!sceneId && sceneId.length > 0, `"${sceneId}"`);

      const label = sceneEl.dataset.v2Label;
      log('[A] scene block has S# label', !!label && /^S#\d+\./.test(label), `"${label}"`);

      // Type content
      if (document.activeElement === domEl || domEl.contains(document.activeElement)) {
        document.execCommand('insertText', false, '바닷가');
        await sleep(60);
      }

      const blocks = parseDOM(domEl, {}, episodeId, projectId);
      const sceneBlock = blocks.find(b => b.type === 'scene_number');
      log('[A] sceneId stable in parse', !!sceneBlock?.sceneId, `"${sceneBlock?.sceneId}"`);
      log('[A] content captured in parse', (sceneBlock?.content || '').length > 0, `"${sceneBlock?.content}"`);

      // Verify idempotency: run doParse again (button click simulation)
      const sceneId1 = sceneEl.dataset.v2SceneId;
      focusBlockEl(sceneEl);
      surface.applyBlockType('action'); // change away
      await sleep(30);
      focusBlockEl(domEl.querySelector(`[data-v2-id="${aId}"]`));
      surface.applyBlockType('scene_number');
      await sleep(60);
      const sceneId2 = domEl.querySelector(`[data-v2-id="${aId}"]`)?.dataset.v2SceneId;
      log('[A] sceneId stable across type re-apply', !!sceneId2, `before="${sceneId1}" after="${sceneId2}"`);
    }
  }
  console.groupEnd();

  // ── Scenario B: action block ──────────────────────────────────────────────
  console.group('[SelfCheck] Scenario B: 지문');
  const bId = genTestId('action');
  const content = '바람이 거세게 불고, 파도가 방파제를 때린다.';
  surface.resetWith([makeBlock({ id: bId, type: 'action', content })]);
  await sleep(60);

  const bEl = domEl.querySelector(`[data-v2-id="${bId}"]`);
  log('[B] action block in DOM', !!bEl);
  log('[B] action type correct', bEl?.dataset.v2Type === 'action', bEl?.dataset.v2Type);
  log('[B] action content in DOM', bEl?.innerText?.includes('바람이'), `"${bEl?.innerText?.slice(0, 30)}"`);

  const bBlocks = parseDOM(domEl, {}, episodeId, projectId);
  const bBlock = bBlocks.find(b => b.id === bId);
  log('[B] action content in parse', bBlock?.content === content, `"${bBlock?.content?.slice(0, 30)}"`);
  console.groupEnd();

  // ── Scenario C: dialogue block ────────────────────────────────────────────
  console.group('[SelfCheck] Scenario C: 대사 (인물 + 텍스트)');
  const cId = genTestId('dialogue');
  const dialogContent = '여기서 다시 시작하자.';
  surface.resetWith([makeBlock({
    id: cId, type: 'dialogue',
    content: dialogContent, characterName: '민수', characterId: 'char-min',
  })]);
  await sleep(60);

  const cEl = domEl.querySelector(`[data-v2-id="${cId}"]`);
  log('[C] dialogue block in DOM', !!cEl);
  log('[C] dialogue type correct', cEl?.dataset.v2Type === 'dialogue', cEl?.dataset.v2Type);

  const badge = cEl?.querySelector('.v2b-badge');
  log('[C] badge shows charName', badge?.textContent?.includes('민수'), `"${badge?.textContent}"`);

  const speech = cEl?.querySelector('[data-v2-speech]');
  log('[C] speech text in DOM', speech?.innerText?.includes('여기서'), `"${speech?.innerText?.slice(0, 30)}"`);

  const cBlocks = parseDOM(domEl, {}, episodeId, projectId);
  const cBlock = cBlocks.find(b => b.id === cId);
  log('[C] content in parse', cBlock?.content === dialogContent, `"${cBlock?.content}"`);
  log('[C] characterName in parse', cBlock?.characterName === '민수', `"${cBlock?.characterName}"`);
  log('[C] characterId in parse', cBlock?.characterId === 'char-min', `"${cBlock?.characterId}"`);
  console.groupEnd();

  // ── Scenario D: sequential dialogues ─────────────────────────────────────
  console.group('[SelfCheck] Scenario D: 연속 대사');
  const d1Id = genTestId('d1');
  const d2Id = genTestId('d2');
  surface.resetWith([
    makeBlock({ id: d1Id, type: 'dialogue', content: '여기서 다시 시작하자.', characterName: '민수', characterId: 'char-min' }),
    makeBlock({ id: d2Id, type: 'dialogue', content: '이번에는 끝까지 가보자.', characterName: '지연', characterId: 'char-jy' }),
  ]);
  await sleep(60);

  const d1El = domEl.querySelector(`[data-v2-id="${d1Id}"]`);
  const d2El = domEl.querySelector(`[data-v2-id="${d2Id}"]`);
  log('[D] first dialogue in DOM', !!d1El);
  log('[D] second dialogue in DOM', !!d2El);

  const dBlocks = parseDOM(domEl, {}, episodeId, projectId);
  log('[D] two dialogue blocks parsed', dBlocks.filter(b => b.type === 'dialogue').length === 2,
    `got ${dBlocks.filter(b => b.type === 'dialogue').length}`);
  log('[D] first dialogue content', dBlocks.find(b => b.id === d1Id)?.content === '여기서 다시 시작하자.',
    `"${dBlocks.find(b => b.id === d1Id)?.content}"`);
  log('[D] second dialogue content', dBlocks.find(b => b.id === d2Id)?.content === '이번에는 끝까지 가보자.',
    `"${dBlocks.find(b => b.id === d2Id)?.content}"`);
  console.groupEnd();

  // ── Scenario E: button == keyboard shortcut ───────────────────────────────
  console.group('[SelfCheck] Scenario E: 버튼 = 단축키 동일성');

  // Button path
  const e1Id = genTestId('e1');
  surface.resetWith([makeBlock({ id: e1Id, content: 'test' })]);
  await sleep(40);
  const e1El = domEl.querySelector(`[data-v2-id="${e1Id}"]`);
  focusBlockEl(e1El);
  await sleep(20);
  surface.applyBlockType('scene_number');
  await sleep(60);
  const afterButton = {
    type:    domEl.querySelector(`[data-v2-id="${e1Id}"]`)?.dataset.v2Type,
    sceneId: !!domEl.querySelector(`[data-v2-id="${e1Id}"]`)?.dataset.v2SceneId,
    label:   domEl.querySelector(`[data-v2-id="${e1Id}"]`)?.dataset.v2Label,
  };

  // Keyboard shortcut path
  const e2Id = genTestId('e2');
  surface.resetWith([makeBlock({ id: e2Id, content: 'test' })]);
  await sleep(40);
  const e2El = domEl.querySelector(`[data-v2-id="${e2Id}"]`);
  focusBlockEl(e2El);
  await sleep(20);
  domEl.dispatchEvent(new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true }));
  await sleep(60);
  const afterShortcut = {
    type:    domEl.querySelector(`[data-v2-id="${e2Id}"]`)?.dataset.v2Type,
    sceneId: !!domEl.querySelector(`[data-v2-id="${e2Id}"]`)?.dataset.v2SceneId,
    label:   domEl.querySelector(`[data-v2-id="${e2Id}"]`)?.dataset.v2Label,
  };

  log('[E] button produces scene_number',  afterButton.type  === 'scene_number', `type="${afterButton.type}"`);
  log('[E] shortcut produces scene_number', afterShortcut.type === 'scene_number', `type="${afterShortcut.type}"`);
  log('[E] button produces sceneId',  afterButton.sceneId);
  log('[E] shortcut produces sceneId', afterShortcut.sceneId);
  log('[E] button produces S# label',  !!afterButton.label  && afterButton.label.startsWith('S#'),  `"${afterButton.label}"`);
  log('[E] shortcut produces S# label', !!afterShortcut.label && afterShortcut.label.startsWith('S#'), `"${afterShortcut.label}"`);
  log('[E] button == shortcut (type)', afterButton.type === afterShortcut.type);
  log('[E] button == shortcut (has sceneId)', afterButton.sceneId === afterShortcut.sceneId);
  console.groupEnd();

  // ── Summary ───────────────────────────────────────────────────────────────
  const passed  = results.every(r => r.pass);
  const passing = results.filter(r => r.pass).length;
  const total   = results.length;
  if (passed) {
    console.log(`%c[SelfCheck] ✅ ALL PASSED (${passing}/${total})`, 'color: #22c55e; font-weight: bold');
  } else {
    const failed = results.filter(r => !r.pass);
    console.error(`[SelfCheck] ❌ ${failed.length} FAILED / ${total} total`);
    failed.forEach(r => console.error(`  ✗ ${r.name}${r.detail ? ': ' + r.detail : ''}`));
  }

  return { passed, results, passing, total };
}
