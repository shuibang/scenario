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
const A4_W    = 59528;
const A4_H    = 84188;
const MM_TO_HWP = 7200 / 25.4; // ≈ 283.46 HWP units per mm

function mmToHwp(mm) { return Math.round(mm * MM_TO_HWP); }

// ─── Sequential ID counter (reset per document) ─────────────────────────────
// HWPML: hp:p and all its children (pPr, run, pEnd) must each have a unique id.
let _pid = 0;
function resetIds() { _pid = 0; }

/**
 * Build one HWPX paragraph element.
 * text:    string | '' (empty paragraph)
 * cid:     charShape id reference (0=normal, 1=title, 2=heading)
 * parid:   paraShape id reference (0=normal, 1=center, 2=heading, 3=dialogue)
 * sid:     style id reference
 */
function para(text, { cid = 0, parid = 0, sid = 0 } = {}) {
  const pId = _pid++;
  // Always include an explicit hp:run so HWP respects charPr height (e.g. 11pt)
  // instead of falling back to its built-in default (10pt) for empty paragraphs.
  const tEl = text ? `<hp:t xml:space="preserve">${esc(text)}</hp:t>` : `<hp:t/>`;
  return `  <hp:p id="${pId}" paraPrIDRef="${parid}" styleIDRef="${sid}" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="${cid}">
      ${tEl}
    </hp:run>
  </hp:p>`;
}

/**
 * Dialogue paragraph — ONE run, ONE hp:t: name + TWO tabs + speech.
 * Matches real HWPX file structure exactly (verified from user's test file).
 * paraPr 3: hc:left=0 (name flush left on first line), hc:intent=dialogueTabHwp (continuation lines
 *   indent to speech start position). HWP interprets hc:left=first-line pos, hc:intent=continuation offset.
 */
function dialoguePara(charName, content) {
  const pId = _pid++;
  // Run 1 (bold): name + TWO tabs inside hp:t — tabs are children of hp:t (verified from real HWPX)
  // Run 2 (normal): speech text
  // paraPr 3: hc:left=0 (name flush left), hc:intent=dialogueTabHwp (continuation at speech position)
  return `  <hp:p id="${pId}" paraPrIDRef="3" styleIDRef="3" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="3">
      <hp:t xml:space="preserve">${esc(charName || '')}<hp:tab leader="0" type="1"/><hp:tab leader="0" type="1"/></hp:t>
    </hp:run>
    <hp:run charPrIDRef="0">
      <hp:t xml:space="preserve">${esc(content || '')}</hp:t>
    </hp:run>
  </hp:p>`;
}

// ─── XML file builders ───────────────────────────────────────────────────────
function xmlMimetype() {
  return 'application/hwp+zip';
}

function xmlManifest() {
  // Real HWPX manifest.xml is an empty self-closing element (verified from Skeleton.hwpx)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>`;
}

function xmlContainer() {
  // Must use ocf: prefix and media-type="application/hwpml-package+xml" (verified from Skeleton.hwpx)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container"
               xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">
  <ocf:rootfiles>
    <ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>
  </ocf:rootfiles>
</ocf:container>`;
}

function xmlVersion() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version"
    tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0"
    buildNumber="0" os="1" xmlVersion="1.31"
    application="대본 작업실" appVersion="1.0.0.0"/>`;
}

function xmlSettings() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"
                          xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">
  <ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>
</ha:HWPApplicationSetting>`;
}

function xmlContentHpf(title) {
  // hrefs are ZIP-root-relative (not relative to Contents/ folder) — verified from Skeleton.hwpx
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/"
             xmlns:dc="http://purl.org/dc/elements/1.1/"
             version="1.2.0.0" uniqueIdentifier="HWPXId">
  <opf:metadata>
    <opf:title>${esc(title)}</opf:title>
  </opf:metadata>
  <opf:manifest>
    <opf:item id="settings" href="settings.xml"          media-type="application/xml"/>
    <opf:item id="header"   href="Contents/header.xml"   media-type="application/xml"/>
    <opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/>
  </opf:manifest>
  <opf:spine>
    <opf:itemref idref="section0"/>
  </opf:spine>
</opf:package>`;
}

function xmlHeader(fontName, fontSizePt, dialogueTabHwp) {
  // HWPX height unit = 1/100 pt
  const normalH  = Math.round(fontSizePt * 100);
  const titleH   = Math.round(fontSizePt * 140);
  const headingH = Math.round(fontSizePt * 110);
  const halfGap  = Math.round(dialogueTabHwp / 2);

  const fontLangs = ['HANGUL','LATIN','HANJA','JAPANESE','OTHER','SYMBOL','USER'];

  // <hh:bold/> child element only — bold="1" attribute caused HWP to corrupt page orientation
  const charPr = (id, height, bold) => `      <hh:charPr id="${id}" height="${height}" textColor="#000000"
          useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
        <hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${bold ? '\n        <hh:bold/>' : ''}
      </hh:charPr>`;

  // hc:intent (NOT hc:indent) is the correct HWPX element for first-line indent/outdent.
  // Negative hc:intent = 내어쓰기 (hanging indent): first line starts before hc:left.
  const paraPr = (id, align, prevSp, nextSp, tabRef, leftMargin = 0, firstLineIndent = 0) => `      <hh:paraPr id="${id}" tabPrIDRef="${tabRef}" condense="0"
          fontLineHeight="0" snapToGrid="1" suppressLineNumbers="0" checked="0">
        <hh:align horizontal="${align}" vertical="BASELINE"/>
        <hh:heading type="NONE" idRef="0" level="0"/>
        <hh:breakSetting breakLatinWord="KEEP_WORD" breakNonLatinWord="KEEP_WORD"
            widowOrphan="0" keepWithNext="0" keepLines="0" pageBreakBefore="0" lineWrap="BREAK"/>
        <hh:autoSpacing eAsianEng="0" eAsianNum="0"/>
        <hh:margin>
          <hc:intent value="${firstLineIndent}" unit="HWPUNIT"/>
          <hc:left value="${leftMargin}" unit="HWPUNIT"/>
          <hc:right value="0" unit="HWPUNIT"/>
          <hc:prev value="${prevSp}" unit="HWPUNIT"/>
          <hc:next value="${nextSp}" unit="HWPUNIT"/>
        </hh:margin>
        <hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/>
        <hh:border borderFillIDRef="1" offsetLeft="0" offsetRight="0" offsetTop="0"
                   offsetBottom="0" connect="0" ignoreMargin="0"/>
      </hh:paraPr>`;

  // borderFill id starts at 1 (matching real HWPX files); attribute formats match real files.
  const borderFill = (id) => `      <hh:borderFill id="${id}" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0">
        <hh:slash type="NONE" Crooked="0" isCounter="0"/>
        <hh:backSlash type="NONE" Crooked="0" isCounter="0"/>
        <hh:leftBorder   type="NONE" width="0.1 mm" color="#000000"/>
        <hh:rightBorder  type="NONE" width="0.1 mm" color="#000000"/>
        <hh:topBorder    type="NONE" width="0.1 mm" color="#000000"/>
        <hh:bottomBorder type="NONE" width="0.1 mm" color="#000000"/>
        <hh:diagonal     type="NONE" width="0.1 mm" color="#000000"/>
      </hh:borderFill>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"
         xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"
         xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"
         version="1.5" secCnt="1">
  <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
  <hh:refList>
    <hh:fontfaces itemCnt="7">
${fontLangs.map(lang => `      <hh:fontface lang="${lang}" fontCnt="1">
        <hh:font id="0" face="${esc(fontName)}" type="TTF" isEmbedded="0"/>
      </hh:fontface>`).join('\n')}
    </hh:fontfaces>
    <hh:borderFills itemCnt="1">
${borderFill(1)}
    </hh:borderFills>
    <hh:charProperties itemCnt="4">
${charPr(0, normalH,  false)}
${charPr(1, titleH,   true)}
${charPr(2, headingH, true)}
${charPr(3, normalH,  true)}
    </hh:charProperties>
    <hh:tabProperties itemCnt="1">
      <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0">
        <hh:tabItem pos="${halfGap}" type="LEFT" leader="NONE" unit="HWPUNIT"/>
        <hh:tabItem pos="${dialogueTabHwp}" type="LEFT" leader="NONE" unit="HWPUNIT"/>
      </hh:tabPr>
    </hh:tabProperties>
    <hh:paraProperties itemCnt="7">
${paraPr(0, 'JUSTIFY', 0,   0,   0)}
${paraPr(1, 'CENTER',  300, 100, 0)}
${paraPr(2, 'JUSTIFY', 200, 0,   0)}
${paraPr(3, 'JUSTIFY', 0,   0,   0)}
${paraPr(4, 'JUSTIFY', 0,   0,   0, 2268)}
${paraPr(5, 'JUSTIFY', 0,   0,   0, dialogueTabHwp)}
${paraPr(6, 'RIGHT',   0,   0,   0)}
    </hh:paraProperties>
    <hh:styles itemCnt="4">
      <hh:style id="0" type="PARA" name="바탕글" engName="Normal"
        paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
      <hh:style id="1" type="PARA" name="제목"   engName="Title"
        paraPrIDRef="1" charPrIDRef="1" nextStyleIDRef="0" langID="1042" lockForm="0"/>
      <hh:style id="2" type="PARA" name="소제목" engName="Heading"
        paraPrIDRef="2" charPrIDRef="2" nextStyleIDRef="0" langID="1042" lockForm="0"/>
      <hh:style id="3" type="PARA" name="대사"   engName="Dialogue"
        paraPrIDRef="3" charPrIDRef="3" nextStyleIDRef="3" langID="1042" lockForm="0"/>
    </hh:styles>
  </hh:refList>
  <hh:compatibleDocument targetProgram="HWP2014"/>
  <hh:layoutCompatibility/>
</hh:head>`;
}

// ─── secPr control paragraph (must be first paragraph in every section) ──────
// Contains page setup, column layout, and lineseg metadata.
// Structure verified from Skeleton.hwpx: hp:secPr lives inside hp:run inside hp:p.
function secPrPara(margins) {
  const pId  = _pid++;
  const mTop = mmToHwp(margins.top);
  const mBot = mmToHwp(margins.bottom);
  const mLR  = mmToHwp(margins.left);
  return `  <hp:p id="${pId}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000"
                outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        <hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/>
        <hp:visibility hideFirstHeader="0" hideFirstFooter="0" hideFirstMasterPage="0"
                       border="SHOW_ALL" fill="SHOW_ALL" hideFirstPageNum="0"
                       hideFirstEmptyLine="0" showLineNumber="0"/>
        <hp:lineNumberShape restartType="0" countBy="0" distance="0" startNumber="0"/>
        <hp:pagePr landscape="WIDELY" width="${A4_W}" height="${A4_H}" gutterType="LEFT_ONLY">
          <hp:margin header="0" footer="0" gutter="0"
                     left="${mLR}" right="${mLR}" top="${mTop}" bottom="${mBot}"/>
        </hp:pagePr>
        <hp:footNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="-1" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="283" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="EACH_COLUMN" beneathText="0"/>
        </hp:footNotePr>
        <hp:endNotePr>
          <hp:autoNumFormat type="DIGIT" userChar="" prefixChar="" suffixChar=")" supscript="0"/>
          <hp:noteLine length="14692344" type="SOLID" width="0.12 mm" color="#000000"/>
          <hp:noteSpacing betweenNotes="0" belowLine="567" aboveLine="850"/>
          <hp:numbering type="CONTINUOUS" newNum="1"/>
          <hp:placement place="END_OF_DOCUMENT" beneathText="0"/>
        </hp:endNotePr>
        <hp:pageBorderFill type="BOTH" borderFillIDRef="0" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="0" right="0" top="0" bottom="0"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="EVEN" borderFillIDRef="0" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="0" right="0" top="0" bottom="0"/>
        </hp:pageBorderFill>
        <hp:pageBorderFill type="ODD" borderFillIDRef="0" textBorder="PAPER" headerInside="0" footerInside="0" fillArea="PAPER">
          <hp:offset left="0" right="0" top="0" bottom="0"/>
        </hp:pageBorderFill>
      </hp:secPr>
      <hp:ctrl>
        <hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/>
      </hp:ctrl>
    </hp:run>
    <hp:run charPrIDRef="0"><hp:t/></hp:run>
    <hp:linesegarray>
      <hp:lineseg textpos="0" vertpos="0" vertsize="1100" textheight="1100" baseline="935"
                  spacing="660" horzpos="0" horzsize="42520" flags="393216"/>
    </hp:linesegarray>
  </hp:p>`;
}

// ─── Section (body) XML ──────────────────────────────────────────────────────
function xmlSection(printModel, margins) {
  resetIds();

  const paras      = [];
  const empty      = ()       => paras.push(para(''));
  const pageBreak  = ()       => { const pId = _pid++; paras.push(`  <hp:p id="${pId}" paraPrIDRef="0" styleIDRef="0" pageBreak="1" columnBreak="0" merged="0"/>`); };
  const title      = (t)      => paras.push(para(t, { cid: 1, parid: 1, sid: 1 }));
  const head       = (t)      => paras.push(para(t, { cid: 2, parid: 2, sid: 2 }));
  const normal     = (t)      => paras.push(para(t));
  const action     = (t)      => paras.push(para(t, { cid: 0, parid: 4 }));
  const paren      = (t)      => paras.push(para(`(${t})`, { cid: 0, parid: 5 }));
  const transition = (t)      => paras.push(para(t, { cid: 0, parid: 6 }));
  const dialogue   = (n, c)   => paras.push(dialoguePara(n, c));

  const roleLabel = { lead: '주인공', support: '조연', extra: '단역' };

  let firstSection = true;
  for (const sec of printModel.sections) {
    if (!firstSection) pageBreak();
    firstSection = false;

    switch (sec.type) {
      case 'cover': {
        const subtitleField   = sec.fields.find(f => f.label === '부제목' || f.id === 'subtitle');
        const secondaryFields = sec.fields.filter(f => f !== subtitleField);
        empty(); empty(); empty();
        title(sec.title || '제목 없음');
        if (subtitleField) paras.push(para(subtitleField.value, { cid: 0, parid: 1 }));
        for (let i = 0; i < 8; i++) empty();
        for (const f of secondaryFields) {
          paras.push(para(`${f.label}: ${f.value}`, { cid: 0, parid: 1 }));
        }
        empty();
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
        let prevBlock = null;
        for (const block of sec.blocks) {
          // Add blank line only on type changes (same-type blocks flow without gaps)
          if (prevBlock !== null && prevBlock.type !== block.type) empty();
          switch (block.type) {
            case 'scene_number':
              head(`${block.label || ''} ${block.content || ''}`.trim());
              break;
            case 'action':
              if (block.content) block.content.split('\n').forEach(l => action(l));
              break;
            case 'dialogue':
              dialogue(block.charName, block.content);
              break;
            case 'parenthetical':
              if (block.content) paren(block.content);
              break;
            case 'transition':
              if (block.content) transition(block.content);
              break;
            default:
              if (block.content) normal(block.content);
          }
          prevBlock = block;
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

  // All standard HWPX namespaces on root element + secPr first paragraph (verified from Skeleton.hwpx)
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
        xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph"
        xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core"
        xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app"
        xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"
        xmlns:hhs="http://www.hancom.co.kr/hwpml/2011/headersection"
        xmlns:hm="http://www.hancom.co.kr/hwpml/2011/masterpage"
        xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"
        xmlns:opf="http://www.idpf.org/2007/opf/"
        xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0"
        xmlns:ooxmlchart="urn:schemas-microsoft-com:office:office"
        xmlns:hwpunitchar="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"
        xmlns:epub="http://www.idpf.org/2007/ops">
${secPrPara(margins)}
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
  // dialogueGap: em → pt → HWP units (1pt = 100 HWP units)
  const dialogueEm     = parseFloat(preset.dialogueGap || '7');
  const dialogueTabHwp = Math.round(dialogueEm * fontSize * 100);

  const margins      = preset.pageMargins ?? { top: 35, right: 30, bottom: 30, left: 30 };
  const printModel   = buildPrintModel(appState, selections, preset);
  const { projectTitle } = printModel;

  const zip = new JSZip();

  // mimetype must be first and uncompressed
  zip.file('mimetype', xmlMimetype(), { compression: 'STORE' });
  zip.file('version.xml',             xmlVersion());
  zip.file('settings.xml',            xmlSettings());
  zip.file('META-INF/manifest.xml',   xmlManifest());
  zip.file('META-INF/container.xml',  xmlContainer());
  zip.file('Contents/content.hpf',    xmlContentHpf(projectTitle));
  zip.file('Contents/header.xml',     xmlHeader(fontName, fontSize, dialogueTabHwp));
  zip.file('Contents/section0.xml',   xmlSection(printModel, margins));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip' });
}
