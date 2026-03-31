/**
 * v2 Domain Types
 * ────────────────────────────────────────────────────────────
 * All entity shapes defined here as JSDoc typedefs.
 * Rule: no derived/computed fields stored on entities.
 * Derived data lives in selectors.js only.
 */

// ─── Utility ────────────────────────────────────────────────────────────────
/**
 * @typedef {string} ID  — opaque alphanumeric, e.g. "a3k9x2"
 * @typedef {string} ISOString — ISO 8601 date string
 */

// ─── Core Entities ──────────────────────────────────────────────────────────

/**
 * @typedef {Object} Project
 * @property {ID} id
 * @property {string} title
 * @property {ISOString} createdAt
 * @property {ISOString} updatedAt
 */

/**
 * @typedef {Object} Episode
 * @property {ID} id
 * @property {ID} projectId
 * @property {number} number     — display number (always 1,2,3… per project, recomputed on delete)
 * @property {string} title      — may be empty string
 * @property {ISOString} createdAt
 * @property {ISOString} updatedAt
 * @property {ID[]} treatmentItemIds  — ordered treatment item IDs for this episode
 */

/**
 * Block type enum.
 * @typedef {'scene_number'|'action'|'dialogue'|'parenthetical'|'transition'} BlockType
 */
export const BLOCK_TYPES = {
  SCENE_NUMBER:  'scene_number',
  ACTION:        'action',
  DIALOGUE:      'dialogue',
  PARENTHETICAL: 'parenthetical',
  TRANSITION:    'transition',
};

/**
 * @typedef {Object} ScriptBlock
 * @property {ID} id
 * @property {ID} episodeId
 * @property {ID} projectId
 * @property {BlockType} type
 * @property {string} content        — plain text (no HTML). For dialogue: speech only.
 * @property {string} label          — e.g. "S#3." (auto-assigned for scene_number, else '')
 * @property {ID} [sceneId]          — only on scene_number blocks; links to Scene entity
 * @property {ID} [characterId]      — only on dialogue blocks; links to Character entity
 * @property {string} [characterName] — only on dialogue blocks; display name at time of writing
 * @property {ISOString} createdAt
 * @property {ISOString} updatedAt
 */

/**
 * @typedef {Object} Scene
 * @property {ID} id
 * @property {ID} episodeId
 * @property {ID} projectId
 * @property {number} sceneSeq        — 1-based sequence within episode (recomputed from blocks order)
 * @property {string} label           — e.g. "S#3." (derived)
 * @property {string} specialSituation — e.g. "회상", "꿈"
 * @property {string} location        — primary location
 * @property {string} subLocation     — sub-location
 * @property {string} timeOfDay       — "낮"|"밤"|"아침"|"저녁"|"새벽"
 * @property {string} content         — legacy free-text headline (fallback)
 * @property {string} status          — "draft"|"writing"|"done"
 * @property {string[]} tags          — story beat tags (e.g. "기폭제")
 * @property {ID[]} characterIds      — characters appearing in scene (등장체크)
 * @property {string} sceneListContent — extra content from scene list view
 * @property {ID} [sourceTreatmentItemId] — if imported from treatment
 * @property {ISOString} createdAt
 * @property {ISOString} updatedAt
 */

/**
 * @typedef {Object} Character
 * @property {ID} id
 * @property {ID} projectId
 * @property {string} surname       — 성
 * @property {string} givenName     — 이름 (used in scripts)
 * @property {string} name          — fallback single field (legacy)
 * @property {'lead'|'support'|'extra'} role
 * @property {string} gender
 * @property {string} age
 * @property {string} occupation
 * @property {string} intro         — short description
 * @property {ExtraField[]} extraFields
 * @property {Relationship[]} relationships
 * @property {ISOString} createdAt
 */

/**
 * @typedef {Object} ExtraField
 * @property {ID} id
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {Object} Relationship
 * @property {ID} id
 * @property {ID} targetId
 * @property {string} label
 */

/**
 * @typedef {Object} TreatmentItem
 * @property {ID} id
 * @property {ID} episodeId
 * @property {ID} projectId
 * @property {number} order
 * @property {string} text
 * @property {ID} [importedSceneId]   — set after importing to script
 * @property {string} [importedText]  — text at time of import (for diff)
 * @property {ISOString} createdAt
 * @property {ISOString} updatedAt
 */

/**
 * @typedef {Object} CoverDoc
 * @property {ID} id
 * @property {ID} projectId
 * @property {string} title
 * @property {CoverField[]} fields
 */

/**
 * @typedef {Object} CoverField
 * @property {ID} id
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {Object} SynopsisDoc
 * @property {ID} id
 * @property {ID} projectId
 * @property {string} genre
 * @property {string} theme
 * @property {string} intent
 * @property {string} story
 * @property {string} characterSettings
 * @property {SynopsisSection[]} sections
 */

/**
 * @typedef {Object} SynopsisSection
 * @property {ID} id
 * @property {string} title
 * @property {string} content
 */

/**
 * @typedef {Object} Resource
 * @property {ID} id
 * @property {ID} projectId
 * @property {string} type       — "image"|"memo"
 * @property {string} content    — data URL (image) or text (memo)
 * @property {string} caption
 * @property {ISOString} createdAt
 */

/**
 * @typedef {Object} WorkTimeLog
 * @property {ID} id
 * @property {ID} projectId
 * @property {number} seconds
 * @property {ISOString} date
 */

// ─── Settings ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} StylePreset
 * @property {string} fontFamily
 * @property {number} fontSize    — pt
 * @property {number} lineHeight  — multiplier (1.6 = 160%)
 * @property {string} pageSize    — "A4"
 * @property {{top:number,right:number,bottom:number,left:number}} pageMargins — mm
 * @property {string} pageNumberFormat  — e.g. "-{n}-"
 * @property {number} pageNumberOffsetBottomMm
 * @property {string} dialogueGap  — CSS value e.g. "7em"
 */

export const DEFAULT_STYLE_PRESET = {
  fontFamily: '함초롱바탕',
  fontSize: 11,
  lineHeight: 1.6,
  pageSize: 'A4',
  pageMargins: { top: 35, right: 30, bottom: 30, left: 30 },
  pageNumberFormat: '-{n}-',
  pageNumberOffsetBottomMm: 15,
  dialogueGap: '7em',
  fontWeightRules: {
    scene_number: 'bold',
    characterName: 'bold',
    action: 'normal',
    dialogue: 'normal',
    parenthetical: 'normal',
    transition: 'normal',
  },
  textColor: {
    scene_number: 'inherit',
    characterName: 'inherit',
    action: 'inherit',
    dialogue: 'inherit',
    parenthetical: 'inherit',
    transition: 'inherit',
  },
};

/**
 * @typedef {Object} SceneListRow
 * @property {ID} id
 * @property {ID} sceneId      — foreign key → Scene (canonical source for location/time/chars)
 * @property {ID} episodeId
 * @property {ID} projectId
 * @property {string} content  — user-editable synopsis/memo for this scene
 * @property {string} note     — user-editable note (e.g. staff note)
 * @property {ISOString} updatedAt
 *
 * Derived columns (from Scene, NOT stored here):
 *   sceneNumber, location, subLocation, timeOfDay, specialSituation, characterIds
 */

// ─── Print ───────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} PrintBlock
 * @property {ID} id
 * @property {BlockType} type
 * @property {string} label
 * @property {string} content
 * @property {string} [characterName]
 * @property {ID} [sceneId]
 */

/**
 * @typedef {Object} PrintSection
 * @property {'cover'|'synopsis'|'episode'|'characters'} type
 * @property {PrintBlock[]} [blocks]  — episode sections
 */

/**
 * @typedef {Object} PrintDocument
 * @property {PrintSection[]} sections
 * @property {StylePreset} preset
 * @property {string} projectTitle
 */
