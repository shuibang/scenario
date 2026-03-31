/**
 * v2 Store Context
 * ─────────────────────────────────────────────────────────────
 * - Normalized React Context + useReducer
 * - Loads from v2 storage on init (with v1→v2 migration fallback)
 * - Saves via save pipeline (debounced, with unmount flush)
 * - Exposes: { state, dispatch, genId, now }
 */
import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { reducer } from './reducer.js';
import { makeInitialState } from './schema.js';
import { readV2, writeV2, hasV2Data } from '../save/storage.js';
import { migrateV1toV2, createV2SeedData } from '../save/migrations.js';
import * as A from './actions.js';
import { sel } from './selectors.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────
export function genId() {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);
}
export function now() { return new Date().toISOString(); }

// ─── Context ─────────────────────────────────────────────────────────────────
const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, makeInitialState());
  const saveTimerRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state; // always current, no stale closure issues

  // ── Initialize from storage ────────────────────────────────────────────────
  useEffect(() => {
    let loaded = null;

    if (hasV2Data()) {
      try {
        loaded = readV2();
      } catch (e) {
        console.warn('[v2 store] Failed to read v2 data, trying v1 migration', e);
      }
    }

    if (!loaded) {
      // Try v1→v2 migration
      try {
        loaded = migrateV1toV2();
      } catch (e) {
        console.warn('[v2 store] v1 migration failed, using seed data', e);
      }
    }

    if (loaded) {
      dispatch({ type: A.INIT, payload: loaded });
    } else {
      dispatch({ type: A.INIT, payload: createV2SeedData() });
    }
  }, []);

  // ── Auto-activate first project when initialized ───────────────────────────
  useEffect(() => {
    if (!state.meta.initialized) return;
    if (state.ui.activeProjectId) return;
    const projs = sel.projects(state);
    if (projs.length > 0) {
      dispatch({ type: A.SET_ACTIVE_PROJECT, id: projs[0].id });
    }
  }, [state.meta.initialized]);

  // ── Debounced save ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.meta.initialized) return;

    dispatch({ type: A.SET_SAVE_STATUS, payload: 'dirty' });

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      performSave(stateRef.current, dispatch);
    }, 600);

    return () => clearTimeout(saveTimerRef.current);
  }, [
    state.entities,
    state.settings,
  ]);

  // ── Unmount flush ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearTimeout(saveTimerRef.current);
      // Best-effort save on unmount (app close / hot-reload)
      try { performSaveSync(stateRef.current); } catch { /* ignore */ }
    };
  }, []);

  return (
    <StoreCtx.Provider value={{ state, dispatch, genId, now }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// ─── Save helpers ─────────────────────────────────────────────────────────────
async function performSave(state, dispatch) {
  try {
    dispatch({ type: A.SET_SAVE_STATUS, payload: 'saving' });
    writeV2({ entities: state.entities, settings: state.settings });
    dispatch({ type: A.SET_SAVE_STATUS, payload: 'saved' });
  } catch (e) {
    const msg = e?.name === 'QuotaExceededError'
      ? 'localStorage 용량 초과 — 오래된 데이터를 삭제하거나 저장공간을 늘려주세요'
      : `저장 실패: ${e?.message || '알 수 없는 오류'}`;
    dispatch({ type: A.SET_SAVE_STATUS, payload: 'error', error: msg });
    console.error('[v2 store] Save failed:', e);
  }
}

function performSaveSync(state) {
  writeV2({ entities: state.entities, settings: state.settings });
}
