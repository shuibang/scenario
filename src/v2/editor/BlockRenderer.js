/**
 * v2 BlockRenderer
 * Block[] → innerHTML string
 *
 * Rule: the DOM is a pure projection of block data.
 * All editing happens in the DOM; DomParser.js reads it back.
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * For scene_number blocks: strip the "S#n." label prefix so the editor
 * shows only the user-editable portion. The label is shown via CSS ::before.
 */
function sceneDisplayContent(block) {
  return (block.content || '').replace(/^S#\d+\.?\s*/, '');
}

export function renderBlock(block) {
  const id   = esc(block.id);
  const type = esc(block.type || 'action');

  switch (block.type) {
    case 'scene_number': {
      const label   = esc(block.label || '');
      const sceneId = esc(block.sceneId || '');
      const content = esc(sceneDisplayContent(block));
      return `<div data-v2-id="${id}" data-v2-type="scene_number" data-v2-label="${label}" data-v2-scene-id="${sceneId}" class="v2b v2b-scene">${content}</div>`;
    }

    case 'dialogue': {
      const charName = esc(block.characterName || '');
      const charId   = esc(block.characterId   || '');
      const speech   = esc(block.content || '');
      return `<div data-v2-id="${id}" data-v2-type="dialogue" data-v2-char-name="${charName}" data-v2-char-id="${charId}" class="v2b v2b-dialogue"><span contenteditable="false" class="v2b-badge">${charName || '\u00a0'}</span><span data-v2-speech class="v2b-speech">${speech}</span></div>`;
    }

    case 'action':
      return `<div data-v2-id="${id}" data-v2-type="action" class="v2b v2b-action">${esc(block.content || '')}</div>`;

    case 'parenthetical':
      return `<div data-v2-id="${id}" data-v2-type="parenthetical" class="v2b v2b-paren">${esc(block.content || '')}</div>`;

    case 'transition':
      return `<div data-v2-id="${id}" data-v2-type="transition" class="v2b v2b-transition">${esc(block.content || '')}</div>`;

    default:
      return `<div data-v2-id="${id}" data-v2-type="${type}" class="v2b v2b-${type}">${esc(block.content || '')}</div>`;
  }
}

/**
 * Render a full block array to innerHTML.
 */
export function blocksToHTML(blocks) {
  return blocks.map(renderBlock).join('');
}
