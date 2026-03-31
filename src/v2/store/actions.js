/**
 * v2 Action Type Constants
 * All action types are string constants. Action creators follow below.
 */

// ─── Meta ─────────────────────────────────────────────────────────────────
export const INIT              = 'v2/INIT';
export const RESET             = 'v2/RESET';

// ─── Projects ─────────────────────────────────────────────────────────────
export const ADD_PROJECT       = 'v2/ADD_PROJECT';
export const UPDATE_PROJECT    = 'v2/UPDATE_PROJECT';
export const DELETE_PROJECT    = 'v2/DELETE_PROJECT';

// ─── Episodes ─────────────────────────────────────────────────────────────
export const ADD_EPISODE       = 'v2/ADD_EPISODE';
export const UPDATE_EPISODE    = 'v2/UPDATE_EPISODE';
export const DELETE_EPISODE    = 'v2/DELETE_EPISODE';

// ─── Characters ───────────────────────────────────────────────────────────
export const ADD_CHARACTER     = 'v2/ADD_CHARACTER';
export const UPDATE_CHARACTER  = 'v2/UPDATE_CHARACTER';
export const DELETE_CHARACTER  = 'v2/DELETE_CHARACTER';

// ─── Scenes ───────────────────────────────────────────────────────────────
export const SYNC_SCENES       = 'v2/SYNC_SCENES';        // replace all scenes for an episode
export const UPDATE_SCENE      = 'v2/UPDATE_SCENE';
export const DELETE_SCENE      = 'v2/DELETE_SCENE';

// ─── Script Blocks ────────────────────────────────────────────────────────
export const SET_BLOCKS        = 'v2/SET_BLOCKS';          // replace all blocks for an episode

// ─── Treatment ────────────────────────────────────────────────────────────
export const ADD_TREATMENT_ITEM       = 'v2/ADD_TREATMENT_ITEM';
export const UPDATE_TREATMENT_ITEM    = 'v2/UPDATE_TREATMENT_ITEM';
export const DELETE_TREATMENT_ITEM    = 'v2/DELETE_TREATMENT_ITEM';
export const REORDER_TREATMENT_ITEMS  = 'v2/REORDER_TREATMENT_ITEMS';
export const IMPORT_TREATMENT         = 'v2/IMPORT_TREATMENT';  // atomic: scenes+blocks+items

// ─── Scene List Rows ──────────────────────────────────────────────────────────
export const SET_SCENE_LIST_ROW    = 'v2/SET_SCENE_LIST_ROW';    // upsert by sceneId
export const DELETE_SCENE_LIST_ROW = 'v2/DELETE_SCENE_LIST_ROW';

// ─── Documents ────────────────────────────────────────────────────────────
export const SET_COVER         = 'v2/SET_COVER';
export const SET_SYNOPSIS      = 'v2/SET_SYNOPSIS';

// ─── Resources ────────────────────────────────────────────────────────────
export const ADD_RESOURCE      = 'v2/ADD_RESOURCE';
export const UPDATE_RESOURCE   = 'v2/UPDATE_RESOURCE';
export const DELETE_RESOURCE   = 'v2/DELETE_RESOURCE';

// ─── Work Time ────────────────────────────────────────────────────────────
export const ADD_WORK_LOG      = 'v2/ADD_WORK_LOG';

// ─── Settings ─────────────────────────────────────────────────────────────
export const SET_STYLE_PRESET  = 'v2/SET_STYLE_PRESET';

// ─── UI ───────────────────────────────────────────────────────────────────
export const SET_ACTIVE_PROJECT        = 'v2/SET_ACTIVE_PROJECT';
export const SET_ACTIVE_EPISODE        = 'v2/SET_ACTIVE_EPISODE';
export const SET_ACTIVE_DOC            = 'v2/SET_ACTIVE_DOC';
export const SET_SELECTED_CHARACTER    = 'v2/SET_SELECTED_CHARACTER';
export const SET_SELECTED_SCENE        = 'v2/SET_SELECTED_SCENE';
export const SET_SAVE_STATUS           = 'v2/SET_SAVE_STATUS';
export const SET_SCROLL_TO_SCENE       = 'v2/SET_SCROLL_TO_SCENE';
