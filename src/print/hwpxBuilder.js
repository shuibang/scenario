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
const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, '');
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
 * HTML → 여러 hp:run 배열 (볼드/이탤릭/밑줄 인라인 서식 지원)
 * charPr IDs: 0=일반, 4=볼드, 5=이탤릭, 6=밑줄
 */
function htmlToRuns(html, baseCid = 0) {
  if (!html) return `    <hp:run charPrIDRef="${baseCid}"><hp:t/></hp:run>`;
  // <br> → 줄바꿈 문자 (HWPX는 hp:t 안에서 newline 지원 안 함 → 무시)
  const text = html.replace(/<br\s*\/?>/gi, ' ');
  // b/i/u 태그가 없으면 단일 run
  if (!/<[biu][\s>]/i.test(text)) {
    const plain = stripHtml(text);
    const tEl = plain ? `<hp:t xml:space="preserve">${esc(plain)}</hp:t>` : `<hp:t/>`;
    return `    <hp:run charPrIDRef="${baseCid}">${tEl}</hp:run>`;
  }
  // 태그 파싱 → run 분리
  const tagRe = /<(\/?)([biu])[^>]*>/gi;
  const stack = { b: 0, i: 0, u: 0 };
  const runs = [];
  let last = 0;
  let match;
  const flush = (raw) => {
    const plain = stripHtml(raw);
    if (!plain) return;
    // 서식 우선순위: 볼드 > 이탤릭 > 밑줄 > 기본
    const cid = stack.b > 0 ? 4
              : stack.i > 0 ? 5
              : stack.u > 0 ? 6
              : baseCid;
    runs.push(`    <hp:run charPrIDRef="${cid}"><hp:t xml:space="preserve">${esc(plain)}</hp:t></hp:run>`);
  };
  while ((match = tagRe.exec(text)) !== null) {
    flush(text.slice(last, match.index));
    last = match.index + match[0].length;
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    stack[tag] = closing ? Math.max(0, stack[tag] - 1) : stack[tag] + 1;
  }
  flush(text.slice(last));
  if (!runs.length) return `    <hp:run charPrIDRef="${baseCid}"><hp:t/></hp:run>`;
  return runs.join('\n');
}

/**
 * Build one HWPX paragraph element.
 * text:    string | '' (empty) or HTML string when html=true
 * cid:     charShape id reference (0=normal, 1=title, 2=heading, 3=bold-name)
 * parid:   paraShape id reference
 * sid:     style id reference
 * html:    true → parse inline b/i/u tags into multiple runs
 */
function para(text, { cid = 0, parid = 0, sid = 0, html = false } = {}) {
  const pId = _pid++;
  const runs = html
    ? htmlToRuns(text, cid)
    : (() => {
        const plain = stripHtml(text || '');
        const tEl = plain ? `<hp:t xml:space="preserve">${esc(plain)}</hp:t>` : `<hp:t/>`;
        return `    <hp:run charPrIDRef="${cid}">${tEl}</hp:run>`;
      })();
  return `  <hp:p id="${pId}" paraPrIDRef="${parid}" styleIDRef="${sid}" pageBreak="0" columnBreak="0" merged="0">
${runs}
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
  const speechRuns = htmlToRuns(content || '', 0);
  return `  <hp:p id="${pId}" paraPrIDRef="3" styleIDRef="3" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="3">
      <hp:t xml:space="preserve">${esc(stripHtml(charName || ''))}<hp:tab leader="0" type="1"/></hp:t>
    </hp:run>
${speechRuns}
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

  const fontLangs = ['HANGUL','LATIN','HANJA','JAPANESE','OTHER','SYMBOL','USER'];

  // charPr: 참조 파일 구조 기반 (fontRef hangul="1" = 지정 폰트 사용)
  // extra: 볼드/이탤릭/밑줄 자식 요소
  const charPr = (id, height, extra = '') => `      <hh:charPr id="${id}" height="${height}" textColor="#000000" shadeColor="none"
          useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1">
        <hh:fontRef hangul="1" latin="1" hanja="1" japanese="1" other="1" symbol="1" user="1"/>
        <hh:ratio hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:spacing hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>
        <hh:relSz hangul="100" latin="100" hanja="100" japanese="100" other="100" symbol="100" user="100"/>
        <hh:offset hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/>${extra}
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
    <hh:charProperties itemCnt="7">
${charPr(0, normalH,  '')}
${charPr(1, titleH,   '\n        <hh:bold/>')}
${charPr(2, headingH, '\n        <hh:bold/>')}
${charPr(3, normalH,  '\n        <hh:bold/>')}
${charPr(4, normalH,  '\n        <hh:bold/>')}
${charPr(5, normalH,  '\n        <hh:italic/>')}
${charPr(6, normalH,  '\n        <hh:underline type="BOTTOM" shape="SOLID" color="#000000"/>')}
    </hh:charProperties>
    <hh:tabProperties itemCnt="2">
      <hh:tabPr id="0" autoTabLeft="0" autoTabRight="0"/>
      <hh:tabPr id="1" autoTabLeft="0" autoTabRight="0">
        <hh:tabItem pos="${dialogueTabHwp}" type="LEFT" leader="NONE" unit="HWPUNIT"/>
      </hh:tabPr>
    </hh:tabProperties>
    <hh:paraProperties itemCnt="7">
${paraPr(0, 'JUSTIFY', 0,   0,   0)}
${paraPr(1, 'CENTER',  300, 100, 0)}
${paraPr(2, 'JUSTIFY', 0,   0,   0)}
${paraPr(3, 'JUSTIFY', 0,   0,   1, 0, -dialogueTabHwp)}
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

// ─── secPr control paragraph ────────────────────────────────────────────────
// resetPage=true: 이 구역부터 쪽번호 1로 리셋 (시놉시스/회차 첫 페이지)
// resetPage=false: 연속 쪽번호 (표지 등)
// coverPage=true: 쪽번호 ctrl 자체를 생략 (표지 전용)
function secPrPara(margins, { resetPage = false, coverPage = false } = {}) {
  const pId  = _pid++;
  const mTop = mmToHwp(margins.top);
  const mBot = mmToHwp(margins.bottom);
  const mLR  = mmToHwp(margins.left);
  // page="1" → 이 구역 첫 쪽을 1로 강제 / page="0" → 이전 구역에서 연속
  const pageNum = resetPage ? '1' : '0';
  const pageNumRun = coverPage ? '' : `
    <hp:run charPrIDRef="0">
      <hp:ctrl>
        <hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"/>
      </hp:ctrl>
      <hp:t/>
    </hp:run>`;
  return `  <hp:p id="${pId}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">
    <hp:run charPrIDRef="0">
      <hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000"
                outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0" masterPageCnt="0">
        <hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/>
        <hp:startNum pageStartsOn="BOTH" page="${pageNum}" pic="0" tbl="0" equation="0"/>
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
    </hp:run>${pageNumRun}
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

  // 표지는 쪽번호 없이, 나머지 섹션은 각각 1부터 리셋
  // 섹션 구분: pageBreak 단락 대신 새 secPrPara 삽입 (쪽번호 리셋 포함)
  let firstSection = true;
  for (const sec of printModel.sections) {
    if (!firstSection) {
      // 새 구역 시작 → secPrPara로 쪽번호 1부터 리셋 (표지는 쪽번호 없음)
      paras.push(secPrPara(margins, { resetPage: sec.type !== 'cover', coverPage: sec.type === 'cover' }));
    }
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
        if (sec.genre)  { head('장르');    empty(); normal(sec.genre);  empty(); }
        if (sec.theme)  { head('주제');    empty(); normal(sec.theme);  empty(); }
        if (sec.intent) { head('기획의도'); empty(); normal(sec.intent); empty(); }
        if (sec.story)  {
          head('줄거리');
          empty();
          sec.story.split('\n').forEach(line => {
            if (line.trim()) normal(line);
          });
          empty();
        }
        if (sec.characters?.length) {
          head('인물설정');
          empty();
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
        head(`${sec.episodeNumber}회${sec.episodeTitle ? ' ' + sec.episodeTitle : ''}`);
        const CONTENT_TYPES = new Set(['action', 'dialogue', 'parenthetical']);
        let prevBlock = null;
        for (const block of sec.blocks) {
          if (prevBlock !== null && prevBlock.type !== block.type
              && prevBlock.type !== 'scene_number'
              && !(CONTENT_TYPES.has(prevBlock.type) && CONTENT_TYPES.has(block.type))) {
            empty();
          }
          switch (block.type) {
            case 'scene_number':
              head(`${block.label || ''} ${block.content || ''}`.trim());
              break;
            case 'action':
              if (block.content) block.content.split('\n').forEach(l =>
                paras.push(para(l, { cid: 0, parid: 4, html: true }))
              );
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
${secPrPara(margins, { coverPage: printModel.sections[0]?.type === 'cover' })}
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
