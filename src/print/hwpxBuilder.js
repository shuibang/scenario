/**
 * hwpxBuilder — generates a real HWPX (HWP XML) file from a PrintModel.
 *
 * HWPX is a ZIP-based format:
 *   mimetype                        (STORE, no compression)
 *   META-INF/container.xml
 *   Contents/content.hpf            (OPF package manifest)
 *   Contents/header.xml             (fonts, styles, page layout)
 *   Contents/section0.xml           (document body)
 *
 * Uses jszip (available as transitive dependency).
 */

import JSZip from 'jszip';
import { buildPrintModel } from './PrintModel';

// ─── XML helpers ────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

// ─── Page constants (HWP units = 1/7200 inch ≈ 0.003527 mm) ───────────────
// A4: 210×297 mm
const A4_W  = 59528;
const A4_H  = 84188;
const M_LR  = 8503;  // 30 mm left/right
const M_TOP = 8503;  // 30 mm top
const M_BOT = 7087;  // 25 mm bottom
const M_HF  = 4252;  // 15 mm header/footer

// ─── Sequential ID counter (reset per document) ─────────────────────────────
// HWPML requires all child elements (pPr, run, pEnd) to share the paragraph's id.
let _pid = 0;
function resetIds() { _pid = 0; }

/**
 * Build one HWPX paragraph element.
 * text:    string | '' (empty = no run, just pEnd)
 * cid:     charShape id reference (0=normal, 1=title, 2=heading)
 * parid:   paraShape id reference (0=normal, 1=center, 2=heading)
 * sid:     style id reference
 */
function para(text, { cid = 0, parid = 0, sid = 0 } = {}) {
  const id = _pid++;
  if (!text) {
    return `  <hp:p id="${id}" listCnt="1" listID="0">
    <hp:pPr id="${id}" paraPrIDRef="${parid}" styleIDRef="${sid}" pageBreak="false" columnBreak="false" merged="false"/>
    <hp:pEnd id="${id}" charPrIDRef="${cid}"/>
  </hp:p>`;
  }
  return `  <hp:p id="${id}" listCnt="2" listID="0">
    <hp:pPr id="${id}" paraPrIDRef="${parid}" styleIDRef="${sid}" pageBreak="false" columnBreak="false" merged="false"/>
    <hp:run id="${id}" charPrIDRef="${cid}">
      <hp:t xml:space="preserve">${esc(text)}</hp:t>
    </hp:run>
    <hp:pEnd id="${id}" charPrIDRef="${cid}"/>
  </hp:p>`;
}

// ─── XML file builders ───────────────────────────────────────────────────────
function xmlMimetype() {
  return 'application/hwp+zip';
}

function xmlContainer() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<container>
  <rootfiles>
    <rootfile full-path="Contents/content.hpf" media-type="application/hwp+zip"/>
  </rootfiles>
</container>`;
}

function xmlContentHpf(title) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf" version="1.2.0.0" uniqueIdentifier="HWPXId">
  <opf:metadata>
    <dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">${esc(title)}</dc:title>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="header"   href="header.xml"   media-type="application/xml"/>
    <opf:item id="section0" href="section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`;
}

function xmlHeader(fontName, fontSizePt) {
  // HWPX height unit = 1/100 pt
  const normalH  = Math.round(fontSizePt * 100);
  const titleH   = Math.round(fontSizePt * 140);
  const headingH = Math.round(fontSizePt * 110);

  const charShape = (id, height, bold) => `    <hh:charShape id="${id}" height="${height}" textColor="0" shadeColor="16777215"
      useFontSpace="false" useKerning="false" shadowType="None"
      shadowColor="8421504" shadowDX="30" shadowDY="-30"
      bold="${bold}" italic="false" underline="false" strikeout="false"
      outline="false" emboss="false" engrave="false"
      superScript="false" subScript="false" smallCaps="false" allCaps="false" hiddenText="false">
      <hh:fontRef lang="Hangul"   hangulFont="0"/>
      <hh:fontRef lang="Latin"    latinFont="0"/>
      <hh:fontRef lang="Hanja"    hanjaFont="0"/>
      <hh:fontRef lang="Japanese" japaneseFont="0"/>
      <hh:fontRef lang="Other"    otherFont="0"/>
      <hh:fontRef lang="Symbol"   symbolFont="0"/>
      <hh:fontRef lang="User"     userFont="0"/>
      <hh:ratio kana="100" hangul="100" latin="100" hanja="100" other="100" symbol="100" user="100"/>
      <hh:spacing kana="0" hangul="0" latin="0" hanja="0" other="0" symbol="0" user="0"/>
      <hh:relSize kana="100" hangul="100" latin="100" hanja="100" other="100" symbol="100" user="100"/>
      <hh:offset kana="0" hangul="0" latin="0" hanja="0" other="0" symbol="0" user="0"/>
    </hh:charShape>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2012/head" version="1.2.0.0" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:idMappings>
    <hh:binData count="0"/>
    <hh:faceNameCount normal="1" eng="0" cn="0" jp="0" other="0" symbol="0" user="0"/>
    <hh:borderFillCount count="1"/>
    <hh:charShapeCount count="3"/>
    <hh:tabDefCount count="0"/>
    <hh:numberingCount count="0"/>
    <hh:bulletCount count="0"/>
    <hh:paraShapeCount count="3"/>
    <hh:styleCount count="3"/>
    <hh:memoShapeCount count="0"/>
    <hh:trackChangeCount count="0"/>
    <hh:trackChangeAuthorCount count="0"/>
  </hh:idMappings>
  <hh:mappingTable>
    <hh:faceName id="0" name="${esc(fontName)}" fontType="TTF" baseFont="${esc(fontName)}">
      <hh:typeInfo familyType="Roman" serifStyle="Serif" weight="Book" proportion="Modern"/>
    </hh:faceName>
    <hh:borderFill id="1" threeD="false" shadow="false" centerLine="false" breakCellSeparateLine="false">
      <hh:slash type="None" crooked="false" isCounter="false"/>
      <hh:backSlash type="None" crooked="false" isCounter="false"/>
      <hh:leftBorder   type="None" width="0.1mm" color="0"/>
      <hh:rightBorder  type="None" width="0.1mm" color="0"/>
      <hh:topBorder    type="None" width="0.1mm" color="0"/>
      <hh:bottomBorder type="None" width="0.1mm" color="0"/>
      <hh:diagonal     type="None" width="0.1mm" color="0"/>
      <hh:fillInfo><hh:noFill/></hh:fillInfo>
    </hh:borderFill>
${charShape(0, normalH,  'false')}
${charShape(1, titleH,   'true')}
${charShape(2, headingH, 'true')}
    <hh:paraShape id="0" lineSpacingType="percent" lineSpacing="160"
      paraSPBefore="0" paraSPAfter="0" indent="0" outdent="0"
      leftMargin="0" rightMargin="0" align="Justify" borderFillIDRef="1"
      noBreak="false" keepWithNext="false" widowOrphan="0"
      fontLineHeight="false" snapToGrid="true" condense="0" tabStop="709"/>
    <hh:paraShape id="1" lineSpacingType="percent" lineSpacing="160"
      paraSPBefore="300" paraSPAfter="100" indent="0" outdent="0"
      leftMargin="0" rightMargin="0" align="Center" borderFillIDRef="1"
      noBreak="false" keepWithNext="false" widowOrphan="0"
      fontLineHeight="false" snapToGrid="true" condense="0" tabStop="709"/>
    <hh:paraShape id="2" lineSpacingType="percent" lineSpacing="160"
      paraSPBefore="200" paraSPAfter="0" indent="0" outdent="0"
      leftMargin="0" rightMargin="0" align="Justify" borderFillIDRef="1"
      noBreak="false" keepWithNext="false" widowOrphan="0"
      fontLineHeight="false" snapToGrid="true" condense="0" tabStop="709"/>
    <hh:style id="0" type="Para" name="바탕글"  engName="Normal"
      paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="false"/>
    <hh:style id="1" type="Para" name="제목"    engName="Title"
      paraPrIDRef="1" charPrIDRef="1" nextStyleIDRef="0" langID="1042" lockForm="false"/>
    <hh:style id="2" type="Para" name="소제목"  engName="Heading"
      paraPrIDRef="2" charPrIDRef="2" nextStyleIDRef="0" langID="1042" lockForm="false"/>
  </hh:mappingTable>
  <hh:docSetting>
    <hh:linkDocList/>
    <hh:trackChangedSettings acceptAllChange="true"/>
    <hh:masterPageList/>
    <hh:forbiddenWordList/>
    <hh:compatibleDocument targetProgram="HWP2014"/>
    <hh:layoutCompatibility/>
  </hh:docSetting>
  <hh:forbidden/>
</hh:head>`;
}

// ─── Section (body) XML ──────────────────────────────────────────────────────
function xmlSection(printModel) {
  resetIds();

  const paras  = [];
  const empty  = ()     => paras.push(para(''));
  const title  = (t)    => paras.push(para(t, { cid: 1, parid: 1, sid: 1 }));
  const head   = (t)    => paras.push(para(t, { cid: 2, parid: 2, sid: 2 }));
  const normal = (t)    => paras.push(para(t));

  const roleLabel = { lead: '주인공', support: '조연', extra: '단역' };

  for (const sec of printModel.sections) {
    switch (sec.type) {
      case 'cover': {
        empty(); empty();
        title(sec.title || '제목 없음');
        empty();
        for (const f of sec.fields) {
          normal(`${f.label}: ${f.value}`);
        }
        empty(); empty();
        break;
      }
      case 'synopsis': {
        head('[ 시놉시스 ]');
        empty();
        if (sec.genre)  { head('장르');    normal(sec.genre);  empty(); }
        if (sec.theme)  { head('주제');    normal(sec.theme);  empty(); }
        if (sec.intent) { head('기획의도'); normal(sec.intent); empty(); }
        if (sec.story)  {
          head('줄거리');
          sec.story.split('\n').forEach(line => normal(line));
          empty();
        }
        if (sec.characters?.length) {
          head('인물설정');
          for (const c of sec.characters) {
            const meta = [c.gender, c.age, c.job, roleLabel[c.role] || c.role].filter(Boolean).join(' · ');
            normal(`${c.name}${meta ? '  (' + meta + ')' : ''}`);
            if (c.description) normal(c.description);
          }
          empty();
        }
        break;
      }
      case 'episode': {
        empty();
        head(`${sec.episodeNumber}회${sec.episodeTitle ? ' ' + sec.episodeTitle : ''}`);
        empty();
        for (const block of sec.blocks) {
          switch (block.type) {
            case 'scene_number':
              empty();
              normal(block.label || block.content || '');
              break;
            case 'action':
              if (block.content) normal(block.content);
              break;
            case 'dialogue':
              normal(`${block.charName ? block.charName + '   ' : ''}${block.content || ''}`);
              break;
            case 'parenthetical':
              if (block.content) normal(`(${block.content})`);
              break;
            case 'transition':
              if (block.content) normal(block.content);
              break;
            default:
              if (block.content) normal(block.content);
          }
        }
        empty();
        break;
      }
      case 'characters': {
        head('인물 설정');
        empty();
        for (const c of sec.characters) {
          const meta = [c.gender, c.age, c.job].filter(Boolean).join(' · ');
          head(`${c.name}${c.roleLabel ? '  [' + c.roleLabel + ']' : ''}`);
          if (meta) normal(meta);
          if (c.description) normal(c.description);
          empty();
        }
        break;
      }
    }
  }

  if (paras.length === 0) empty();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2012/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2012/paragraph">
  <hs:secPr>
    <hs:pagePr orientation="Portrait" width="${A4_W}" height="${A4_H}" gutterType="Left">
      <hs:margin header="${M_HF}" footer="${M_HF}" gutter="0"
                 left="${M_LR}" right="${M_LR}" top="${M_TOP}" bottom="${M_BOT}"/>
    </hs:pagePr>
    <hs:footerIDRef foot="0" odd="0" even="0"/>
    <hs:headerIDRef head="0" odd="0" even="0"/>
  </hs:secPr>
${paras.join('\n')}
</hs:sec>`;
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * buildHwpx(appState, selections) → Promise<Blob>
 * Returns a Blob with MIME type application/hwp+zip.
 */
export async function buildHwpx(appState, selections) {
  const preset    = appState.stylePreset || {};
  const fontName  = preset.fontFamily || '함초롱바탕';
  const fontSize  = preset.fontSize   || 11;

  const printModel   = buildPrintModel(appState, selections, preset);
  const { projectTitle } = printModel;

  const zip = new JSZip();

  // mimetype must be first and uncompressed
  zip.file('mimetype', xmlMimetype(), { compression: 'STORE' });
  zip.file('META-INF/container.xml', xmlContainer());
  zip.file('Contents/content.hpf',   xmlContentHpf(projectTitle));
  zip.file('Contents/header.xml',    xmlHeader(fontName, fontSize));
  zip.file('Contents/section0.xml',  xmlSection(printModel));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip' });
}
