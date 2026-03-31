/**
 * v2 DomParser
 * DOM (contentEditable surface) → Block[]
 *
 * Reads from [data-v2-id] elements only.
 * Meta from the previous block state is used to fill non-DOM fields
 * (projectId, createdAt, sceneId, etc.)
 */

function now() { return new Date().toISOString(); }

/**
 * Get the plain text of a block element.
 * For dialogue: reads only the speech span.
 */
export function blockTextFromEl(el) {
  if (!el) return '';
  if (el.dataset.v2Type === 'dialogue') {
    const s = el.querySelector('[data-v2-speech]');
    return s ? s.innerText.replace(/\n$/, '') : '';
  }
  return el.innerText.replace(/\n$/, '');
}

/**
 * Set plain text on a block element.
 * For dialogue: writes only to the speech span.
 */
export function setBlockTextOnEl(el, text) {
  if (!el) return;
  if (el.dataset.v2Type === 'dialogue') {
    const s = el.querySelector('[data-v2-speech]');
    if (s) { s.innerText = text; return; }
  }
  el.innerText = text;
}

/**
 * Parse all block elements in a surface element into Block objects.
 * @param {HTMLElement} surface
 * @param {{ [id: string]: Block }} metaMap  — existing block metadata (by id)
 * @param {string} episodeId
 * @param {string} projectId
 * @returns {Block[]}
 */
export function parseDOM(surface, metaMap, episodeId, projectId) {
  if (!surface) return [];

  const blocks = [];
  let sceneSeq = 0;

  for (const el of surface.querySelectorAll('[data-v2-id]')) {
    const id   = el.dataset.v2Id;
    const type = el.dataset.v2Type || 'action';
    const meta = metaMap[id] || {};

    const base = {
      id,
      type,
      episodeId:  meta.episodeId  || episodeId,
      projectId:  meta.projectId  || projectId,
      label:      '',
      createdAt:  meta.createdAt  || now(),
      updatedAt:  now(),
    };

    if (type === 'scene_number') {
      sceneSeq++;
      blocks.push({
        ...base,
        content: blockTextFromEl(el),
        label:   `S#${sceneSeq}.`,
        sceneId: el.dataset.v2SceneId || meta.sceneId || null,
      });

    } else if (type === 'dialogue') {
      blocks.push({
        ...base,
        content:       blockTextFromEl(el),
        characterName: el.dataset.v2CharName || meta.characterName || '',
        characterId:   el.dataset.v2CharId   || meta.characterId   || '',
      });

    } else {
      blocks.push({
        ...base,
        content: blockTextFromEl(el),
      });
    }
  }

  return blocks;
}

/**
 * Find the nearest ancestor [data-v2-id] element from a node.
 */
export function findBlockEl(node, surface) {
  let el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== surface) {
    if (el.dataset?.v2Id) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Get caret offset (character count) from start of block text.
 */
export function getCaretOffset(range, blockEl) {
  if (!range || !blockEl) return 0;
  const type = blockEl.dataset.v2Type;
  const target = type === 'dialogue'
    ? (blockEl.querySelector('[data-v2-speech]') || blockEl)
    : blockEl;
  if (!target.contains(range.startContainer) && target !== range.startContainer) return 0;
  try {
    const r = document.createRange();
    r.selectNodeContents(target);
    r.setEnd(range.startContainer, range.startOffset);
    return r.toString().length;
  } catch { return 0; }
}

/**
 * Set caret to a character offset within a block element.
 */
export function setCaret(el, offset) {
  if (!el) return;
  const type = el.dataset.v2Type;
  const target = type === 'dialogue'
    ? (el.querySelector('[data-v2-speech]') || el)
    : el;

  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node) {
    if (remaining <= node.length) {
      const range = document.createRange();
      const sel   = window.getSelection();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= node.length;
    node = walker.nextNode();
  }
  // Fallback: place at end
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
}

/**
 * Sibling block elements.
 */
export function prevBlockEl(surface, el) {
  const all = [...surface.querySelectorAll('[data-v2-id]')];
  const i = all.indexOf(el);
  return i > 0 ? all[i - 1] : null;
}

export function nextBlockEl(surface, el) {
  const all = [...surface.querySelectorAll('[data-v2-id]')];
  const i = all.indexOf(el);
  return i >= 0 && i < all.length - 1 ? all[i + 1] : null;
}
