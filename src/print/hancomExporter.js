/**
 * HancomExporter — abstraction layer for Hancom HWP / HWPX output.
 *
 * Current implementation: delegates to DOCX with Hancom-compatible settings.
 * Future: swap exportHancom() body with a HWPX builder without changing callers.
 *
 * Interface contract:
 *   exportHancom(appState, selections) → Promise<void>
 *     Downloads the file. Filename extension reflects actual format.
 *
 * HWPX roadmap (not yet implemented):
 *   import { buildHwpx } from './hwpxBuilder';  // future file
 *   → buildHwpx(printModel) → Blob
 */

import { exportDocx } from './printDocx';
import { getFontById } from './FontRegistry';
import { buildHwpx } from './hwpxBuilder';

function stripHtml(html) { return (html || '').replace(/<[^>]+>/g, ''); }

/**
 * exportHancom — Hancom-compatible export.
 * Currently outputs .docx that HWP 2014+ and Hancom Office can open cleanly.
 */
export async function exportHancom(appState, selections, { onStep = () => {} } = {}) {
  // Hancom DOCX:
  // - 함초롱바탕 font
  // - 대화 간격 9em (한글 렌더링에서 7em보다 여유 있게)
  // - HTML 서식 태그 제거 (Hancom이 inline XML run을 올바르게 표시 못할 수 있음)
  const hancomState = {
    ...appState,
    stylePreset: {
      ...(appState.stylePreset || {}),
      fontFamily: getFontById('hcr-batang').cssFamily,
      dialogueGap: '9em',
    },
    scriptBlocks: (appState.scriptBlocks || []).map(b =>
      (b.type === 'action' || b.type === 'dialogue')
        ? { ...b, content: stripHtml(b.content) }
        : b
    ),
  };

  return exportDocx(hancomState, selections, { onStep, hancom: true });
}

/**
 * exportHwpx — real HWPX (HWP XML) file download.
 * Produces a ZIP-based .hwpx file openable in Hancom Office 2014+.
 */
export async function exportHwpx(appState, selections) {
  const blob = await buildHwpx(appState, selections);
  const { projects, activeProjectId } = appState;
  const project = projects?.find(p => p.id === activeProjectId);
  const name = (project?.title || '대본').replace(/[/\\?%*:|"<>]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}.hwpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
