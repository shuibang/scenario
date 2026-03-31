import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// CONFIG
// ============================================================
const TMDB_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TMDB_API_KEY) ||
  'a75fe4999b5b6edaa91591a6a7e95659';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';
const EXCLUDED_GENRE_IDS = new Set([10764, 10767, 10763, 99, 10766, 10768]);
const DRAMA_GENRE_ID = 18;
const EXCLUDED_KW = ['예능','리얼리티','토크쇼','뉴스','다큐','reality','talk show','game show','variety'];

const ROMCOM_ID = 99001; // 가상 ID: 로맨스 코미디 (35+10749 조합)

const GENRE_NAMES = {
  18:'드라마', 80:'범죄', 9648:'미스터리', 10765:'SF·판타지',
  35:'코미디', 10749:'로맨스', 28:'액션', 53:'스릴러',
  27:'호러', 14:'판타지', 878:'SF', 10751:'가족', 16:'애니',
  [ROMCOM_ID]:'로맨스 코미디',
};

const NEBULA_PALETTE = {
  18:    {p:'#6d28d9',s:'#1e3a8a',c:'#c084fc'},
  80:    {p:'#b45309',s:'#7c2d12',c:'#fb923c'},
  9648:  {p:'#1e40af',s:'#1e1b4b',c:'#60a5fa'},
  10765: {p:'#0e7490',s:'#134e4a',c:'#22d3ee'},
  35:    {p:'#92400e',s:'#78350f',c:'#fbbf24'},
  10749: {p:'#9d174d',s:'#831843',c:'#f472b6'},
  28:    {p:'#991b1b',s:'#7f1d1d',c:'#f87171'},
  53:    {p:'#312e81',s:'#1e1b4b',c:'#818cf8'},
  27:    {p:'#581c87',s:'#3b0764',c:'#c084fc'},
  14:    {p:'#5b21b6',s:'#4c1d95',c:'#a78bfa'},
  878:   {p:'#065f46',s:'#064e3b',c:'#34d399'},
  10751: {p:'#78350f',s:'#451a03',c:'#fbbf24'},
  16:    {p:'#164e63',s:'#0c4a6e',c:'#67e8f9'},
  [ROMCOM_ID]: {p:'#7c154a',s:'#4a0829',c:'#f9a8d4'},
};
const getNPal = g => NEBULA_PALETTE[g] || {p:'#4c1d95',s:'#1e1b4b',c:'#a78bfa'};

// 로맨스 코미디 키워드 감지
const ROMCOM_KW = ['연애','사랑','로맨스','결혼','커플','썸','첫사랑','남친','여친','전남친','전여친','소개팅','신혼'];
const isRomcomText = text => ROMCOM_KW.some(kw => text.includes(kw));

// 코미디+로맨스 또는 코미디+연애키워드 → 로맨스 코미디 ID로 치환한 표시용 장르 배열
const resolveGenreDisplay = (genreIds=[], text='') => {
  if(genreIds.includes(35)&&genreIds.includes(10749))
    return [ROMCOM_ID,...genreIds.filter(g=>g!==35&&g!==10749)];
  if(genreIds.includes(35)&&!genreIds.includes(10749)&&isRomcomText(text))
    return [ROMCOM_ID,...genreIds.filter(g=>g!==35)];
  return genreIds;
};

// ============================================================
// HELPERS
// ============================================================
const buildPosterUrl   = (path, size='w342') => path ? `${TMDB_IMG}/${size}${path}` : null;
const buildBackdropUrl = (path, size='w780') => path ? `${TMDB_IMG}/${size}${path}` : null;

const isDramaLike = show => {
  const genres = show.genre_ids || show.genres?.map(g=>g.id) || [];
  if (!genres.includes(DRAMA_GENRE_ID)) return false;
  if (genres.some(id => EXCLUDED_GENRE_IDS.has(id))) return false;
  const text = `${show.name||''} ${show.overview||''}`.toLowerCase();
  return !EXCLUDED_KW.some(kw => text.includes(kw));
};

// 장르별 키워드 맵 — hybrid classification
const GENRE_KW = {
  80:    ['범죄','살인','형사','수사','마약','갱단','경찰','검사','조직','사건','범인'],
  9648:  ['추리','미스터리','실종','미제','비밀','의혹','진실','수수께끼','단서'],
  10765: ['판타지','마법','이세계','초능력','귀신','시간여행','우주','SF','신비'],
  53:    ['스릴러','긴장','도망','추격','음모','위협','심리','공포','납치'],
  27:    ['귀신','호러','유령','괴물','저주','공포','오컬트'],
  10751: ['가족','치유','성장','위로','삶','일상','휴먼','따뜻'],
  28:    ['액션','전쟁','격투','무술','폭발','싸움'],
  [ROMCOM_ID]: ROMCOM_KW,
};

// 텍스트에서 장르 키워드 점수가 가장 높은 장르 반환 (없으면 null)
const inferGenreByKeyword = (text, candidates) => {
  let best = null, bestScore = 0;
  candidates.forEach(gId => {
    const kws = GENRE_KW[gId] || [];
    const score = kws.filter(kw=>text.includes(kw)).length;
    if(score > bestScore){ best=gId; bestScore=score; }
  });
  return bestScore >= 1 ? best : null;
};

// 서브장르 우선 분류. 코미디+로맨스 또는 코미디+키워드 → ROMCOM_ID
// TMDB 장르 + 키워드 hybrid
const primaryGenre = show => {
  const g = show.genres || show.genre_ids || [];
  const text = `${show.title||''} ${show.originalTitle||''} ${show.overview||''}`.toLowerCase();
  if(g.includes(35)&&g.includes(10749)) return ROMCOM_ID;
  if(g.includes(35)&&isRomcomText(text)) return ROMCOM_ID;
  const sub = g.filter(id => id !== DRAMA_GENRE_ID);
  // TMDB 서브장르가 있으면 그 중 키워드 가장 강한 것 우선
  if(sub.length > 0){
    const kw = inferGenreByKeyword(text, sub);
    return kw || sub[0];
  }
  // 드라마만 있으면 키워드로 장르 추론
  const allGenres = [80,9648,10765,53,27,10751,28];
  const inferred = inferGenreByKeyword(text, allGenres);
  return inferred || (g[0] || DRAMA_GENRE_ID);
};

const pseudoMood = genreIds => {
  const M = {
    18:{x:0,y:0,z:0},       80:{x:-0.7,y:-0.5,z:-0.3}, 9648:{x:-0.8,y:-0.4,z:-0.2},
    10765:{x:0.2,y:0.3,z:0.8}, 35:{x:0.3,y:0.8,z:0},   10749:{x:0.9,y:0.6,z:0.1},
    28:{x:-0.3,y:-0.2,z:0},    53:{x:-0.5,y:-0.6,z:0.1}, 27:{x:-0.1,y:-0.8,z:0.3},
    14:{x:0.4,y:0.5,z:0.9},  878:{x:-0.4,y:0,z:0.9},  10751:{x:0.7,y:0.8,z:-0.1},
    16:{x:0.5,y:0.7,z:0.2},
  };
  if (!genreIds?.length) return {x:(Math.random()-0.5)*1.5,y:(Math.random()-0.5)*1.5,z:(Math.random()-0.5)*1.5};
  let x=0,y=0,z=0,n=0;
  genreIds.forEach(id=>{if(M[id]){x+=M[id].x;y+=M[id].y;z+=M[id].z;n++;}});
  if(n){x/=n;y/=n;z/=n;}
  const seed=(genreIds[0]||0)*0.001;
  x+=Math.sin(seed*137.5)*0.3; y+=Math.cos(seed*137.5)*0.3; z+=Math.sin(seed*97.3)*0.3;
  const cl=v=>Math.max(-1,Math.min(1,v));
  return {x:cl(x),y:cl(y),z:cl(z)};
};

const normalizeShow = show => {
  const genres = show.genre_ids || show.genres?.map(g=>g.id) || [];
  const mood   = pseudoMood(genres);
  const crew   = show.credits?.crew || [];
  const cast   = show.credits?.cast || [];
  const createdBy = (show.created_by||[]).map(p=>p.name);
  // 감독: job=Director 최우선 → Directing 부서 → createdBy는 crew가 아예 없을 때만
  const directorCrew = crew.filter(p=>p.job==='Director').map(p=>p.name);
  const directorDept = directorCrew.length===0
    ? [...new Set(crew.filter(p=>p.department==='Directing'&&p.job!=='Script Supervisor').map(p=>p.name))]
    : [];
  // created_by → 감독 fallback: crew 전혀 없을 때만, 최대 1명
  const directorCreatedBy = (directorCrew.length===0&&directorDept.length===0&&crew.length===0)
    ? createdBy.slice(0,1) : [];
  const directors = [...new Set([...directorCrew,...directorDept,...directorCreatedBy])].slice(0,3);

  // 작가: Writing 직군 우선 → createdBy는 writer crew가 없을 때만, 감독과 중복 제외
  const writerJobs = ['Writer','Screenplay','Story','Novel','Script Editor','Creator'];
  const writerCrew = [...new Set(
    crew.filter(p=>writerJobs.includes(p.job)||p.department==='Writing').map(p=>p.name)
  )];
  const writerCreatedBy = writerCrew.length===0
    ? createdBy.filter(n=>!directors.includes(n)).slice(0,2)
    : [];
  const writers = [...new Set([...writerCrew,...writerCreatedBy])].slice(0,3);
  return {
    id: show.id, mediaType:'drama',
    title: show.name||show.original_name||'',
    originalTitle: show.original_name||'',
    overview: show.overview||'',
    posterPath:show.poster_path||null, backdropPath:show.backdrop_path||null,
    genres, rating:show.vote_average||0, voteCount:show.vote_count||0,
    firstAirDate:show.first_air_date||'', popularity:show.popularity||0,
    originCountry:show.origin_country||[],
    sceneX:mood.x, sceneY:mood.y, sceneZ:mood.z,
    directors, writers, cast:cast.slice(0,10).map(p=>p.name), comments:[],
  };
};

const mapToScene    = item => ({x:item.sceneX*520, y:item.sceneY*380, z:item.sceneZ*440});
const rotatePoint   = (pt, yaw, pitch) => {
  const cy=Math.cos(yaw),sy=Math.sin(yaw);
  const x1=pt.x*cy+pt.z*sy, z1=-pt.x*sy+pt.z*cy;
  const cp=Math.cos(pitch),sp=Math.sin(pitch);
  return {x:x1, y:pt.y*cp-z1*sp, z:pt.y*sp+z1*cp};
};
const projectPoint  = (pt, fov=850) => {
  const z=pt.z+fov, scale=fov/Math.max(z,1);
  return {screenX:pt.x*scale, screenY:pt.y*scale, scale, z:pt.z};
};
const getCardPos    = (sx,sy,vpW,vpH,cW=220,cH=290) => {
  let left=sx+22, top=sy-90;
  if(left+cW>vpW-10) left=sx-cW-22;
  if(top+cH>vpH-10) top=vpH-cH-10;
  if(top<10) top=10; if(left<10) left=10;
  return {left,top};
};
const getTouchDist  = ts => {
  const dx=ts[0].clientX-ts[1].clientX, dy=ts[0].clientY-ts[1].clientY;
  return Math.sqrt(dx*dx+dy*dy);
};

// ============================================================
// CATMULL-ROM CLOSED SPLINE
// ============================================================
function catmullRomClosed(pts, tension=0.28) {
  const n=pts.length;
  if(n<2) return '';
  if(n===2){
    const a=pts[0],b=pts[1];
    const dx=b.screenX-a.screenX,dy=b.screenY-a.screenY;
    const len=Math.sqrt(dx*dx+dy*dy)||1,off=len*0.35;
    const c1x=(a.screenX+b.screenX)/2-(dy/len)*off,c1y=(a.screenY+b.screenY)/2+(dx/len)*off;
    const c2x=(a.screenX+b.screenX)/2+(dy/len)*off,c2y=(a.screenY+b.screenY)/2-(dx/len)*off;
    return `M${a.screenX},${a.screenY} Q${c1x},${c1y} ${b.screenX},${b.screenY} Q${c2x},${c2y} ${a.screenX},${a.screenY}Z`;
  }
  let d=`M${pts[0].screenX},${pts[0].screenY}`;
  for(let i=0;i<n;i++){
    const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
    const cp1x=p1.screenX+(p2.screenX-p0.screenX)*tension;
    const cp1y=p1.screenY+(p2.screenY-p0.screenY)*tension;
    const cp2x=p2.screenX-(p3.screenX-p1.screenX)*tension;
    const cp2y=p2.screenY-(p3.screenY-p1.screenY)*tension;
    d+=` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.screenX},${p2.screenY}`;
  }
  return d+'Z';
}

// ============================================================
// ORBITAL POSITIONS
// ============================================================
function computeOrbitalPositions(groups) {
  const map = {};
  groups.forEach(group => {
    const members=group.members, n=members.length;
    if(n<1) return;
    const gcx=group.cx, gcy=group.cy;
    const baseR=Math.min(210,Math.max(65,(group.spread||80)*0.85+28));
    // 최신작 → inner orbit (날짜 내림차순 정렬)
    const sorted=[...members].sort((a,b)=>(b.firstAirDate||'').localeCompare(a.firstAirDate||''));
    sorted.forEach((m,i)=>{
      const ringFrac = n>1 ? i/(n-1) : 0.5;
      const rx = baseR*(0.38+0.62*ringFrac); // inner 38% ~ outer 100%
      const fantasy=m.sceneZ||0;
      const ry = rx*(0.46+Math.abs(fantasy)*0.1);
      const angle = (2*Math.PI*i/n)-Math.PI/2;
      const tilt = ((m.id*137)%30-15)*(Math.PI/180); // deterministic tilt ±15°
      const cosA=Math.cos(angle),sinA=Math.sin(angle),cosT=Math.cos(tilt),sinT=Math.sin(tilt);
      map[m.id]={
        x:gcx+rx*cosA*cosT-ry*sinA*sinT,
        y:gcy+rx*cosA*sinT+ry*sinA*cosT,
        rx,ry,angle,tilt,gcx,gcy,
      };
    });
  });
  return map;
}

// ============================================================
// FOCUS ORBIT LAYOUT — actor/director/writer 포커스 시 multi-ring 분산 배치
// ============================================================
const FOCUS_RINGS = [75, 145, 215, 285]; // ring별 반지름(px)
const FOCUS_MAX_PER_RING = 6;            // ring당 최대 작품 수

function computeFocusOrbits(members, cx, cy) {
  const result = {};
  if(!members.length) return result;
  // id 기준 deterministic 정렬
  const sorted = [...members].sort((a,b)=>a.id-b.id);
  sorted.forEach((m, i)=>{
    const ringIdx = Math.floor(i / FOCUS_MAX_PER_RING);
    const posInRing = i % FOCUS_MAX_PER_RING;
    const countInRing = Math.min(FOCUS_MAX_PER_RING, sorted.length - ringIdx*FOCUS_MAX_PER_RING);
    const r = FOCUS_RINGS[Math.min(ringIdx, FOCUS_RINGS.length-1)];
    const baseAngle = (2*Math.PI*posInRing/countInRing) - Math.PI/2;
    // deterministic jitter: id 해시로 tiny angle offset
    const jitter = ((m.id*2654435761)>>>0) % 1000 / 1000 * 0.25 - 0.125;
    const angle = baseAngle + jitter;
    result[m.id] = { x: cx + r*Math.cos(angle), y: cy + r*Math.sin(angle) };
  });
  return result;
}

// ============================================================
// PERSON ORBIT LAYOUT — 최신작 안쪽 궤도 (배우/감독/작가 포커스 시)
// ============================================================
const PERSON_RINGS = [60, 110, 165, 225, 280]; // inner(최신) → outer(구작)

function computePersonOrbits(members, cx, cy) {
  const result = {};
  if(!members.length) return result;
  // firstAirDate 내림차순 정렬: 최신작이 앞 → inner ring
  const sorted = [...members].sort((a,b)=>(b.firstAirDate||'').localeCompare(a.firstAirDate||''));
  sorted.forEach((m, i)=>{
    const ringIdx = Math.floor(i / FOCUS_MAX_PER_RING);
    const posInRing = i % FOCUS_MAX_PER_RING;
    const countInRing = Math.min(FOCUS_MAX_PER_RING, sorted.length - ringIdx*FOCUS_MAX_PER_RING);
    const r = PERSON_RINGS[Math.min(ringIdx, PERSON_RINGS.length-1)];
    const baseAngle = (2*Math.PI*posInRing/countInRing) - Math.PI/2;
    const jitter = ((m.id*2654435761)>>>0) % 1000 / 1000 * 0.2 - 0.1;
    const angle = baseAngle + jitter;
    result[m.id] = { x: cx + r*Math.cos(angle), y: cy + r*Math.sin(angle), r, angle };
  });
  return result;
}

// ============================================================
// FOCUSED SYSTEM ORBIT — 뷰포트 중심 기준 대형 태양계 궤도 배치
// ============================================================
const FOCUS_SYS_RINGS = [95, 165, 240, 315, 390];

function computeSystemFocusOrbits(members, vcx, vcy) {
  const result = {};
  if(!members.length) return result;
  const sorted = [...members].sort((a,b)=>(b.firstAirDate||'').localeCompare(a.firstAirDate||''));
  sorted.forEach((m, i) => {
    const ringIdx    = Math.floor(i / FOCUS_MAX_PER_RING);
    const posInRing  = i % FOCUS_MAX_PER_RING;
    const countInRing= Math.min(FOCUS_MAX_PER_RING, sorted.length - ringIdx*FOCUS_MAX_PER_RING);
    const r = FOCUS_SYS_RINGS[Math.min(ringIdx, FOCUS_SYS_RINGS.length-1)];
    // ring별 공통 기울기 (도식 정렬감)
    const tilt = ((ringIdx*53 + 17) % 36 - 18) * (Math.PI/180);
    const baseAngle = (2*Math.PI*posInRing/countInRing) - Math.PI/2;
    const jitter = ((m.id*2654435761)>>>0) % 1000 / 1000 * 0.12 - 0.06;
    const angle  = baseAngle + jitter;
    const rx = r, ry = r * 0.46;
    const cosA=Math.cos(angle), sinA=Math.sin(angle);
    const cosT=Math.cos(tilt),  sinT=Math.sin(tilt);
    result[m.id] = {
      cx: vcx, cy: vcy,
      rx, ry, angle, tilt, r,
      x: vcx + rx*cosA*cosT - ry*sinA*sinT,
      y: vcy + rx*cosA*sinT + ry*sinA*cosT,
    };
  });
  return result;
}

// System center spread — 항성계 간 최소 거리 강제 (겹침 방지 + 분산)
function spreadSystemCenters(groups, vpW, vpH, minDist=140) {
  if(!groups.length) return groups;
  const pts = groups.map(g=>({...g, cx:g.cx, cy:g.cy}));
  const cx0 = vpW/2, cy0 = vpH/2;
  // repulsion iterations
  for(let iter=0; iter<60; iter++){
    let moved = false;
    for(let i=0;i<pts.length;i++){
      for(let j=i+1;j<pts.length;j++){
        const dx=pts[j].cx-pts[i].cx, dy=pts[j].cy-pts[i].cy;
        const dist=Math.sqrt(dx*dx+dy*dy)||1;
        if(dist<minDist){
          const push=(minDist-dist)/2+1;
          const nx=dx/dist, ny=dy/dist;
          pts[i].cx-=nx*push; pts[i].cy-=ny*push;
          pts[j].cx+=nx*push; pts[j].cy+=ny*push;
          moved=true;
        }
      }
    }
    if(!moved) break;
  }
  // clamp to viewport with margin
  const mx=70, my=70;
  pts.forEach(p=>{
    p.cx=Math.max(mx, Math.min(vpW-mx, p.cx));
    p.cy=Math.max(my+40, Math.min(vpH-my, p.cy));
  });
  return pts;
}

// 인물 작품들의 장르 비율에서 대표 색상 도출
function deriveSystemColor(memberShows) {
  const cnt = {};
  memberShows.forEach(s => { const g=primaryGenre(s); cnt[g]=(cnt[g]||0)+1; });
  const top = Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
  return top ? (STAR_COLOR[Number(top[0])]||'#c4b5fd') : '#c4b5fd';
}
function deriveSystemGlow(memberShows) {
  const cnt = {};
  memberShows.forEach(s => { const g=primaryGenre(s); cnt[g]=(cnt[g]||0)+1; });
  const top = Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
  return top ? (STAR_GLOW[Number(top[0])]||'#7c3aed') : '#7c3aed';
}
// 장르 비율 기반 color stops — 구형 텍스처에 사용
function deriveColorStops(memberShows) {
  const cnt = {};
  memberShows.forEach(s => { const g=primaryGenre(s); cnt[g]=(cnt[g]||0)+1; });
  const total = memberShows.length || 1;
  return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,3)
    .map(([g,n])=>({color:STAR_COLOR[Number(g)]||'#c4b5fd',glow:STAR_GLOW[Number(g)]||'#7c3aed',ratio:n/total}));
}
// 감독/작가용 — 전체 장르 비율(최대 5) + 밝기 성향(brightnessFactor 0=어두움, 1=밝음)
function derivePersonColorStops(memberShows) {
  const cnt = {};
  memberShows.forEach(s => { const g=primaryGenre(s); cnt[g]=(cnt[g]||0)+1; });
  const total = memberShows.length || 1;
  const avgY = memberShows.reduce((acc,s) => acc + pseudoMood(s.genres||[]).y, 0) / total;
  const brightnessFactor = Math.max(0, Math.min(1, (avgY + 1) / 2)); // 0=dark, 1=bright
  const stops = Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([g,n])=>({color:STAR_COLOR[Number(g)]||'#c4b5fd',glow:STAR_GLOW[Number(g)]||'#7c3aed',ratio:n/total}));
  return {stops, brightnessFactor, dominantColor:stops[0]?.color||'#c4b5fd', dominantGlow:stops[0]?.glow||'#7c3aed'};
}

// ============================================================
// FALLBACK DATA
// ============================================================
const FALLBACK_SHOWS = [
  {id:1001,mediaType:'drama',title:'나의 아저씨',originalTitle:'My Mister',overview:'세상의 무게를 묵묵히 견뎌온 중년 남자와 가혹한 삶을 꿋꿋이 살아온 청년 여자가 서로를 바라보며 위로받는 이야기.',posterPath:null,backdropPath:null,genres:[18],rating:9.2,voteCount:8400,firstAirDate:'2018-03-21',popularity:95,originCountry:['KR'],sceneX:0.1,sceneY:-0.7,sceneZ:-0.5,directors:['김원석'],writers:['박해영'],cast:['이선균','아이유','박호산','오나라','송새벽'],comments:[{id:1,user:'starlight_j',text:'인생작입니다.',createdAt:'2024-12-01'}]},
  {id:1002,mediaType:'drama',title:'무빙',originalTitle:'Moving',overview:'남다른 능력을 숨기며 살아가던 아이들이 자신들의 부모가 숨겨온 과거와 마주하게 되는 이야기.',posterPath:null,backdropPath:null,genres:[18,28,878],rating:8.8,voteCount:5200,firstAirDate:'2023-08-09',popularity:88,originCountry:['KR'],sceneX:-0.3,sceneY:0.2,sceneZ:0.8,directors:['박인제'],writers:['강풀'],cast:['류승룡','한효주','조인성','고윤정','이정하'],comments:[{id:1,user:'cosmic_k',text:'국내 슈퍼히어로물의 새 역사.',createdAt:'2024-10-05'}]},
  {id:1003,mediaType:'drama',title:'선재 업고 튀어',originalTitle:'Lovely Runner',overview:'죽음을 앞둔 팬이 타임슬립으로 과거로 돌아가 아이돌 스타의 운명을 바꾸려는 이야기.',posterPath:null,backdropPath:null,genres:[18,10749,10765],rating:8.9,voteCount:4800,firstAirDate:'2024-04-08',popularity:92,originCountry:['KR'],sceneX:0.8,sceneY:0.6,sceneZ:0.7,directors:['윤종호'],writers:['이시은'],cast:['변우석','김혜윤','송건희','전효성'],comments:[{id:1,user:'aurora_b',text:'설레임 폭발!',createdAt:'2024-08-01'}]},
  {id:1004,mediaType:'drama',title:'시그널',originalTitle:'Signal',overview:'과거와 현재를 연결하는 무전기를 통해 미제 사건을 해결하는 형사들의 이야기.',posterPath:null,backdropPath:null,genres:[18,9648,80],rating:9.0,voteCount:7100,firstAirDate:'2016-01-22',popularity:86,originCountry:['KR'],sceneX:-0.7,sceneY:-0.4,sceneZ:0.3,directors:['김원석'],writers:['김은희'],cast:['이제훈','김혜수','조진웅'],comments:[{id:1,user:'detective_m',text:'역대급 미스터리.',createdAt:'2024-06-15'}]},
  {id:1005,mediaType:'drama',title:'비밀의 숲',originalTitle:'Stranger',overview:'감정이 없는 검사와 따뜻한 형사가 함께 검찰 내부의 비리를 파헤치는 이야기.',posterPath:null,backdropPath:null,genres:[18,9648,80,53],rating:9.1,voteCount:6800,firstAirDate:'2017-06-10',popularity:89,originCountry:['KR'],sceneX:-0.8,sceneY:-0.3,sceneZ:-0.6,directors:['조현탁'],writers:['이수연'],cast:['조승우','배두나','유재명','이준혁'],comments:[{id:1,user:'forest_w',text:'완성도 최고.',createdAt:'2024-04-10'}]},
  {id:1006,mediaType:'drama',title:'도깨비',originalTitle:'Goblin',overview:'939년간 불멸의 삶을 살아온 도깨비와 신부를 자처하는 소녀 사이의 신비로운 사랑 이야기.',posterPath:null,backdropPath:null,genres:[18,10749,14],rating:8.7,voteCount:9200,firstAirDate:'2016-12-02',popularity:94,originCountry:['KR'],sceneX:0.5,sceneY:0.1,sceneZ:0.9,directors:['이응복'],writers:['김은숙'],cast:['공유','김고은','이동욱','유인나','육성재'],comments:[{id:1,user:'goblin_fan',text:'지금도 명작.',createdAt:'2024-02-14'}]},
  {id:1007,mediaType:'drama',title:'이상한 변호사 우영우',originalTitle:'Extraordinary Attorney Woo',overview:'자폐 스펙트럼 장애를 가진 천재 변호사 우영우의 성장 이야기.',posterPath:null,backdropPath:null,genres:[18,35],rating:8.8,voteCount:5900,firstAirDate:'2022-06-29',popularity:87,originCountry:['KR'],sceneX:0.4,sceneY:0.7,sceneZ:0.2,directors:['유인식'],writers:['문지원'],cast:['박은빈','강태오','강기영','하윤경'],comments:[]},
  {id:1008,mediaType:'drama',title:'사랑의 불시착',originalTitle:'Crash Landing on You',overview:'패러글라이딩 사고로 북한에 불시착한 재벌 상속녀와 북한 장교의 사랑 이야기.',posterPath:null,backdropPath:null,genres:[18,10749,35],rating:8.7,voteCount:7300,firstAirDate:'2019-12-14',popularity:91,originCountry:['KR'],sceneX:0.7,sceneY:0.5,sceneZ:0.1,directors:['이정효'],writers:['박지은'],cast:['현빈','손예진','김정현','서지혜'],comments:[]},
];

// ============================================================
// SEEDED COMMENT THREAD DATA
// ============================================================
const SEEDED_COMMENTS_BY_WORK = {
  1001:[
    {id:'c1',user:'달빛독자',avatar:'🌙',text:'감정선이 정말 깊어요. 중년의 무게를 이렇게 표현할 수 있다니.',createdAt:'3일 전',likes:28,
     replies:[
       {id:'r1',user:'밤하늘별',avatar:'⭐',text:'저도 힘들 때 다시 봐요. 위로가 많이 됐어요.',createdAt:'2일 전',likes:8},
       {id:'r2',user:'코스모스_k',avatar:'✨',text:'이선균 배우 연기가 진짜 인생 연기.',createdAt:'1일 전',likes:5},
     ]},
    {id:'c2',user:'새벽독서가',avatar:'📖',text:'박해영 작가 특유의 대사들이 마음에 박혀요. "어른이 되면 괜찮아진다고 했는데"',createdAt:'1주 전',likes:15,replies:[]},
    {id:'c3',user:'드라마헌터99',avatar:'🎬',text:'10년에 한 번 나올 작품. 역대 드라마 탑3 안에 넣는 편.',createdAt:'2주 전',likes:41,replies:[
      {id:'r3',user:'행성여행자',avatar:'🪐',text:'탑3는 어떻게 되시나요? 궁금해요!',createdAt:'2주 전',likes:2},
    ]},
  ],
  1002:[
    {id:'c4',user:'슈퍼히어로팬',avatar:'⚡',text:'국내 슈퍼히어로물의 새 역사. OTT 드라마의 가능성을 보여줬어요.',createdAt:'5일 전',likes:33,replies:[
      {id:'r4',user:'무빙클럽',avatar:'🌊',text:'봉석이 날아다니는 씬에서 소름 돋았어요.',createdAt:'4일 전',likes:11},
    ]},
    {id:'c5',user:'별빛산책',avatar:'🌠',text:'부모 세대 이야기가 생각보다 더 깊이 들어왔어요.',createdAt:'3일 전',likes:19,replies:[]},
  ],
  1003:[
    {id:'c6',user:'설레임주의보',avatar:'💗',text:'타임슬립 로맨스의 교과서. 변우석 배우 덕분에 입덕함',createdAt:'1일 전',likes:52,replies:[
      {id:'r5',user:'선재야미안',avatar:'🌸',text:'저도 여기서 입덕했어요 ㅠㅠ',createdAt:'18시간 전',likes:14},
      {id:'r6',user:'타임슬립러버',avatar:'⏰',text:'류선재 OST가 드라마 보는 내내 귓가에 맴돌아요.',createdAt:'12시간 전',likes:9},
    ]},
  ],
  1004:[
    {id:'c7',user:'미스터리추',avatar:'🔍',text:'무전기 설정 하나로 이렇게 몰입감을 만들다니. 2025년에 다시 봐도 긴장감 그대로.',createdAt:'4일 전',likes:37,replies:[]},
    {id:'c8',user:'형사장르러버',avatar:'🔦',text:'김은희 작가는 역시 장르물의 신이야.',createdAt:'1주 전',likes:22,replies:[
      {id:'r7',user:'시그널은영원해',avatar:'📻',text:'그래서 시즌2 달라고 10년째 외치는 중....',createdAt:'6일 전',likes:48},
    ]},
  ],
  1005:[
    {id:'c9',user:'법정드라마킹',avatar:'⚖️',text:'조승우 배두나 두 배우의 케미가 완벽했어요. 감정 없는 캐릭터가 오히려 더 울리는 이유.',createdAt:'2일 전',likes:29,replies:[]},
  ],
};

const SEEDED_COMMENTS_BY_SYSTEM = {
  'genre-18':[
    {id:'sc1',user:'드라마덕후',avatar:'🎭',text:'드라마 항성계에서 제일 빛나는 별은 역시 나의 아저씨. 두 번 세 번 봐도 새로워요.',createdAt:'2일 전',likes:31,replies:[
      {id:'sr1',user:'감성충만',avatar:'💜',text:'저는 비밀의 숲도 그 못지않다고 생각해요.',createdAt:'1일 전',likes:12},
    ]},
    {id:'sc2',user:'별빛리뷰어',avatar:'🌟',text:'드라마 장르는 범위가 넓어서 보석 같은 작품이 정말 많아요. 이 항성계는 탐험이 끝이 없어.',createdAt:'5일 전',likes:18,replies:[]},
  ],
  'genre-9648':[
    {id:'sc3',user:'미스터리헌터',avatar:'🕵️',text:'미스터리 항성계 작품들은 하나같이 엔딩에서 충격을 줘요. 시그널, 비밀의숲, 모두 명작.',createdAt:'3일 전',likes:24,replies:[]},
  ],
  'director-김원석':[
    {id:'sc4',user:'김원석팬클럽',avatar:'🎬',text:'김원석 감독 항성계에서 나의 아저씨와 시그널 둘 다 있다는 게 놀라워요. 믿고 보는 감독.',createdAt:'1일 전',likes:19,replies:[
      {id:'sr2',user:'드라마일기',avatar:'📓',text:'다음 작품이 뭔지 너무 궁금해요.',createdAt:'14시간 전',likes:7},
    ]},
  ],
  'writer-박해영':[
    {id:'sc5',user:'박해영작가팬',avatar:'✍️',text:'박해영 항성계는 인생 드라마 제조기. 나의 아저씨를 쓴 작가가 또 무엇을 쓸지 기대돼요.',createdAt:'3일 전',likes:27,replies:[]},
  ],
};

// ============================================================
// STAR COLORS
// ============================================================
const STAR_COLOR = {18:'#ddd6fe',80:'#fdba74',9648:'#93c5fd',10765:'#6ee7b7',35:'#fde68a',10749:'#fbcfe8',28:'#fca5a5',53:'#c7d2fe',27:'#e9d5ff',14:'#ddd6fe',878:'#a7f3d0',[ROMCOM_ID]:'#f9a8d4'};
const STAR_GLOW  = {18:'#7c3aed',80:'#c2410c',9648:'#1e40af',10765:'#0e7490',35:'#92400e',10749:'#9d174d',28:'#991b1b',53:'#312e81',27:'#581c87',14:'#5b21b6',878:'#065f46',[ROMCOM_ID]:'#be185d'};
// show 객체 기준으로 primaryGenre 사용 → 시스템 분류와 색상 일치
const getStarColor = g => (!g?.length?'#e2d9f3':STAR_COLOR[g[0]]||'#ddd6fe');
const getStarGlow  = g => (!g?.length?'#7c3aed':STAR_GLOW[g[0]]||'#7c3aed');
const getShowColor = show => { const pg=primaryGenre(show); return STAR_COLOR[pg]||'#ddd6fe'; };
const getShowGlow  = show => { const pg=primaryGenre(show); return STAR_GLOW[pg]||'#7c3aed'; };

// ============================================================
// GALAXY BACKGROUND — 사진적 깊은 우주 + parallax
// ============================================================
function GalaxyBackground({ showCount, isOrbitMode, isMobile, yaw, pitch }) {
  // 별을 3개 레이어(far/mid/near)로 나눠 parallax 적용
  const farCount  = isMobile ? 28  : 160;
  const midCount  = isMobile ? 16  : 100;
  const nearCount = isMobile ? 6   : 40;

  const farStars = useMemo(()=>Array.from({length:farCount},(_,i)=>({
    id:`f${i}`, x:Math.random()*100, y:Math.random()*100,
    sz:Math.random()*0.35+0.1, op:Math.random()*0.18+0.05, delay:Math.random()*12,
  })),[farCount]);
  const midStars = useMemo(()=>Array.from({length:midCount},(_,i)=>{
    const bright=Math.random()>0.88;
    return {id:`m${i}`, x:Math.random()*100, y:Math.random()*100,
      sz:bright?Math.random()*1.1+0.6:Math.random()*0.55+0.22,
      op:bright?Math.random()*0.35+0.45:Math.random()*0.28+0.12,
      twinkle:bright, delay:Math.random()*9, bright};
  }),[midCount]);
  const nearStars = useMemo(()=>Array.from({length:nearCount},(_,i)=>({
    id:`n${i}`, x:Math.random()*100, y:Math.random()*100,
    sz:Math.random()*1.6+1.2, op:Math.random()*0.3+0.65,
    delay:Math.random()*6,
  })),[nearCount]);

  // 성운 패치 — 더 사진적이고 풍부한 색감
  const bgClouds = useMemo(()=>[
    // 보라/남색 대형 성운
    {cx:15,cy:18,rx:460,ry:280,c1:'rgba(88,28,195,0.38)',c2:'rgba(36,10,90,0.14)',rot:-18},
    // 청록 성운
    {cx:80,cy:12,rx:500,ry:310,c1:'rgba(6,100,110,0.35)',c2:'rgba(3,45,55,0.12)',rot:12},
    // 황금/앰버 성운
    {cx:88,cy:68,rx:380,ry:260,c1:'rgba(160,52,8,0.30)', c2:'rgba(70,22,4,0.11)', rot:38},
    // 분홍/자홍 성운
    {cx:22,cy:80,rx:450,ry:270,c1:'rgba(110,20,100,0.32)',c2:'rgba(50,8,48,0.12)', rot:-8},
    // 중심 은하 코어 (깊고 진한 파랑)
    {cx:50,cy:50,rx:600,ry:350,c1:'rgba(12,20,65,0.22)', c2:'rgba(6,10,30,0.08)', rot:3},
    // 붉은/주홍 nebula streak
    {cx:30,cy:35,rx:300,ry:150,c1:'rgba(200,40,20,0.18)',c2:'rgba(90,18,8,0.07)', rot:-22},
    // 밝은 파랑/흰 성단 후광
    {cx:65,cy:28,rx:220,ry:180,c1:'rgba(100,160,240,0.16)',c2:'rgba(40,70,130,0.06)',rot:15},
    // 심청 성간 필라멘트
    {cx:5, cy:55,rx:320,ry:400,c1:'rgba(14,45,120,0.28)',c2:'rgba(7,22,65,0.09)', rot:-28},
    // 녹청/시안 가스 구름
    {cx:60,cy:88,rx:480,ry:240,c1:'rgba(10,120,140,0.26)',c2:'rgba(5,55,70,0.09)', rot:18},
    // 황토/금빛 성운 띠
    {cx:38,cy:22,rx:260,ry:140,c1:'rgba(190,110,20,0.14)',c2:'rgba(90,50,8,0.05)', rot:5},
  ],[]);

  // parallax offset — 레이어별 감도 차이로 깊이감 (모바일: 정적)
  const pxFar  = isMobile ? {x:0,y:0} : { x: yaw  * 1.5 * 100, y: pitch * 1.5 * 100 };
  const pxMid  = isMobile ? {x:0,y:0} : { x: yaw  * 4.0 * 100, y: pitch * 4.0 * 100 };
  const pxNear = isMobile ? {x:0,y:0} : { x: yaw  * 8.5 * 100, y: pitch * 8.5 * 100 };
  const pxCloud= isMobile ? {x:0,y:0} : { x: yaw  * 0.8 * 100, y: pitch * 0.8 * 100 };
  // 모바일: 성운 레이어 4개만, PC: 전체 10개
  const visibleClouds = isMobile ? bgClouds.slice(0,4) : bgClouds;

  const orbitDim = isOrbitMode ? 0.42 : 1;

  return (
    <div className="absolute inset-0 overflow-hidden" style={{zIndex:1}}>
      {/* 성운 패치 레이어 */}
      {visibleClouds.map((c,i)=>(
        <div key={i} className="absolute pointer-events-none" style={{
          left:`${c.cx}%`, top:`${c.cy}%`,
          width:c.rx*2, height:c.ry*2,
          transform:`translate(calc(-50% + ${pxCloud.x*0.3}px), calc(-50% + ${pxCloud.y*0.3}px)) rotate(${c.rot}deg)`,
          background:`radial-gradient(ellipse at center,${c.c1} 0%,${c.c2} 42%,transparent 68%)`,
          borderRadius:'50%',
          opacity:orbitDim, transition:'opacity 1s ease',
        }}/>
      ))}
      {/* Far stars — 가장 먼 레이어, 거의 안 움직임 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{transform:`translate(${pxFar.x * 0.01}px, ${pxFar.y * 0.01}px)`}}>
        {farStars.map(s=>(
          <div key={s.id} className="absolute rounded-full" style={{
            left:`${s.x}%`, top:`${s.y}%`, width:s.sz, height:s.sz,
            background:'rgba(200,215,255,0.9)', opacity:s.op * orbitDim,
          }}/>
        ))}
      </div>
      {/* Mid stars — 트윙클 포함 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{transform:`translate(${pxMid.x * 0.01}px, ${pxMid.y * 0.01}px)`}}>
        {midStars.map(s=>(
          <motion.div key={s.id} className="absolute rounded-full" style={{
            left:`${s.x}%`, top:`${s.y}%`, width:s.sz, height:s.sz,
            background:'white', opacity:s.op * orbitDim,
            boxShadow:(!isMobile&&s.bright)?`0 0 ${s.sz*2.5}px ${s.sz*1.3}px rgba(200,220,255,0.55)`:undefined,
          }}
            animate={(!isMobile&&s.twinkle)?{opacity:[s.op*orbitDim,s.op*0.12*orbitDim,s.op*0.8*orbitDim,s.op*0.2*orbitDim,s.op*orbitDim]}:{}}
            transition={{duration:5+s.delay,repeat:Infinity,ease:'easeInOut'}}
          />
        ))}
      </div>
      {/* Near stars — 가장 앞, 크고 밝음 */}
      <div className="absolute inset-0 pointer-events-none"
        style={{transform:`translate(${pxNear.x * 0.01}px, ${pxNear.y * 0.01}px)`}}>
        {nearStars.map(s=>(
          <motion.div key={s.id} className="absolute rounded-full" style={{
            left:`${s.x}%`, top:`${s.y}%`, width:s.sz, height:s.sz,
            background:'white', opacity:s.op * orbitDim,
            boxShadow:isMobile ? undefined : `0 0 ${s.sz*3}px ${s.sz*1.5}px rgba(210,228,255,0.6), 0 0 ${s.sz*6}px rgba(180,205,255,0.22)`,
          }}
            animate={isMobile ? {} : {opacity:[s.op*orbitDim, s.op*0.6*orbitDim, s.op*orbitDim]}}
            transition={{duration:3+s.delay, repeat:Infinity, ease:'easeInOut'}}
          />
        ))}
      </div>
      {/* 장르 궤도 모드 구조 가독성을 위한 dim veil */}
      {isOrbitMode&&(
        <div className="absolute inset-0 pointer-events-none"
          style={{background:'rgba(3,2,12,0.35)',transition:'opacity 1s ease'}}/>
      )}
    </div>
  );
}

// ============================================================
// GENRE HAZE LAYER — 은하수 band 형태 성운 (장르 선택 시 해당 장르만)
// ============================================================
function GenreHazeLayer({ genreNebulae, focusedGenreKey }) {
  // 포커스 있으면 해당 장르만, 없으면 전체
  const visible = focusedGenreKey
    ? genreNebulae.filter(n => String(n.genre) === focusedGenreKey)
    : genreNebulae;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:3}}>
      <defs>
        {visible.map(n=>{
          const pal=getNPal(n.genre);
          return (
            <radialGradient key={`rg-h-${n.genre}`} id={`rg-h-${n.genre}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={pal.c} stopOpacity="0.048"/>
              <stop offset="38%"  stopColor={pal.p} stopOpacity="0.022"/>
              <stop offset="72%"  stopColor={pal.p} stopOpacity="0.007"/>
              <stop offset="100%" stopColor={pal.p} stopOpacity="0"/>
            </radialGradient>
          );
        })}
      </defs>
      {/* 장르 중심 주변의 local galaxy cloud — stripe 금지, 국소 타원만 */}
      {visible.map(n=>(
        <ellipse key={n.genre} cx={n.x} cy={n.y}
          rx={n.r*0.88} ry={n.r*0.56}
          fill={`url(#rg-h-${n.genre})`}/>
      ))}
    </svg>
  );
}

// ============================================================
// PER-STAR GENRE TINT — 작품별 초미세 장르색 배경 (별보다 훨씬 약하게)
// ============================================================
function PerStarGenreTint({ shows, orbitalPositions, orbitStrength }) {
  const palIds = useMemo(()=>{const s=new Set();shows.forEach(sh=>s.add(primaryGenre(sh)));return[...s];},[shows]);
  const items  = useMemo(()=>shows.map(sh=>{
    const op=orbitalPositions[sh.id];
    const sx=op?sh.screenX+(op.x-sh.screenX)*orbitStrength:sh.screenX;
    const sy=op?sh.screenY+(op.y-sh.screenY)*orbitStrength:sh.screenY;
    return{id:sh.id,sx,sy,gId:primaryGenre(sh)};
  }),[shows,orbitalPositions,orbitStrength]);
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:4}}>
      <defs>
        {palIds.map(gId=>{
          const pal=getNPal(gId);
          return(
            <radialGradient key={`pst-${gId}`} id={`pst-${gId}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={pal.p} stopOpacity="0.10"/>
              <stop offset="55%" stopColor={pal.p} stopOpacity="0.03"/>
              <stop offset="100%" stopColor={pal.p} stopOpacity="0"/>
            </radialGradient>
          );
        })}
      </defs>
      {items.map(it=>(
        <ellipse key={it.id} cx={it.sx} cy={it.sy} rx={22} ry={14}
          fill={`url(#pst-${it.gId})`}/>
      ))}
    </svg>
  );
}

// ============================================================
// STAR SYSTEM LAYER — 궤도 밴드 + 장르명 중심 (장르 모드에서만)
// ============================================================
function StarSystemLayer({ genreGroupsAll, genreOrbPosAll, personGroupsAll, connectionGroups, connectionMode, highlightColor, orbitStrength, onNameClick, focusedGroupKey, isMobile=false }) {
  const isGenreMode = connectionMode === 'genre';
  const isPersonMode = connectionMode==='director'||connectionMode==='writer';
  const hasFocus = !!focusedGroupKey;
  return (
    <svg className="absolute inset-0 w-full h-full" style={{zIndex:8,pointerEvents:'none'}}>
      <defs>
        <filter id="sf-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* 감독/작가 모드 — 배경 system center dot only (orbit 제거) */}
      {isPersonMode && personGroupsAll.map(group=>{
        const isFocusedGroup = connectionGroups.length>0 && connectionGroups[0].key===group.key;
        if(isFocusedGroup) return null;
        const isThisFocused = hasFocus && focusedGroupKey===group.key;
        const baseOp = hasFocus ? (isThisFocused?0.88:0.04) : 0.45;
        return (
          <g key={`pg-${group.key}`} opacity={baseOp}>
            <circle cx={group.cx} cy={group.cy} r={2.5}
              fill={group.color} fillOpacity="0.4" style={{pointerEvents:'none'}}/>
          </g>
        );
      })}

      {genreGroupsAll.map(group=>{
        const gId=Number(group.key), pal=getNPal(gId), name=GENRE_NAMES[gId]||'';
        const memberOrbs=group.members.map(m=>genreOrbPosAll[m.id]).filter(Boolean);
        const bands=[];
        if(memberOrbs.length>0){
          const rxVals=memberOrbs.map(o=>o.rx).sort((a,b)=>a-b);
          const avgAspect=memberOrbs.reduce((s,o)=>s+o.ry/Math.max(o.rx,1),0)/memberOrbs.length;
          const avgTiltDeg=memberOrbs.reduce((s,o)=>s+(o.tilt||0),0)/memberOrbs.length*(180/Math.PI);
          const aspect=Math.max(0.38,Math.min(0.62,avgAspect));
          [0.2,0.55,0.85].forEach((q,i)=>{
            const rx=rxVals[Math.floor((rxVals.length-1)*q)]||rxVals[0];
            if(rx>18) bands.push({rx,ry:rx*aspect,tiltDeg:avgTiltDeg+i*5,i});
          });
        }
        const isFocusedGroup = hasFocus && focusedGroupKey===String(gId);
        const groupDim = hasFocus && !isFocusedGroup ? 0.05 : 1;
        return (
          <g key={`sys-${group.key}`} opacity={groupDim}
            style={{filter:hasFocus&&!isFocusedGroup?'saturate(0.08) blur(0.5px)':'none',transition:'opacity 0.5s,filter 0.5s'}}>
            {/* orbit 제거 — 별 배치 구조로만 항성계 표현 */}
          </g>
        );
      })}

      {/* 인물 포커스 — 중심 영역 희미한 ring (텍스트/sphere는 DOM에서 렌더) */}
      {!['none','genre','watched'].includes(connectionMode) && connectionGroups.map(group=>(
        <g key={group.key} style={{pointerEvents:'none'}}>
          <circle cx={group.cx} cy={group.cy} r={42} fill="none"
            stroke={connectionMode==='actor'?'#fbbf24':connectionMode==='director'?'#c4b5fd':'#6ee7b7'}
            strokeOpacity="0.07" strokeWidth="0.7" strokeDasharray="2 8"/>
        </g>
      ))}
    </svg>
  );
}

// ============================================================
// OPEN CATMULL-ROM SPLINE (for routes)
// ============================================================
function catmullRomOpen(pts, tension=0.4) {
  const n=pts.length;
  if(n<2) return '';
  let d=`M${pts[0].screenX},${pts[0].screenY}`;
  for(let i=0;i<n-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(n-1,i+2)];
    d+=` C${p1.screenX+(p2.screenX-p0.screenX)*tension},${p1.screenY+(p2.screenY-p0.screenY)*tension} ${p2.screenX-(p3.screenX-p1.screenX)*tension},${p2.screenY-(p3.screenY-p1.screenY)*tension} ${p2.screenX},${p2.screenY}`;
  }
  return d;
}

// ============================================================
// WATCHED ROUTE LAYER — 이미 본 작품 항로 (장르 색상 그라디언트)
// ============================================================
function WatchedRouteLayer({ shows, watchedMap, highlightColor, showRoute }) {
  const watchedShows=useMemo(()=>
    shows.filter(s=>watchedMap[s.id]).sort((a,b)=>(a.firstAirDate||'').localeCompare(b.firstAirDate||'')),
    [shows,watchedMap]
  );
  const pathD=useMemo(()=>catmullRomOpen(watchedShows),[watchedShows]);
  if(!showRoute||watchedShows.length<2) return null;
  const first=watchedShows[0], last=watchedShows[watchedShows.length-1];
  const c1=getStarColor(first.genres), c2=getStarColor(last.genres);
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:9}}>
      <defs>
        <filter id="route-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <linearGradient id="wr-grad" x1={first.screenX} y1={first.screenY} x2={last.screenX} y2={last.screenY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c1}/>
          <stop offset="100%" stopColor={c2}/>
        </linearGradient>
      </defs>
      <path d={pathD} fill="none" stroke={highlightColor} strokeWidth="10" strokeOpacity="0.05" strokeLinecap="round" filter="url(#route-glow)"/>
      <path d={pathD} fill="none" stroke="url(#wr-grad)" strokeWidth="1.4" strokeOpacity="0.32" strokeLinecap="round"/>
      <path d={pathD} fill="none" stroke="url(#wr-grad)" strokeWidth="0.7" strokeOpacity="0.7" strokeLinecap="round" strokeDasharray="3 20"/>
      {watchedShows.map((s,i)=>{
        const sc=getStarColor(s.genres);
        return (
          <g key={s.id}>
            <circle cx={s.screenX} cy={s.screenY} r="5.5" fill={sc} fillOpacity="0.07"/>
            <circle cx={s.screenX} cy={s.screenY} r="1.8" fill={sc} fillOpacity="0.8"/>
            {i===watchedShows.length-1&&<circle cx={s.screenX} cy={s.screenY} r="4.5" fill="none" stroke={sc} strokeWidth="0.7" strokeOpacity="0.45"/>}
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// EXPEDITION ROUTE LAYER — 보고 싶은 작품 탐사 계획 경로
// ============================================================
function ExpeditionRouteLayer({ shows, wantMap, showRoute }) {
  const wantShows=useMemo(()=>
    shows.filter(s=>wantMap[s.id]).sort((a,b)=>(a.firstAirDate||'').localeCompare(b.firstAirDate||'')),
    [shows,wantMap]
  );
  const pathD=useMemo(()=>catmullRomOpen(wantShows),[wantShows]);
  if(!showRoute||wantShows.length<2) return null;
  const first=wantShows[0], last=wantShows[wantShows.length-1];
  const c1=getStarColor(first.genres), c2=getStarColor(last.genres);
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:9}}>
      <defs>
        <linearGradient id="exp-grad" x1={first.screenX} y1={first.screenY} x2={last.screenX} y2={last.screenY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={c1}/>
          <stop offset="100%" stopColor={c2}/>
        </linearGradient>
      </defs>
      {/* 점선 + 아직 가지 않은 탐사 경로 느낌 */}
      <path d={pathD} fill="none" stroke="url(#exp-grad)" strokeWidth="1" strokeOpacity="0.22" strokeLinecap="round" strokeDasharray="6 12"/>
      <path d={pathD} fill="none" stroke="url(#exp-grad)" strokeWidth="0.5" strokeOpacity="0.5" strokeLinecap="round" strokeDasharray="2 16"/>
      {wantShows.map((s,i)=>{
        const sc=getStarColor(s.genres);
        return (
          <g key={s.id}>
            <circle cx={s.screenX} cy={s.screenY} r="5" fill="none" stroke={sc} strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="2 3"/>
            <circle cx={s.screenX} cy={s.screenY} r="1.5" fill={sc} fillOpacity="0.5"/>
            {i===0&&<circle cx={s.screenX} cy={s.screenY} r="7" fill="none" stroke={sc} strokeWidth="0.5" strokeOpacity="0.2"/>}
          </g>
        );
      })}
    </svg>
  );
}

// ============================================================
// STAR NODE — drama planet
// ============================================================
function StarNode({ show, isWatched, isWanted, isDimmed, isFocused, watchedColor, isHovered, isSelected, onHover, onClick, onLongPress, isMobile, focusPlanetMult=3.2, focusZIndex=9000, depthMode=false }) {
  const sz=useMemo(()=>{
    const sc=Math.max(0.5,Math.min(2.2,show.proj.scale));
    const base=Math.max(2.5,Math.min(10,3.2*sc*(1+show.popularity*0.0012)));
    return isFocused ? base*focusPlanetMult : base;
  },[show.proj.scale,show.popularity,isFocused,focusPlanetMult]);
  const color=isWatched?watchedColor:getShowColor(show);
  const glow =isWatched?watchedColor:getShowGlow(show);
  const active=isHovered||isSelected||isFocused;
  const lpRef=useRef(null), movedRef=useRef(false);

  const handleTouchStart=useCallback(e=>{
    e.stopPropagation(); movedRef.current=false;
    lpRef.current=setTimeout(()=>{if(!movedRef.current) onLongPress(show.id);},450);
  },[show.id,onLongPress]);
  const handleTouchMove=useCallback(()=>{
    movedRef.current=true;
    if(lpRef.current){clearTimeout(lpRef.current);lpRef.current=null;}
  },[]);
  const handleTouchEnd=useCallback(e=>{
    e.stopPropagation();
    if(lpRef.current){clearTimeout(lpRef.current);lpRef.current=null;if(!movedRef.current) onClick(show.id);}
  },[show.id,onClick]);

  // hit area: 모바일 최소 44px, PC 최소 28px
  const hitSz = isMobile ? Math.max(44, sz*5) : Math.max(28, sz*4);

  return (
    <motion.div className="absolute" style={{
      left:show.screenX,top:show.screenY,transform:'translate(-50%,-50%)',
      zIndex:isFocused?focusZIndex:Math.round(show.proj.z+1000),cursor:'pointer',
      pointerEvents:isDimmed?'none':'auto',
      width:hitSz, height:hitSz, display:'flex', alignItems:'center', justifyContent:'center',
      // position 변경(orbit spread) 시 CSS transition으로 부드럽게
      transition:(isFocused||isDimmed)?'left 0.7s cubic-bezier(0.25,0.46,0.45,0.94),top 0.7s cubic-bezier(0.25,0.46,0.45,0.94)':'',
    }}
      animate={{
        opacity: isDimmed ? 0.008 : isFocused ? 1.0
          : depthMode ? Math.max(0.32, Math.min(1.0, (show.proj.scale - 0.18) / 0.7))
          : (show.depthAlpha??1),
        scale: isDimmed ? 0.25
          : depthMode && !isFocused ? Math.max(0.65, Math.min(1.0, show.proj.scale * 0.55 + 0.42))
          : 1.0,
        filter: isDimmed ? 'blur(2px)'
          : depthMode && !isFocused && show.proj.scale < 0.65 ? `blur(${((0.65 - show.proj.scale) * 1.6).toFixed(1)}px)`
          : 'blur(0px)',
      }}
      transition={{duration:0.45, ease:[0.25,0.46,0.45,0.94]}}
      whileHover={!isMobile?{scale:1.5}:{}}
      onMouseEnter={!isMobile?()=>onHover(show.id):undefined}
      onMouseLeave={!isMobile?()=>onHover(null):undefined}
      onClick={!isMobile?(e=>{e.stopPropagation();onClick(show.id);}):undefined}
      onMouseDown={e=>e.stopPropagation()}
      onTouchStart={isMobile?handleTouchStart:undefined}
      onTouchMove={isMobile?handleTouchMove:undefined}
      onTouchEnd={isMobile?handleTouchEnd:undefined}>
      {/* 별 시각 요소들 — flex center 안에서 absolute로 별 중심 기준 배치 */}
      {/* focus 강조 링 — PC only, 반경 축소 */}
      {isFocused&&!isMobile&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:sz*7,height:sz*7,marginLeft:-sz*3.5,marginTop:-sz*3.5,top:'50%',left:'50%',
          background:`radial-gradient(circle,${glow}55 0%,${glow}22 45%,transparent 75%)`,
          border:`1px solid ${glow}60`,boxShadow:`0 0 ${sz*2.5}px ${glow}55`}}
        initial={{opacity:0,scale:0.4}} animate={{opacity:1,scale:[0.96,1.04,0.96]}}
        transition={{duration:1.8,repeat:Infinity,ease:'easeInOut'}}/>}
      {(isSelected||isFocused)&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:sz*4,height:sz*4,marginLeft:-sz*2,marginTop:-sz*2,top:'50%',left:'50%',background:`radial-gradient(circle,${glow}22 0%,transparent 70%)`}}
        initial={{opacity:0,scale:0.7}} animate={{opacity:1,scale:1}} exit={{opacity:0}}/>}
      {isWatched&&(isSelected||isFocused)&&!isMobile&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:sz*5,height:sz*5,marginLeft:-sz*2.5,marginTop:-sz*2.5,top:'50%',left:'50%',background:`radial-gradient(circle,${watchedColor}40 0%,transparent 65%)`}}
        animate={{opacity:[0.6,1,0.6],scale:[0.95,1.05,0.95]}} transition={{duration:2.5,repeat:Infinity}}/>}
      {isWanted&&!isWatched&&!isMobile&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:sz*4.5,height:sz*4.5,marginLeft:-sz*2.25,marginTop:-sz*2.25,top:'50%',left:'50%',
          border:'0.8px dashed rgba(251,191,36,0.5)',boxSizing:'border-box'}}
        animate={{rotate:[0,360]}} transition={{duration:18,repeat:Infinity,ease:'linear'}}/>}
      <motion.div className="rounded-full pointer-events-none" style={{width:sz,height:sz,flexShrink:0,
        background:`radial-gradient(circle at 38% 32%,rgba(255,255,255,0.92),${color})`,
        boxShadow:isSelected
          ?(isMobile?`0 0 ${sz*1.8}px ${glow}bb,0 0 ${sz*0.6}px rgba(255,255,255,0.8)`:`0 0 ${sz*2}px ${glow}dd,0 0 ${sz*4}px ${glow}44,0 0 ${sz}px rgba(255,255,255,0.9)`)
          :isFocused
          ?(isMobile?`0 0 ${sz*1.2}px ${glow}66`:`0 0 ${sz*1.5}px ${glow}88,0 0 ${sz*3}px ${glow}22`)
          :isHovered?`0 0 ${sz*0.6}px ${glow}18`
          :'none',
      }}
        animate={{}}
        transition={{}}/>
      {(isSelected||isHovered||(isFocused&&!isDimmed))&&<motion.div className="absolute whitespace-nowrap pointer-events-none"
        style={{
          top:'100%',
          left:'50%',transform:'translateX(-50%)',
          marginTop: isSelected||(isFocused&&isHovered) ? 6 : 3,
          color: isSelected||(isFocused&&isHovered)
            ?'rgba(255,255,255,0.95)'
            :isHovered
            ?'rgba(255,255,255,0.82)'
            :'rgba(255,255,255,0.42)',
          textShadow: isSelected||(isFocused&&isHovered)
            ?`0 0 10px ${glow},0 1px 6px rgba(0,0,0,0.95)`
            :'0 1px 4px rgba(0,0,0,0.85)',
          letterSpacing:'0.02em',
          fontWeight: isSelected||(isFocused&&isHovered) ? 700 : 400,
          fontSize: isSelected?'11.5px': (isFocused&&isHovered)?'11px': isFocused?'8px':'10px',
        }}
        initial={{opacity:0,y:-2}} animate={{opacity:1,y:0}}>
        {show.title}
      </motion.div>}
    </motion.div>
  );
}

// ============================================================
// SYSTEM CENTER NODE — 항성계 중심 구형 천체 (클릭 가능)
// ============================================================
function SystemCenterNode({ label, cx, cy, color, glow, colorStops=[], size=36, onClick, zIndex=12, isFocused=false, brightnessFactor=0.5, isMobile=false }) {
  const stops = colorStops.length ? colorStops : [{color,glow,ratio:1}];
  const [c0,c1,c2,c3,c4] = [stops[0], stops[1]||stops[0], stops[2]||stops[0], stops[3]||stops[0], stops[4]||stops[0]];
  // deterministic band angle from label
  const bandAngle = ((label.charCodeAt(0)||65)*137+label.length*29)%180;
  const p1 = Math.round(c0.ratio*100);
  const p2 = Math.round(p1+(c1.ratio||0)*100);
  const p3 = Math.round(p2+(c2.ratio||0)*100);
  // specular brightness based on brightnessFactor
  const specAlpha = (0.38 + brightnessFactor * 0.38).toFixed(2);
  const shadowAlpha = ((1 - brightnessFactor) * 0.55 + 0.15).toFixed(2);
  // 5-layer textured sphere: band + shadow pool + specular + tint strip + base
  const sphereBg = stops.length >= 3 ? [
    `radial-gradient(circle at 28% 20%, rgba(255,255,255,${specAlpha}) 0%, transparent 38%)`,
    `radial-gradient(ellipse at 68% 80%, rgba(0,0,0,${shadowAlpha}) 0%, transparent 50%)`,
    `radial-gradient(ellipse at 30% 72%, ${c3.glow}40 0%, transparent 40%)`,
    `linear-gradient(${bandAngle}deg, ${c0.color}dd 0%, ${c1.color}99 ${p1}%, ${c2.color}77 ${p2}%, ${c3.color}55 ${p3}%, ${c4.glow}33 100%)`,
    `radial-gradient(circle at 50% 50%, ${c0.color}ee 0%, ${c1.color}99 35%, ${c2.color}66 60%, ${glow}55 100%)`,
  ].join(', ') : [
    `radial-gradient(circle at 28% 20%, rgba(255,255,255,0.62) 0%, transparent 40%)`,
    `radial-gradient(ellipse at 65% 78%, ${c0.glow||glow}60 0%, transparent 52%)`,
    `linear-gradient(${bandAngle}deg, ${c0.color}cc 0%, ${c1.color}88 ${p1}%, ${c2.color}55 ${p2}%, ${c0.glow}44 100%)`,
    `radial-gradient(circle at 50% 50%, ${c0.color}ee 0%, ${c1.color}99 45%, ${glow}77 100%)`,
  ].join(', ');
  return (
    <motion.div className="absolute"
      style={{left:cx,top:cy,transform:'translate(-50%,-50%)',zIndex,cursor:'pointer',
        width:size*2.8,height:size*2.8,display:'flex',alignItems:'center',justifyContent:'center',
        pointerEvents:'auto'}}
      onMouseDown={e=>e.stopPropagation()}
      onTouchStart={e=>{e.stopPropagation();}}
      onClick={e=>{e.stopPropagation();onClick&&onClick();}}>
      {/* 성운 외곽 후광 — focused + PC only */}
      {isFocused&&!isMobile&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:size*5,height:size*5,
          background:`radial-gradient(circle,${c0.glow||glow}30 0%,${c0.glow||glow}12 45%,transparent 70%)`}}
        animate={{scale:[1,1.06,1],opacity:[0.35,0.65,0.35]}}
        transition={{duration:6.0,repeat:Infinity,ease:'easeInOut'}}/>}
      {/* 내부 링 — PC only */}
      {!isMobile&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:size*2.0,height:size*2.0,
          border:`${isFocused?1.5:0.6}px solid ${color}${isFocused?'55':'1a'}`,
          boxShadow:isFocused?`0 0 ${size*0.5}px ${glow}30`:'none'}}
        animate={{rotate:[0,360]}} transition={{duration:isFocused?55:180,repeat:Infinity,ease:'linear'}}/>}
      {/* 외부 링 — PC + focused 전용 */}
      {isFocused&&!isMobile&&<motion.div className="absolute rounded-full pointer-events-none"
        style={{width:size*2.8,height:size*2.8,
          border:`0.8px solid ${color}2a`}}
        animate={{rotate:[360,0]}} transition={{duration:38,repeat:Infinity,ease:'linear'}}/>}
      {/* 구형 본체 */}
      <div className="relative rounded-full flex items-center justify-center overflow-hidden"
        style={{
          width:size*1.55,height:size*1.55,
          background:sphereBg,
          boxShadow:isFocused
            ?(isMobile?`0 0 ${size*0.6}px ${c0.glow||glow}cc,inset 0 1px 3px rgba(255,255,255,0.25)`:`0 0 ${size*0.9}px ${c0.glow||glow}ee,0 0 ${size*2}px ${glow}55,0 0 ${size*3.5}px ${glow}1a,inset 0 1px 4px rgba(255,255,255,0.35),inset 0 -2px 6px rgba(0,0,0,0.5)`)
            :`0 0 ${size*0.25}px ${c0.glow||glow}44,inset 0 1px 2px rgba(255,255,255,0.15),inset 0 -1px 4px rgba(0,0,0,0.35)`,
          border:`1px solid ${color}${isFocused?'80':'35'}`,
        }}>
        {/* 줄무늬 오버레이 */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background:`repeating-linear-gradient(${bandAngle+90}deg,transparent 0px,transparent ${size*0.18}px,rgba(255,255,255,0.04) ${size*0.18}px,rgba(255,255,255,0.04) ${size*0.2}px)`,
          borderRadius:'50%',
        }}/>
        <span style={{
          position:'relative',zIndex:1,
          fontSize:`${Math.max(6.5,Math.min(10,size*0.26))}px`,
          color:'rgba(255,255,255,0.93)',fontWeight:700,letterSpacing:'0.05em',
          textShadow:'0 0 8px rgba(0,0,0,1),0 1px 4px rgba(0,0,0,0.9)',
          whiteSpace:'nowrap',maxWidth:size*1.3,overflow:'hidden',textOverflow:'ellipsis',
          textAlign:'center',padding:'0 3px',
        }}>{label}</span>
      </div>
    </motion.div>
  );
}

// ============================================================
// PERSON ORBIT LAYER — 인물 포커스 시 작품별 얇은 타원 궤적
// ============================================================
function PersonOrbitLayer({ members, focusOrbits, cx, cy, color }) {
  if(!members.length) return null;
  // focusOrbits에 cx/cy가 있으면 그걸 anchor로 사용 (computeSystemFocusOrbits 결과)
  const firstFp = focusOrbits[members[0]?.id];
  const anchorX = firstFp?.cx ?? cx;
  const anchorY = firstFp?.cy ?? cy;
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{zIndex:9}}>
      <defs>
        <filter id="porb-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.6" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {members.map(m=>{
        const fp=focusOrbits[m.id];
        if(!fp) return null;
        const rx = fp.rx ?? fp.r ?? 80;
        const ry = fp.ry ?? (rx*0.46);
        const tiltDeg = fp.tilt !== undefined ? fp.tilt*(180/Math.PI) : 0;
        // 궤도선: 어둡고 흔적처럼, 결정적 per-orbit 변주
        const hash = ((m.id * 2654435761) >>> 0) % 100;
        const lineOp = 0.10 + (hash / 100) * 0.10; // 0.10–0.20
        return (
          <ellipse key={`porb-${m.id}`}
            cx={anchorX} cy={anchorY} rx={rx} ry={ry}
            fill="none" stroke={color}
            strokeOpacity={lineOp} strokeWidth={0.6}
            transform={`rotate(${tiltDeg} ${anchorX} ${anchorY})`}/>
        );
      })}
    </svg>
  );
}

// ============================================================
// COMMENT THREAD — Twitter/Facebook 스타일 스레드 + 답글
// ============================================================
function CommentThread({ comments=[], accentColor='rgba(196,181,253,1)', currentUser }) {
  const [localComments, setLocalComments] = useState(()=>comments);
  const [liked, setLiked]   = useState(new Set());
  const [replyTo, setReplyTo] = useState(null); // comment id
  const [input, setInput]   = useState('');
  const [expanded, setExpanded] = useState(new Set()); // reply expanded ids

  useEffect(()=>{ setLocalComments(comments); setReplyTo(null); setInput(''); },[comments]);

  const toggleLike = id => setLiked(prev=>{
    const n=new Set(prev);
    n.has(id)?n.delete(id):n.add(id);
    return n;
  });
  const toggleExpand = id => setExpanded(prev=>{
    const n=new Set(prev);
    n.has(id)?n.delete(id):n.add(id);
    return n;
  });
  const submit = () => {
    if(!input.trim()) return;
    const newNode = {
      id:`u${Date.now()}`,user:currentUser?.nickname||'익명',avatar:'✦',
      text:input.trim(),createdAt:'방금',likes:0,replies:[],
    };
    if(replyTo){
      setLocalComments(prev=>prev.map(c=>c.id===replyTo
        ?{...c,replies:[...(c.replies||[]),{...newNode,id:`r${Date.now()}`}]}:c));
      setReplyTo(null);
    } else {
      setLocalComments(prev=>[...prev,newNode]);
    }
    setInput('');
  };

  const CardItem=({c,isReply=false})=>(
    <div className="flex gap-2.5" style={{opacity:isReply?0.92:1}}>
      <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm"
        style={{background:'rgba(255,255,255,0.07)',border:`1px solid ${accentColor}30`}}>
        {c.avatar||'✦'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold" style={{color:accentColor}}>{c.user}</span>
          <span className="text-xs" style={{color:'rgba(107,114,128,0.5)'}}>{c.createdAt}</span>
        </div>
        <p className="text-xs leading-relaxed" style={{color:'rgba(229,231,235,0.82)'}}>{c.text}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <button className="flex items-center gap-1 text-xs"
            style={{color:liked.has(c.id)?'rgba(248,113,113,0.9)':'rgba(107,114,128,0.6)'}}
            onClick={()=>toggleLike(c.id)}>
            {liked.has(c.id)?'♥':'♡'} {(c.likes||(0))+(liked.has(c.id)?1:0)}
          </button>
          {!isReply&&<button className="text-xs"
            style={{color:replyTo===c.id?accentColor:'rgba(107,114,128,0.55)'}}
            onClick={()=>setReplyTo(replyTo===c.id?null:c.id)}>
            답글 달기
          </button>}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="space-y-3.5">
        {localComments.map(c=>(
          <div key={c.id}>
            <CardItem c={c}/>
            {/* 답글 목록 */}
            {(c.replies||[]).length>0&&(
              <div className="ml-9 mt-2">
                {(c.replies||[]).length>2&&(
                  <button className="text-xs mb-1.5" style={{color:accentColor,opacity:0.65}}
                    onClick={()=>toggleExpand(c.id)}>
                    {expanded.has(c.id)?'▲ 접기':`▼ 답글 ${c.replies.length}개 모두 보기`}
                  </button>
                )}
                <div className="space-y-2.5 pl-3"
                  style={{borderLeft:`1.5px solid ${accentColor}20`}}>
                  {(expanded.has(c.id)||c.replies.length<=2?c.replies:c.replies.slice(0,2)).map(r=>(
                    <CardItem key={r.id} c={r} isReply/>
                  ))}
                </div>
              </div>
            )}
            {/* 답글 입력 */}
            {replyTo===c.id&&(
              <div className="ml-9 mt-2 flex gap-2">
                <input value={input} onChange={e=>setInput(e.target.value)}
                  placeholder={`@${c.user}에게 답글...`}
                  className="flex-1 text-xs px-3 py-2 rounded-xl outline-none"
                  style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${accentColor}30`,color:'rgba(229,231,235,0.9)'}}
                  onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit();}}}
                  onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}/>
                <button className="text-xs px-3 py-2 rounded-xl flex-shrink-0"
                  style={{background:accentColor,color:'#0a0014',fontWeight:700}}
                  onClick={submit}>전송</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {/* 새 코멘트 입력 */}
      {replyTo===null&&(
        <div className="mt-4 flex gap-2 items-start">
          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
            style={{background:'rgba(255,255,255,0.06)',border:`1px solid ${accentColor}25`}}>
            {currentUser?'✦':'👤'}
          </div>
          <div className="flex-1">
            <textarea value={input} onChange={e=>setInput(e.target.value)}
              placeholder="이 작품에 대한 생각을 남겨보세요..."
              rows={2}
              className="w-full text-xs px-3 py-2.5 rounded-xl outline-none resize-none"
              style={{background:'rgba(255,255,255,0.05)',border:`1px solid ${accentColor}25`,color:'rgba(229,231,235,0.9)'}}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}/>
            <div className="flex justify-end mt-1.5">
              <button className="text-xs px-4 py-1.5 rounded-xl"
                style={{background:input.trim()?accentColor:'rgba(255,255,255,0.08)',
                  color:input.trim()?'#0a0014':'rgba(107,114,128,0.5)',fontWeight:600,transition:'all 0.2s'}}
                onClick={submit}>코멘트 남기기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// GLOBAL COMMENT FEED — 전체 코멘트 피드 (왼쪽 슬라이드 패널)
// ============================================================
const SOURCE_TYPE_ICON = {작품:'🎬',장르:'⭕',감독:'🎬',작가:'✍️',배우:'⭐'};
const SYSTEM_SOURCE_LABELS = {
  'genre-18':'드라마 장르','genre-80':'범죄 장르','genre-9648':'미스터리 장르',
  'genre-10765':'SF·판타지 장르','genre-35':'코미디 장르','genre-10749':'로맨스 장르',
  'director-김원석':'감독 김원석','director-박인제':'감독 박인제',
  'writer-박해영':'작가 박해영','writer-김은희':'작가 김은희',
};

function buildUnifiedFeed(shows) {
  const titleMap = {};
  FALLBACK_SHOWS.forEach(s => { titleMap[s.id] = s.title; });
  shows.forEach(s => { if(s.id&&s.title) titleMap[s.id] = s.title; });
  const items = [];
  Object.entries(SEEDED_COMMENTS_BY_WORK).forEach(([id,cmts]) => {
    const source = titleMap[Number(id)] || `작품 #${id}`;
    cmts.forEach(c => {
      items.push({...c, source, sourceType:'작품', sourceKey:`work-${id}`});
      (c.replies||[]).forEach(r => items.push({...r, source, sourceType:'작품', sourceKey:`work-${id}`, isReply:true, replyTo:c.user}));
    });
  });
  Object.entries(SEEDED_COMMENTS_BY_SYSTEM).forEach(([key,cmts]) => {
    const [type] = key.split('-');
    const typeLabel = {genre:'장르',director:'감독',writer:'작가'}[type]||type;
    const source = SYSTEM_SOURCE_LABELS[key] || key;
    cmts.forEach(c => {
      items.push({...c, source, sourceType:typeLabel, sourceKey:key});
      (c.replies||[]).forEach(r => items.push({...r, source, sourceType:typeLabel, sourceKey:key, isReply:true, replyTo:c.user}));
    });
  });
  return items;
}

function GlobalCommentFeed({ shows=[], onUserClick, onClose }) {
  const feed = useMemo(()=>buildUnifiedFeed(shows),[shows]);
  const [liked, setLiked] = useState(new Set());
  const toggleLike = id => setLiked(prev=>{ const n=new Set(prev); n.has(id)?n.delete(id):n.add(id); return n; });

  return (
    <motion.div className="absolute left-0 top-0 h-full flex flex-col"
      style={{width:300,zIndex:52,background:'rgba(4,1,14,0.96)',backdropFilter:'blur(20px)',
        borderRight:'1px solid rgba(255,255,255,0.08)',overflowY:'hidden'}}
      initial={{x:-300}} animate={{x:0}} exit={{x:-300}}
      transition={{duration:0.28,ease:[0.25,0.46,0.45,0.94]}}
      onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div>
          <p className="text-sm font-semibold" style={{color:'rgba(196,181,253,0.95)'}}>전체 코멘트</p>
          <p className="text-xs" style={{color:'rgba(107,114,128,0.6)'}}>{feed.length}개 · 최신순</p>
        </div>
        <button className="w-7 h-7 flex items-center justify-center rounded-full text-sm"
          style={{background:'rgba(255,255,255,0.06)',color:'rgba(156,163,175,0.7)'}}
          onClick={onClose}>✕</button>
      </div>
      {/* 피드 목록 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" style={{scrollbarWidth:'none'}}>
        {feed.map((item,i)=>(
          <div key={`${item.id}-${i}`} className="p-3 rounded-xl"
            style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)'}}>
            {/* source 배지 */}
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{background:'rgba(139,92,246,0.15)',color:'rgba(196,181,253,0.75)',fontSize:'10px'}}>
                {SOURCE_TYPE_ICON[item.sourceType]||'💬'} {item.source}
              </span>
              {item.isReply&&<span className="text-xs" style={{color:'rgba(107,114,128,0.45)',fontSize:'10px'}}>↩ @{item.replyTo}</span>}
            </div>
            {/* 유저 */}
            <div className="flex gap-2.5">
              <button className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm"
                style={{background:'rgba(255,255,255,0.07)',border:'1px solid rgba(196,181,253,0.2)',cursor:'pointer'}}
                onClick={()=>onUserClick({user:item.user,avatar:item.avatar})}>
                {item.avatar||'✦'}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <button className="text-xs font-semibold" style={{color:'rgba(196,181,253,0.9)',cursor:'pointer'}}
                    onClick={()=>onUserClick({user:item.user,avatar:item.avatar})}>
                    {item.user}
                  </button>
                  <span className="text-xs" style={{color:'rgba(107,114,128,0.45)',fontSize:'10px'}}>{item.createdAt}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{color:'rgba(229,231,235,0.78)'}}>{item.text}</p>
                <button className="mt-1.5 flex items-center gap-1 text-xs"
                  style={{color:liked.has(`${item.id}-${i}`)?'rgba(248,113,113,0.9)':'rgba(107,114,128,0.5)'}}
                  onClick={()=>toggleLike(`${item.id}-${i}`)}>
                  {liked.has(`${item.id}-${i}`)?'♥':'♡'} {(item.likes||0)+(liked.has(`${item.id}-${i}`)?1:0)}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================
// USER PROFILE PANEL
// ============================================================
function UserProfilePanel({ profileUser, shows=[], watchedMap={}, wantMap={}, onClose, onViewGalaxy }) {
  const [following, setFollowing] = useState(false);
  const userFeed = useMemo(()=>{
    const all = buildUnifiedFeed(shows);
    return all.filter(item => item.user === profileUser.user);
  },[shows, profileUser.user]);
  const watched = shows.filter(s=>watchedMap[s.id]);
  const wanted = shows.filter(s=>wantMap[s.id]);

  return (
    <motion.div className="absolute right-0 top-0 h-full flex flex-col"
      style={{width:288,zIndex:56,background:'rgba(4,1,14,0.97)',backdropFilter:'blur(20px)',
        borderLeft:'1px solid rgba(255,255,255,0.08)'}}
      initial={{x:288}} animate={{x:0}} exit={{x:288}}
      transition={{duration:0.28,ease:[0.25,0.46,0.45,0.94]}}
      onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
      {/* 헤더 */}
      <div className="px-4 py-4 flex-shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl"
              style={{background:'rgba(139,92,246,0.18)',border:'1.5px solid rgba(196,181,253,0.3)'}}>
              {profileUser.avatar||'✦'}
            </div>
            <div>
              <p className="text-sm font-bold" style={{color:'rgba(229,231,235,0.95)'}}>{profileUser.user}</p>
              <p className="text-xs" style={{color:'rgba(107,114,128,0.55)'}}>코멘트 {userFeed.length}개</p>
            </div>
          </div>
          <button className="w-7 h-7 flex items-center justify-center rounded-full text-sm flex-shrink-0"
            style={{background:'rgba(255,255,255,0.06)',color:'rgba(156,163,175,0.7)'}}
            onClick={onClose}>✕</button>
        </div>
        <button className="mt-3 w-full py-2 rounded-xl text-xs font-semibold transition-all"
          style={following
            ?{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',color:'rgba(156,163,175,0.7)'}
            :{background:'rgba(139,92,246,0.25)',border:'1px solid rgba(139,92,246,0.45)',color:'rgba(196,181,253,1)'}}
          onClick={()=>setFollowing(v=>!v)}>
          {following?'✓ 팔로잉':'+ 팔로우'}
        </button>
      </div>
      {/* 항로 요약 + 은하 뷰 버튼 */}
      <div className="px-4 py-3 flex-shrink-0" style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
        <p className="text-xs font-semibold mb-2" style={{color:'rgba(107,114,128,0.6)',letterSpacing:'0.06em'}}>항로</p>
        <div className="flex gap-3 text-xs mb-3">
          <span style={{color:'rgba(196,181,253,0.85)'}}>🚀 본 작품 {watched.length}</span>
          <span style={{color:'rgba(251,191,36,0.75)'}}>📌 볼 작품 {wanted.length}</span>
        </div>
        <div className="flex gap-2">
          <button className="flex-1 py-2 rounded-xl text-xs font-semibold"
            style={{background:'rgba(139,92,246,0.18)',border:'1px solid rgba(139,92,246,0.32)',color:'rgba(196,181,253,0.9)'}}
            onClick={onViewGalaxy}>
            🌌 은하 보기
          </button>
          <button className="flex-1 py-2 rounded-xl text-xs font-semibold"
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(156,163,175,0.75)'}}
            onClick={onViewGalaxy}>
            🚀 본 작품 보기
          </button>
        </div>
      </div>
      {/* 코멘트 목록 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3" style={{scrollbarWidth:'none'}}>
        {userFeed.length === 0
          ? <p className="text-xs text-center py-6" style={{color:'rgba(107,114,128,0.4)'}}>아직 코멘트가 없어요</p>
          : userFeed.map((item,i)=>(
            <div key={`pf-${item.id}-${i}`} className="p-3 rounded-xl"
              style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.05)'}}>
              <span className="text-xs px-1.5 py-0.5 rounded-full mr-2"
                style={{background:'rgba(139,92,246,0.12)',color:'rgba(196,181,253,0.65)',fontSize:'10px'}}>
                {SOURCE_TYPE_ICON[item.sourceType]||'💬'} {item.source}
              </span>
              <span className="text-xs" style={{color:'rgba(107,114,128,0.4)',fontSize:'10px'}}>{item.createdAt}</span>
              <p className="text-xs leading-relaxed mt-1.5" style={{color:'rgba(229,231,235,0.80)'}}>{item.text}</p>
            </div>
          ))
        }
      </div>
    </motion.div>
  );
}

// ============================================================
// HOVER CARD
// ============================================================
function HoverCard({ show, vpWidth, vpHeight }) {
  const pos=getCardPos(show.screenX,show.screenY,vpWidth,vpHeight);
  const posterUrl=buildPosterUrl(show.posterPath,'w185');
  return (
    <motion.div className="absolute pointer-events-none" style={{left:pos.left,top:pos.top,zIndex:45}}
      initial={{opacity:0,scale:0.9,y:10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.9,y:10}} transition={{duration:0.16}}>
      <div className="w-52 rounded-xl overflow-hidden shadow-2xl"
        style={{background:'rgba(6,3,18,0.94)',backdropFilter:'blur(18px)',border:'1px solid rgba(255,255,255,0.09)'}}>
        <div className="h-28 relative overflow-hidden">
          {posterUrl?<img src={posterUrl} alt={show.title} className="w-full h-full object-cover"/>:<PosterFallback title={show.title}/>}
          <div className="absolute inset-0" style={{background:'linear-gradient(to top,rgba(6,3,18,0.9) 0%,transparent 55%)'}}/>
          <div className="absolute bottom-2 left-2 right-2">
            <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2">{show.title}</h3>
          </div>
        </div>
        <div className="p-2.5">
          <div className="flex gap-1 flex-wrap mb-1.5">
            {resolveGenreDisplay(show.genres,`${show.title||''} ${show.overview||''}`.toLowerCase()).slice(0,2).map(g=>(
              <span key={g} className="text-xs px-1.5 py-0.5 rounded-full"
                style={{background:`${getNPal(g).p}60`,color:getNPal(g).c}}>{GENRE_NAMES[g]||g}</span>
            ))}
            {show.rating>0&&<span className="text-xs px-1.5 py-0.5 rounded-full"
              style={{background:'rgba(120,70,0,0.35)',color:'#fde68a'}}>★ {show.rating.toFixed(1)}</span>}
          </div>
          <p className="text-xs line-clamp-2" style={{color:'rgba(156,163,175,0.9)'}}>{show.overview||'설명 없음'}</p>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// POSTER FALLBACK
// ============================================================
function PosterFallback({ title }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center"
      style={{background:'linear-gradient(135deg,rgba(55,14,130,0.5),rgba(10,30,80,0.5))'}}>
      <div className="text-2xl mb-1" style={{color:'rgba(196,181,253,0.5)'}}>✦</div>
      <div className="text-xs text-center px-2 line-clamp-2" style={{color:'rgba(255,255,255,0.35)'}}>{title}</div>
    </div>
  );
}

// ============================================================
// RELATED WORKS SHEET — 장르/감독/작가 클릭 시 관련 작품 목록
// ============================================================
const PANEL_PAGE_SIZE = 5;
// 항성계 slug 생성 (mock)
const toSystemSlug = (type, value) => {
  const base = String(value).toLowerCase().replace(/[·\s·]+/g,'-').replace(/[^\w-]/g,'');
  return `${type}-${base}`;
};
function RelatedWorksPanel({ query, shows, onSelectShow, onClose, page, setPage, currentUser, isMobile=false }) {
  if(!query) return null;
  const {type, value} = query;
  const label = type==='genre' ? (GENRE_NAMES[value]||value) : value;
  const typeLabel = type==='genre'?'장르':type==='director'?'감독':'작가';
  const systemTitle = `${label} 항성계`;
  const accentColor = type==='director'?'rgba(139,92,246,1)':type==='writer'?'rgba(52,211,153,1)':'rgba(139,92,246,1)';
  const accentBg   = type==='director'?'rgba(139,92,246,0.15)':type==='writer'?'rgba(52,211,153,0.1)':'rgba(139,92,246,0.15)';
  const [activeTab, setActiveTab] = useState('works'); // 'works' | 'comments'
  // 모바일 drag-to-close
  const panelTouchStartY = useRef(0);
  const onPanelTouchStart = e => { panelTouchStartY.current = e.touches[0].clientY; };
  const onPanelTouchEnd = e => {
    if(!isMobile) return;
    const dy = e.changedTouches[0].clientY - panelTouchStartY.current;
    if(dy > 90) onClose();
  };
  // 모바일 스와이프 페이지 전환
  const listTouchStartX = useRef(0);
  const onListTouchStart = e => { listTouchStartX.current = e.touches[0].clientX; };
  const onListTouchEnd = (e, totalPages) => {
    if(!isMobile) return;
    const dx = e.changedTouches[0].clientX - listTouchStartX.current;
    if(Math.abs(dx) > 60) {
      if(dx < 0 && page < totalPages-1) setPage(p=>p+1);
      if(dx > 0 && page > 0) setPage(p=>p-1);
    }
  };
  const systemSlug = type==='genre'?`genre-${value}`:`${type}-${value}`;
  const systemComments = SEEDED_COMMENTS_BY_SYSTEM[systemSlug]||[];

  const related = useMemo(()=>{
    if(type==='genre') return shows.filter(s=>{
      const disp=resolveGenreDisplay(s.genres,`${s.title||''} ${s.overview||''}`.toLowerCase());
      return disp.includes(value)||s.genres.includes(value);
    }).sort((a,b)=>b.rating-a.rating);
    if(type==='director') return shows.filter(s=>(s.directors||[]).includes(value));
    if(type==='writer')   return shows.filter(s=>(s.writers||[]).includes(value));
    return [];
  },[shows,type,value]);

  const totalPages = Math.ceil(related.length / PANEL_PAGE_SIZE);
  const pageItems  = related.slice(page*PANEL_PAGE_SIZE, (page+1)*PANEL_PAGE_SIZE);

  // 모바일: bottom sheet (화면 하단 55vh), 데스크톱: right panel
  const panelStyle = isMobile
    ? {zIndex:65, width:'100%', height:'55vh', bottom:0, left:0, top:'auto', right:'auto',
        background:'rgba(4,1,14,0.98)',
        borderTop:'1px solid rgba(139,92,246,0.22)',borderRadius:'18px 18px 0 0',
        boxShadow:'0 -8px 40px rgba(0,0,0,0.7)'}
    : {zIndex:65, width:'min(320px,88vw)', height:'100%', top:0, right:0, bottom:'auto', left:'auto',
        background:'rgba(4,1,14,0.97)', backdropFilter:'blur(22px)',
        borderLeft:'1px solid rgba(139,92,246,0.18)', boxShadow:'-12px 0 40px rgba(0,0,0,0.6)'};
  const panelInit  = isMobile ? {y:'100%',opacity:0} : {x:'100%',opacity:0};
  const panelAnim  = isMobile ? {y:0,opacity:1}       : {x:0,opacity:1};
  const panelExit  = isMobile ? {y:'100%',opacity:0}  : {x:'100%',opacity:0};

  return (
    <>
    {/* 모바일 backdrop — 탭하면 닫기 */}
    {isMobile&&<div className="fixed inset-0" style={{zIndex:64,background:'rgba(0,0,0,0.35)'}}
      onClick={onClose} onTouchStart={e=>e.stopPropagation()}/>}
    <motion.div className="fixed flex flex-col"
      style={panelStyle}
      initial={panelInit} animate={panelAnim} exit={panelExit}
      transition={{type:'spring',damping:32,stiffness:300}}
      onMouseDown={e=>e.stopPropagation()}
      onTouchStart={e=>{e.stopPropagation();onPanelTouchStart(e);}}
      onTouchEnd={onPanelTouchEnd}>
      {/* 모바일 drag handle */}
      {isMobile&&<div className="flex justify-center pt-2 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{background:'rgba(255,255,255,0.18)'}}/>
      </div>}
      {/* Header */}
      <div className="flex-shrink-0"
        style={{borderBottom:'1px solid rgba(139,92,246,0.12)',
          background:'linear-gradient(to bottom,rgba(139,92,246,0.09),transparent)'}}>
        {/* 타이틀 행 */}
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <div className="flex flex-col gap-0.5 flex-1 min-w-0">
            <span className="text-xs" style={{color:accentColor,opacity:0.6}}>{typeLabel}</span>
            <span className="font-bold text-sm text-white truncate">{systemTitle}</span>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
            style={{background:accentBg,color:accentColor}}>{related.length}편</span>
          <button className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs"
            style={{background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.4)'}}
            onClick={onClose}>✕</button>
        </div>
        {/* 탭 */}
        <div className="flex px-4 pt-1 pb-0 gap-0" style={{borderTop:'1px solid rgba(255,255,255,0.05)'}}>
          {[['works','작품 목록'],['comments','코멘트']].map(([tab,name])=>(
            <button key={tab} className="flex-1 py-2 text-xs font-semibold transition-all"
              style={{
                color:activeTab===tab?accentColor:'rgba(107,114,128,0.55)',
                borderBottom:activeTab===tab?`2px solid ${accentColor}`:'2px solid transparent',
              }}
              onClick={()=>setActiveTab(tab)}>{name}</button>
          ))}
        </div>
      </div>
      {/* List — 모바일 스와이프로 페이지 전환 */}
      <div className="flex-1 overflow-y-auto"
        onTouchStart={onListTouchStart}
        onTouchEnd={e=>onListTouchEnd(e, totalPages)}>
        {activeTab==='comments'?(
          <div className="px-4 py-4">
            <CommentThread comments={systemComments} accentColor={accentColor} currentUser={currentUser}/>
          </div>
        ):related.length===0?(
          <div className="flex items-center justify-center py-12 text-sm"
            style={{color:'rgba(107,114,128,0.6)'}}>관련 작품이 없습니다</div>
        ):pageItems.map(s=>{
          const posterUrl=buildPosterUrl(s.posterPath,'w185');
          const pal=getNPal(primaryGenre(s));
          const overview=s.overview?(s.overview.length>65?s.overview.slice(0,63)+'…':s.overview):'';
          const credits=[...(s.directors||[]).map(n=>({n,role:'감독'})),...(s.writers||[]).map(n=>({n,role:'작가'}))];
          return (
            <button key={s.id} className="w-full flex gap-3 px-4 py-3 text-left"
              style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}
              onClick={()=>{onSelectShow(s.id);onClose();}}>
              <div className="flex-shrink-0 rounded-xl overflow-hidden"
                style={{width:'3.4rem',height:'5rem',background:`linear-gradient(160deg,${pal.p}60,${pal.s}80)`,
                  boxShadow:`0 0 12px ${pal.c}28`}}>
                {posterUrl?<img src={posterUrl} alt="" className="w-full h-full object-cover"/>:
                  <div className="w-full h-full flex items-center justify-center" style={{color:pal.c}}>✦</div>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <p className="text-sm font-semibold text-white truncate">{s.title}</p>
                  {s.rating>0&&<span className="text-xs flex-shrink-0" style={{color:'rgba(253,230,138,0.8)'}}>★{s.rating.toFixed(1)}</span>}
                </div>
                <div className="flex gap-1 mt-0.5 flex-wrap">
                  {resolveGenreDisplay(s.genres||[]).slice(0,2).map(g=>(
                    <span key={g} className="text-xs px-1.5 py-0.5 rounded-full"
                      style={{background:`${getNPal(g).p}35`,color:getNPal(g).c}}>{GENRE_NAMES[g]||g}</span>
                  ))}
                </div>
                {overview&&<p className="text-xs mt-1 leading-snug line-clamp-2"
                  style={{color:'rgba(209,213,219,0.5)'}}>{overview}</p>}
                {credits.length>0&&<p className="text-xs mt-0.5" style={{color:accentColor,opacity:0.6}}>
                  {credits.slice(0,2).map(c=>`${c.role} ${c.n}`).join(' · ')}
                </p>}
              </div>
            </button>
          );
        })}
      </div>
      {/* Pagination */}
      {activeTab==='works'&&totalPages>1&&(
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2.5"
          style={{borderTop:'1px solid rgba(255,255,255,0.07)'}}>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-25"
            style={{background:'rgba(255,255,255,0.06)',color:'rgba(196,181,253,0.8)'}}
            disabled={page===0} onClick={()=>setPage(p=>p-1)}>‹</button>
          <span className="text-xs" style={{color:'rgba(156,163,175,0.6)'}}>
            {page+1} / {totalPages}
            <span className="ml-1" style={{color:'rgba(107,114,128,0.45)'}}>({related.length}편)</span>
          </span>
          <button className="w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-25"
            style={{background:'rgba(255,255,255,0.06)',color:'rgba(196,181,253,0.8)'}}
            disabled={page>=totalPages-1} onClick={()=>setPage(p=>p+1)}>›</button>
        </div>
      )}
    </motion.div>
    </>
  );
}

// ============================================================
// DETAIL MODAL — 모바일: 바텀시트
// ============================================================
function DetailModal({ show, isWatched, isWanted, watchedColor, favoriteActors, onToggleWatched, onToggleWant, onToggleFavoriteActor, onFocusActor, onOpenRelated, onClose, onShare, isMobile, currentUser }) {
  const posterUrl=buildPosterUrl(show.posterPath,'w342');
  const backdropUrl=buildBackdropUrl(show.backdropPath);
  const pal=getNPal(show.genres[0]||18);
  return (
    <motion.div className="fixed inset-0 flex items-end sm:items-center justify-center" style={{zIndex:60}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
      <div className="absolute inset-0" onClick={onClose}
        style={{background:'rgba(0,0,0,0.72)',backdropFilter:'blur(8px)'}}/>
      <motion.div style={{
        position:'relative',width:'100%',maxWidth:isMobile?'100%':'32rem',
        borderRadius:isMobile?'20px 20px 0 0':'16px',
        maxHeight:isMobile?'88vh':'88vh',overflowY:'auto',
        background:'rgba(6,3,18,0.99)',backdropFilter:'blur(24px)',
        border:`1px solid ${pal.p}40`,
      }}
        initial={isMobile?{y:'100%'}:{scale:0.88,y:24}}
        animate={isMobile?{y:0}:{scale:1,y:0}}
        exit={isMobile?{y:'100%'}:{scale:0.88,y:24}}
        transition={{type:'spring',damping:28,stiffness:320}}>
        {isMobile&&<div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{background:'rgba(255,255,255,0.2)'}}/>
        </div>}
        <div className="relative h-36 overflow-hidden"
          style={{background:`linear-gradient(135deg,${pal.p}50,${pal.s}50)`,
            borderRadius:isMobile?'20px 20px 0 0':'16px 16px 0 0'}}>
          {backdropUrl&&<img src={backdropUrl} alt="" className="w-full h-full object-cover opacity-45"/>}
          <div className="absolute inset-0" style={{background:'linear-gradient(to bottom,transparent 20%,rgba(6,3,18,0.98) 100%)'}}/>
          {!isMobile&&<button className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{background:'rgba(0,0,0,0.55)',color:'rgba(255,255,255,0.6)'}} onClick={onClose}>✕</button>}
          {isMobile&&<button className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-sm"
            style={{background:'rgba(0,0,0,0.55)',color:'rgba(255,255,255,0.6)'}} onClick={onClose}>✕</button>}
        </div>
        <div className="p-4 -mt-14 relative">
          <div className="flex gap-4">
            <div className="flex-shrink-0 rounded-xl overflow-hidden shadow-xl"
              style={{width:'5rem',height:'7.5rem',border:`1px solid ${pal.p}40`}}>
              {posterUrl?<img src={posterUrl} alt={show.title} className="w-full h-full object-cover"/>:<PosterFallback title={show.title}/>}
            </div>
            <div className="flex-1 pt-14">
              <h2 className="text-xl font-bold text-white mb-0.5">{show.title}</h2>
              {show.originalTitle&&show.originalTitle!==show.title&&
                <p className="text-sm mb-1.5" style={{color:'rgba(156,163,175,0.65)'}}>{show.originalTitle}</p>}
              <div className="flex gap-1.5 flex-wrap">
                {resolveGenreDisplay(show.genres,`${show.title||''} ${show.overview||''}`.toLowerCase()).slice(0,3).map(g=>(
                  <button key={g} className="text-xs px-2 py-0.5 rounded-full"
                    style={{background:`${getNPal(g).p}50`,color:getNPal(g).c,cursor:'pointer'}}
                    onClick={e=>{e.stopPropagation();onOpenRelated&&onOpenRelated({type:'genre',value:g});}}>
                    {GENRE_NAMES[g]||g}
                  </button>
                ))}
                {show.rating>0&&<span className="text-xs px-2 py-0.5 rounded-full"
                  style={{background:'rgba(120,70,0,0.3)',color:'#fde68a'}}>★ {show.rating.toFixed(1)}</span>}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed" style={{color:'rgba(209,213,219,0.82)'}}>{show.overview||'설명 없음'}</p>
          <div className="mt-4 space-y-1.5">
            {show.directors?.length>0&&(
              <div className="text-sm flex gap-1.5 flex-wrap items-center">
                <span style={{color:'rgba(107,114,128,0.8)'}}>감독</span>
                {show.directors.map(name=>(
                  <button key={name} className="text-sm"
                    style={{color:'rgba(196,181,253,0.95)',textDecoration:'underline',textDecorationColor:'rgba(196,181,253,0.4)',cursor:'pointer',fontWeight:500}}
                    onClick={e=>{e.stopPropagation();onOpenRelated&&onOpenRelated({type:'director',value:name});}}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            {show.writers?.length>0&&(
              <div className="text-sm flex gap-1.5 flex-wrap items-center">
                <span style={{color:'rgba(107,114,128,0.8)'}}>작가</span>
                {show.writers.map(name=>(
                  <button key={name} className="text-sm"
                    style={{color:'rgba(196,181,253,0.95)',textDecoration:'underline',textDecorationColor:'rgba(196,181,253,0.4)',cursor:'pointer',fontWeight:500}}
                    onClick={e=>{e.stopPropagation();onOpenRelated&&onOpenRelated({type:'writer',value:name});}}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            {show.cast?.length>0&&<div className="text-sm"><span style={{color:'rgba(107,114,128,0.8)'}}>출연  </span><span style={{color:'rgba(229,231,235,0.88)'}}>{show.cast.join(', ')}</span></div>}
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            <button className="flex-1 py-2.5 rounded-xl text-sm font-medium min-w-0"
              style={isWatched?{background:`${watchedColor}22`,border:`1px solid ${watchedColor}50`,color:watchedColor}:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.5)'}}
              onClick={()=>onToggleWatched(show.id)}>{isWatched?'✦ 봤어요':'○ 봤어요'}</button>
            <button className="flex-1 py-2.5 rounded-xl text-sm font-medium min-w-0"
              style={isWanted?{background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.4)',color:'#fbbf24'}:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(255,255,255,0.4)'}}
              onClick={()=>onToggleWant(show.id)}>{isWanted?'★ 보고싶어요':'☆ 보고싶어요'}</button>
          </div>
          {/* 즐겨찾기 배우 */}
          {show.cast?.length>0&&(
            <div className="mt-3">
              <p className="text-xs mb-1.5" style={{color:'rgba(107,114,128,0.7)'}}>출연 배우</p>
              <div className="flex gap-1.5 flex-wrap">
                {show.cast.slice(0,5).map(name=>{
                  const isFav=favoriteActors?.includes(name);
                  return (
                    <div key={name} className="flex gap-0.5">
                      <button
                        className="text-xs px-2 py-1 rounded-l-full"
                        style={isFav?{background:`${pal.p}50`,border:`1px solid ${pal.c}60`,color:pal.c,borderRight:'none'}:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(229,231,235,0.75)',borderRight:'none'}}
                        onClick={()=>onFocusActor&&onFocusActor(name)}>
                        {name}
                      </button>
                      <button
                        className="text-xs px-1.5 py-1 rounded-r-full"
                        title={isFav?'내 배우 해제':'내 배우 저장'}
                        style={isFav?{background:`${pal.p}50`,border:`1px solid ${pal.c}60`,color:pal.c,borderLeft:'none'}:{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(107,114,128,0.6)',borderLeft:'none'}}
                        onClick={()=>onToggleFavoriteActor(name)}>
                        {isFav?'★':'☆'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button className="px-4 py-2 rounded-xl text-sm"
              style={{background:`${pal.p}35`,border:`1px solid ${pal.p}50`,color:pal.c}} onClick={onShare}>공유</button>
            <button className="px-4 py-2 rounded-xl text-sm font-medium text-white"
              style={{background:`linear-gradient(135deg,${pal.p}50,${pal.s}50)`,border:`1px solid ${pal.p}40`}}
              onClick={()=>alert('커뮤니티 기능은 준비 중입니다 :)')}>입장</button>
          </div>
          <div className="mt-5 mb-2">
            <h3 className="text-sm font-semibold mb-3" style={{color:`${pal.c}aa`}}>
              별헤윰 코멘트
            </h3>
            <CommentThread
              comments={SEEDED_COMMENTS_BY_WORK[show.id]||[]}
              accentColor={pal.c}
              currentUser={currentUser}/>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// LOGIN MODAL
// ============================================================
function LoginModal({ loginNick, setLoginNick, onLogin, onClose }) {
  return (
    <motion.div className="fixed inset-0 flex items-center justify-center" style={{zIndex:70}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
      <div className="absolute inset-0" onClick={onClose} style={{background:'rgba(0,0,0,0.72)',backdropFilter:'blur(8px)'}}/>
      <motion.div className="relative w-80 rounded-2xl p-6 shadow-2xl mx-4"
        style={{background:'rgba(6,3,18,0.98)',backdropFilter:'blur(24px)',border:'1px solid rgba(109,40,217,0.3)'}}
        initial={{scale:0.88}} animate={{scale:1}} exit={{scale:0.88}}>
        <button className="absolute top-4 right-4 text-sm" style={{color:'rgba(255,255,255,0.3)'}} onClick={onClose}>✕</button>
        <div className="text-center mb-6">
          <div className="text-2xl mb-2">✦</div>
          <h2 className="text-lg font-bold text-white">별헤윰에 오신 걸 환영해요</h2>
          <p className="text-xs mt-1" style={{color:'rgba(156,163,175,0.65)'}}>나만의 드라마 우주를 만들어보세요</p>
        </div>
        <div className="space-y-3">
          <input type="text" placeholder="닉네임 (선택)" value={loginNick} onChange={e=>setLoginNick(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none"
            style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)'}}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}/>
          <button className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{background:'#FEE500',color:'#1a1a1a'}} onClick={()=>onLogin('kakao')}>
            <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-black"
              style={{background:'#3A1D1D',color:'#FEE500'}}>K</span>카카오로 시작하기</button>
          <button className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            style={{background:'#03C75A',color:'#fff'}} onClick={()=>onLogin('naver')}>
            <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-black"
              style={{background:'#fff',color:'#03C75A'}}>N</span>네이버로 시작하기</button>
          <button className="w-full py-2.5 rounded-xl text-sm" style={{color:'rgba(156,163,175,0.65)'}}
            onClick={()=>onLogin('guest')}>게스트로 계속하기</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// TOP BAR — compact, mobile-first
// ============================================================
function TopBar({ currentUser, highlightColor, setHighlightColor, onLogin, onShare, shareMsg, onOpenSearch, isMobile }) {
  return (
    <div className="absolute top-0 left-0 right-0 px-4 pt-3 pb-2 flex items-center gap-2.5"
      style={{zIndex:30,background:'linear-gradient(to bottom,rgba(3,2,9,0.75) 0%,transparent 100%)'}}>
      <div className="flex-shrink-0 mr-1">
        <h1 className="text-base font-bold tracking-widest"
          style={{background:'linear-gradient(90deg,#c4b5fd,#f9a8d4,#93c5fd)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
          별헤윰
        </h1>
        <p className="text-xs leading-none" style={{color:'rgba(139,92,246,0.55)',marginTop:'-1px'}}>드라마 유니버스</p>
      </div>
      <div className="flex-1"/>
      {/* Search */}
      <button className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.09)',color:'rgba(196,181,253,0.8)',fontSize:'14px'}}
        onClick={onOpenSearch} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
        🔍
      </button>
      {/* Color picker */}
      {currentUser&&(
        <div className="flex-shrink-0" onMouseDown={e=>e.stopPropagation()}>
          <label className="relative cursor-pointer block">
            <input type="color" value={highlightColor} onChange={e=>setHighlightColor(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"/>
            <div className="w-7 h-7 rounded-full" style={{background:highlightColor,border:'2px solid rgba(255,255,255,0.2)',boxShadow:`0 0 7px ${highlightColor}70`}}/>
          </label>
        </div>
      )}
      {/* Share */}
      <button className="w-9 h-9 rounded-full flex items-center justify-center text-xs"
        style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.09)',color:'rgba(196,181,253,0.8)'}}
        onClick={onShare} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
        {shareMsg?'✓':'✨'}
      </button>
      {/* User */}
      <div onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
        {currentUser?(
          <div className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{background:`${highlightColor}22`,border:`1px solid ${highlightColor}50`}}>
            <div className="w-2 h-2 rounded-full" style={{background:highlightColor}}/>
          </div>
        ):(
          <button className="w-9 h-9 rounded-full flex items-center justify-center text-sm"
            style={{background:'rgba(109,40,217,0.18)',border:'1px solid rgba(109,40,217,0.3)',color:'rgba(196,181,253,0.85)'}}
            onClick={onLogin}>👤</button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SEARCH SHEET
// ============================================================
function SearchSheet({ query, setQuery, filteredShows, onSelectShow, onClose }) {
  const inputRef=useRef(null);
  useEffect(()=>{setTimeout(()=>inputRef.current?.focus(),100);},[]);
  return (
    <motion.div className="fixed inset-0 flex flex-col" style={{zIndex:50}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
      <div className="absolute inset-0" onClick={onClose} style={{background:'rgba(0,0,0,0.6)',backdropFilter:'blur(8px)'}}/>
      <motion.div className="relative mx-3 mt-14 rounded-2xl overflow-hidden shadow-2xl"
        style={{background:'rgba(4,2,14,0.97)',backdropFilter:'blur(22px)',border:'1px solid rgba(139,92,246,0.2)',maxHeight:'75vh'}}
        initial={{y:-20,opacity:0}} animate={{y:0,opacity:1}} exit={{y:-20,opacity:0}}
        onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3" style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
          <span style={{color:'rgba(139,92,246,0.7)'}}>🔍</span>
          <input ref={inputRef} type="text" value={query} onChange={e=>setQuery(e.target.value)}
            placeholder="작품 검색..." autoComplete="off"
            className="flex-1 bg-transparent text-sm outline-none" style={{color:'rgba(255,255,255,0.9)'}}/>
          {query&&<button className="text-sm" style={{color:'rgba(255,255,255,0.3)'}} onClick={()=>setQuery('')}>✕</button>}
          <button className="text-sm px-2" style={{color:'rgba(196,181,253,0.7)'}} onClick={onClose}>닫기</button>
        </div>
        <div style={{overflowY:'auto',maxHeight:'calc(75vh - 56px)'}}>
          {!query&&<p className="text-sm text-center py-8" style={{color:'rgba(107,114,128,0.55)'}}>검색어를 입력하세요</p>}
          {query&&filteredShows?.length===0&&<p className="text-sm text-center py-8" style={{color:'rgba(107,114,128,0.7)'}}>일치하는 작품이 없어요</p>}
          {query&&filteredShows?.length>0&&<>
            <div className="px-4 py-2"><span className="text-xs" style={{color:'rgba(139,92,246,0.65)'}}>검색 결과 {filteredShows.length}편</span></div>
            {filteredShows.map(show=>{
              const posterUrl=buildPosterUrl(show.posterPath,'w92');
              const pal=getNPal(show.genres[0]||18);
              return (
                <motion.button key={show.id} className="w-full flex gap-3 px-4 py-3 text-left"
                  style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}}
                  whileHover={{background:`${pal.p}22`}} whileTap={{background:`${pal.p}33`}}
                  onClick={()=>{onSelectShow(show.id);onClose();}}>
                  <div className="flex-shrink-0 w-10 rounded-lg overflow-hidden" style={{height:'3.5rem',border:`1px solid ${pal.p}35`}}>
                    {posterUrl?<img src={posterUrl} alt="" className="w-full h-full object-cover"/>:<PosterFallback title={show.title}/>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <p className="text-sm font-semibold text-white truncate">{show.title}</p>
                      {show.rating>0&&<span className="text-xs flex-shrink-0" style={{color:'#fde68a'}}>★ {show.rating.toFixed(1)}</span>}
                    </div>
                    <div className="flex gap-1 mb-1 flex-wrap">
                      {show.genres.slice(0,2).map(g=>(
                        <span key={g} className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{background:`${getNPal(g).p}45`,color:getNPal(g).c}}>{GENRE_NAMES[g]||g}</span>
                      ))}
                    </div>
                    <p className="text-xs line-clamp-2" style={{color:'rgba(156,163,175,0.75)'}}>{show.overview||'설명 없음'}</p>
                  </div>
                </motion.button>
              );
            })}
          </>}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// MODE BAR — 하단 고정 (모바일 중심)
// ============================================================
const MODE_OPTIONS = [
  {value:'none',   label:'은하 탐색', icon:'🌌'},
  {value:'genre',  label:'장르 궤도', icon:'⭕'},
  {value:'director',label:'감독',    icon:'🎬'},
  {value:'writer', label:'작가',     icon:'✍️'},
  {value:'actor',  label:'배우',     icon:'⭐'},
  {value:'watched',label:'내 항로',  icon:'🚀'},
];

// ============================================================
// PERSON FOCUS PANEL — 감독/작가 검색 진입 (actor mode 동일 구조)
// ============================================================
function PersonFocusPanel({ mode, allPersons, focusedPerson, setFocusedPerson, personQuery, setPersonQuery, favoritePersons=[], onToggleFavoritePerson }) {
  const icon = mode==='director'?'🎬':'✍️';
  const label = mode==='director'?'감독':'작가';
  const accent = mode==='director'?'rgba(139,92,246,0.8)':'rgba(52,211,153,0.8)';
  const accentBg = mode==='director'?'rgba(139,92,246,0.15)':'rgba(52,211,153,0.1)';
  const accentBorder = mode==='director'?'rgba(139,92,246,0.35)':'rgba(52,211,153,0.3)';

  const suggestions = useMemo(()=>{
    if(!personQuery.trim()) return [];
    const q=personQuery.toLowerCase();
    return allPersons.filter(p=>p.name.toLowerCase().includes(q)).slice(0,8);
  },[allPersons,personQuery]);

  return (
    <motion.div className="absolute left-0 right-0 px-3"
      style={{bottom:'3.6rem',zIndex:25}}
      initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
      <div className="rounded-2xl overflow-hidden"
        style={{background:'rgba(4,2,14,0.93)',backdropFilter:'blur(18px)',border:`1px solid ${accentBorder}`}}>
        {/* 현재 포커스 인물 */}
        {focusedPerson&&(
          <div className="flex items-center gap-2 px-3 pt-3 pb-2"
            style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <span style={{color:accent,fontSize:'10px'}}>{label} 탐색 중</span>
            <span className="flex-1 text-sm font-medium" style={{color:accent}}>{focusedPerson}</span>
            {onToggleFavoritePerson&&<button className="text-xs px-2 py-0.5 rounded-full"
              style={favoritePersons.includes(focusedPerson)
                ?{background:accentBg,border:`1px solid ${accentBorder}`,color:accent}
                :{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',color:'rgba(107,114,128,0.6)'}}
              onClick={()=>onToggleFavoritePerson(focusedPerson)}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
              {favoritePersons.includes(focusedPerson)?`★ 저장됨`:`☆ 내 ${label}`}
            </button>}
            <button className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.35)'}}
              onClick={()=>setFocusedPerson(null)}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>✕</button>
          </div>
        )}
        {/* 내 감독 / 내 작가 빠른 진입 */}
        {favoritePersons.length>0&&(
          <div className="px-3 pt-2 pb-1">
            <p className="text-xs mb-1.5" style={{color:'rgba(107,114,128,0.6)'}}>내 {label}</p>
            <div className="flex gap-1.5 flex-wrap">
              {favoritePersons.slice(0,6).map(name=>(
                <button key={name} className="text-xs px-2.5 py-1 rounded-full"
                  style={focusedPerson===name
                    ?{background:accentBg,border:`1px solid ${accentBorder}`,color:accent}
                    :{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.09)',color:'rgba(196,181,253,0.75)'}}
                  onClick={()=>setFocusedPerson(name===focusedPerson?null:name)}
                  onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
                  ★ {name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 검색 입력 */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-xl px-3 py-1.5"
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>
            <span style={{fontSize:'12px'}}>{icon}</span>
            <input type="text" value={personQuery} onChange={e=>setPersonQuery(e.target.value)}
              placeholder={`${label} 이름 검색...`} autoComplete="off"
              className="flex-1 bg-transparent text-xs outline-none" style={{color:'rgba(255,255,255,0.85)'}}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}/>
            {personQuery&&<button className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}
              onClick={()=>setPersonQuery('')}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>✕</button>}
          </div>
          {suggestions.length>0&&(
            <div className="mt-1.5 space-y-0.5">
              {suggestions.map(p=>(
                <button key={p.name} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left"
                  style={{color:'rgba(229,231,235,0.85)',background:'rgba(255,255,255,0.03)'}}
                  onClick={()=>{setFocusedPerson(p.name);setPersonQuery('');}}
                  onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
                  <span style={{color:accent}}>{icon}</span>
                  <span className="flex-1">{p.name}</span>
                  <span style={{color:'rgba(107,114,128,0.5)'}}>{p.count}편</span>
                </button>
              ))}
            </div>
          )}
          {!focusedPerson&&!personQuery&&(
            <p className="text-xs mt-1.5 text-center" style={{color:'rgba(107,114,128,0.5)'}}>
              {label} 이름을 검색하여 항성계로 진입하세요
            </p>
          )}
        </div>
        {/* 인기 인물 빠른 선택 (상위 5명) */}
        {!personQuery&&allPersons.slice(0,6).length>0&&(
          <div className="px-3 pb-2.5">
            <p className="text-xs mb-1.5" style={{color:'rgba(107,114,128,0.5)'}}>인기 {label}</p>
            <div className="flex gap-1.5 flex-wrap">
              {allPersons.slice(0,6).map(p=>(
                <button key={p.name} className="text-xs px-2 py-0.5 rounded-full"
                  style={focusedPerson===p.name
                    ?{background:accentBg,border:`1px solid ${accentBorder}`,color:accent}
                    :{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(196,181,253,0.6)'}}
                  onClick={()=>setFocusedPerson(p.name===focusedPerson?null:p.name)}
                  onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================
// ACTOR FOCUS PANEL — 배우 검색 + 내 배우 shortcuts
// ============================================================
function ActorFocusPanel({ allActors, favoriteActors, focusedActor, setFocusedActor, actorQuery, setActorQuery, onToggleFavoriteActor }) {
  const inputRef=useRef(null);
  const suggestions=useMemo(()=>{
    if(!actorQuery.trim()) return [];
    const q=actorQuery.toLowerCase();
    return allActors.filter(a=>a.name.toLowerCase().includes(q)).slice(0,8);
  },[allActors,actorQuery]);

  return (
    <motion.div className="absolute left-0 right-0 px-3"
      style={{bottom:'3.6rem',zIndex:25}}
      initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:8}}>
      <div className="rounded-2xl overflow-hidden"
        style={{background:'rgba(4,2,14,0.93)',backdropFilter:'blur(18px)',border:'1px solid rgba(251,191,36,0.15)'}}>
        {/* 현재 포커스 배우 */}
        {focusedActor&&(
          <div className="flex items-center gap-2 px-3 pt-3 pb-2"
            style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <span style={{color:'rgba(251,191,36,0.6)',fontSize:'10px'}}>탐색 중</span>
            <span className="flex-1 text-sm font-medium" style={{color:'#fbbf24'}}>{focusedActor}</span>
            <button className="text-xs px-2 py-0.5 rounded-full"
              style={{background:'rgba(251,191,36,0.12)',border:'1px solid rgba(251,191,36,0.25)',color:'rgba(251,191,36,0.7)'}}
              onClick={()=>onToggleFavoriteActor(focusedActor)}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
              {favoriteActors.includes(focusedActor)?'★ 저장됨':'☆ 내 배우'}
            </button>
            <button className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
              style={{background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.35)'}}
              onClick={()=>setFocusedActor(null)}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>✕</button>
          </div>
        )}
        {/* 내 배우 빠른 진입 */}
        {favoriteActors.length>0&&(
          <div className="px-3 pt-2 pb-1">
            <p className="text-xs mb-1.5" style={{color:'rgba(107,114,128,0.6)'}}>내 배우</p>
            <div className="flex gap-1.5 flex-wrap">
              {favoriteActors.slice(0,6).map(name=>(
                <button key={name}
                  className="text-xs px-2.5 py-1 rounded-full"
                  style={focusedActor===name
                    ?{background:'rgba(251,191,36,0.22)',border:'1px solid rgba(251,191,36,0.5)',color:'#fbbf24'}
                    :{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.09)',color:'rgba(196,181,253,0.75)'}}
                  onClick={()=>setFocusedActor(name===focusedActor?null:name)}
                  onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
                  ★ {name}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* 배우 검색 */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 rounded-xl px-3 py-1.5"
            style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>
            <span style={{color:'rgba(251,191,36,0.5)',fontSize:'12px'}}>⭐</span>
            <input ref={inputRef} type="text" value={actorQuery} onChange={e=>setActorQuery(e.target.value)}
              placeholder="배우 이름 검색..." autoComplete="off"
              className="flex-1 bg-transparent text-xs outline-none" style={{color:'rgba(255,255,255,0.85)'}}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}/>
            {actorQuery&&<button className="text-xs" style={{color:'rgba(255,255,255,0.25)'}}
              onClick={()=>setActorQuery('')}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>✕</button>}
          </div>
          {/* 검색 결과 드롭다운 */}
          {suggestions.length>0&&(
            <div className="mt-1.5 space-y-0.5">
              {suggestions.map(a=>(
                <button key={a.name}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-left"
                  style={{color:'rgba(229,231,235,0.85)',background:'rgba(255,255,255,0.03)'}}
                  onClick={()=>{setFocusedActor(a.name);setActorQuery('');}}
                  onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
                  <span style={{color:'rgba(251,191,36,0.5)'}}>⭐</span>
                  <span className="flex-1">{a.name}</span>
                  <span style={{color:'rgba(107,114,128,0.5)'}}>{a.count}편</span>
                </button>
              ))}
            </div>
          )}
          {!focusedActor&&!actorQuery&&favoriteActors.length===0&&(
            <p className="text-xs mt-1.5 text-center" style={{color:'rgba(107,114,128,0.5)'}}>
              배우를 검색하거나 작품 상세에서 내 배우로 저장해보세요
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function ModeBar({ connectionMode, setConnectionMode, showWatchedRoute, setShowWatchedRoute, showExpeditionRoute, setShowExpeditionRoute }) {
  const isRouteMode = connectionMode==='watched';
  return (
    <div className="absolute bottom-0 left-0 right-0"
      style={{zIndex:30,background:'linear-gradient(to top,rgba(3,2,9,0.92) 0%,transparent 100%)'}}>
      {/* 항로 토글 — 항로가 하나라도 켜져 있거나 내 항로 모드일 때 상시 표시 */}
      {(isRouteMode||showWatchedRoute||showExpeditionRoute)&&(
        <div className="flex gap-2 justify-center px-4 pb-1 pt-1">
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
            style={showWatchedRoute?{background:'rgba(167,139,250,0.2)',border:'1px solid rgba(167,139,250,0.4)',color:'rgba(196,181,253,0.9)'}:{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(107,114,128,0.6)'}}
            onClick={()=>setShowWatchedRoute(v=>!v)}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
            {showWatchedRoute?'▶':'◻'} 항해 항로
          </button>
          <button
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
            style={showExpeditionRoute?{background:'rgba(251,191,36,0.15)',border:'1px solid rgba(251,191,36,0.35)',color:'rgba(251,191,36,0.85)'}:{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',color:'rgba(107,114,128,0.6)'}}
            onClick={()=>setShowExpeditionRoute(v=>!v)}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
            {showExpeditionRoute?'▶':'◻'} 탐사 계획
          </button>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto px-4 py-3" style={{scrollbarWidth:'none',WebkitOverflowScrolling:'touch'}}>
        {MODE_OPTIONS.map(opt=>{
          const active=connectionMode===opt.value;
          return (
            <button key={opt.value}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all"
              style={active?{background:'rgba(139,92,246,0.28)',border:'1px solid rgba(139,92,246,0.5)',color:'rgba(196,181,253,1)'}
                :{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',color:'rgba(156,163,175,0.7)'}}
              onClick={()=>setConnectionMode(opt.value)}
              onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
              <span style={{fontSize:'13px'}}>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// AXIS OVERLAY — 일반 탐색 모드 좌표 의미 표시
// ============================================================
// AxisOverlay — world-space axes, rotate with scene (yaw/pitch/zoom)
function AxisOverlay({ vpSize, visible, yaw, pitch, zoom }) {
  if (!visible) return null;
  const fov = 850 * zoom;
  const vcx = vpSize.w / 2, vcy = vpSize.h / 2;
  const p3 = (wx, wy, wz) => {
    const r = rotatePoint({x:wx, y:wy, z:wz}, yaw, pitch);
    const pr = projectPoint(r, fov);
    return { sx: pr.screenX + vcx, sy: pr.screenY + vcy };
  };
  const O  = p3(0, 0, 0);
  const xN = p3(-360, 0, 0);   // 이성
  const xP = p3( 360, 0, 0);   // 감성
  const yN = p3(0,  290, 0);   // 어두움 (mood.y 음수)
  const yP = p3(0, -290, 0);   // 밝음
  const zN = p3(0, 0, -330);   // 현실
  const zP = p3(0, 0,  330);   // 판타지
  const lStyle = {fontSize:'9px',fontWeight:300,letterSpacing:'0.08em',fontFamily:'inherit',userSelect:'none'};
  return (
    <svg className="absolute inset-0 pointer-events-none"
      style={{width:vpSize.w,height:vpSize.h,zIndex:3,position:'absolute',top:0,left:0}}>
      <defs>
        <filter id="ax-sf" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.8" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* X — 이성↔감성 */}
      <line x1={xN.sx} y1={xN.sy} x2={xP.sx} y2={xP.sy}
        stroke="rgba(255,255,255,0.13)" strokeWidth="0.8" filter="url(#ax-sf)"/>
      <text x={xN.sx+2} y={xN.sy-6} fill="rgba(255,255,255,0.28)" style={lStyle}>이성</text>
      <text x={xP.sx-20} y={xP.sy-6} fill="rgba(255,255,255,0.28)" style={lStyle}>감성</text>
      {/* Y — 밝음↔어두움 */}
      <line x1={yP.sx} y1={yP.sy} x2={yN.sx} y2={yN.sy}
        stroke="rgba(255,255,255,0.13)" strokeWidth="0.8" filter="url(#ax-sf)"/>
      <text x={yP.sx+5} y={yP.sy+5} fill="rgba(255,255,255,0.28)" style={lStyle}>밝음</text>
      <text x={yN.sx+5} y={yN.sy-2} fill="rgba(255,255,255,0.28)" style={lStyle}>어두움</text>
      {/* Z — 현실↔판타지 (dashed) */}
      <line x1={zN.sx} y1={zN.sy} x2={zP.sx} y2={zP.sy}
        stroke="rgba(180,155,255,0.11)" strokeWidth="0.7" strokeDasharray="5 7"/>
      <text x={zN.sx+3} y={zN.sy+12} fill="rgba(180,155,255,0.25)" style={{...lStyle,fontSize:'8.5px'}}>현실</text>
      <text x={zP.sx-24} y={zP.sy-4} fill="rgba(180,155,255,0.25)" style={{...lStyle,fontSize:'8.5px'}}>판타지</text>
      {/* origin */}
      <circle cx={O.sx} cy={O.sy} r="2" fill="rgba(255,255,255,0.15)"/>
    </svg>
  );
}

// ============================================================
// GENRE CENTER GALAXY — soft galaxy haze for genre mode
// ============================================================
function GenreCenterGalaxy({ cx, cy, gId, spread=80, isFocused=false, onClick, zIndex=12, isMobile=false }) {
  const pal = getNPal(gId);
  const name = GENRE_NAMES[gId] || '';
  // outer haze covers the orbital area of member shows
  const hazeR = Math.min(280, Math.max(88, spread * 1.15));
  const bw = isFocused ? 340 : 76;
  const bh = isFocused ? 163 : 38;
  const [hovered, setHovered] = useState(false);
  return (
    <div className="absolute" style={{
      left:cx, top:cy, transform:'translate(-50%,-50%)',
      zIndex, cursor:'pointer',
      width: isFocused ? bw : Math.max(bw, 80),
      height: isFocused ? bh : Math.max(bh, 40),
      pointerEvents:'auto',
      overflow:'visible',
    }}
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
      onClick={e=>{e.stopPropagation();onClick&&onClick();}}>

      {/* 외곽 은하 haze / band spine — 제거 (blob/stripe 금지) */}

      {/* focus halo (PC only) */}
      {isFocused && !isMobile && <div className="absolute pointer-events-none" style={{
        left:-hazeR*0.4, top:-hazeR*0.3,
        width:hazeR*0.8+bw, height:hazeR*0.6+bh,
        borderRadius:'50%',
        background:`radial-gradient(ellipse at 50% 50%, ${pal.p}1c 0%, ${pal.s}0e 55%, transparent 80%)`,
        filter:'blur(14px)',
      }}/>}

      {/* inner core glow */}
      <div className="absolute pointer-events-none" style={{
        left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        width: isFocused ? bw : 54,
        height: isFocused ? bh*0.6 : 24,
        borderRadius:'50%',
        background:`radial-gradient(ellipse at 50% 50%, ${pal.c}${isFocused?'60':'45'} 0%, ${pal.p}22 55%, transparent 85%)`,
        filter: isFocused ? 'blur(6px)' : 'blur(4px)',
      }}/>

      {/* hover shimmer */}
      {(hovered || isFocused) && <div className="absolute pointer-events-none" style={{
        left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        width: isFocused ? bw*0.6 : 40,
        height: isFocused ? bh*0.4 : 18,
        borderRadius:'50%',
        background:`radial-gradient(ellipse at 38% 33%, rgba(255,255,255,0.14) 0%, transparent 70%)`,
      }}/>}

      {/* label */}
      <div className="absolute pointer-events-none" style={{
        left:'50%', top:'50%', transform:'translate(-50%,-50%)',
        color: isFocused ? pal.c : `${pal.c}d0`,
        fontSize: isFocused ? '13px' : '9px',
        fontWeight: isFocused ? 700 : 500,
        letterSpacing:'0.06em',
        textShadow:`0 0 16px ${pal.p},0 0 6px rgba(0,0,0,1)`,
        whiteSpace:'nowrap',
        textAlign:'center',
      }}>{name}</div>
    </div>
  );
}

// ============================================================
// NEW STAR CARD — 새 작품 등장 연출
// ============================================================
function NewStarCard({ show, vpSize, onDone }) {
  const posterUrl = buildPosterUrl(show.posterPath, 'w185');
  const pal = getNPal(show.genres?.[0] || 18);
  return (
    <motion.div className="fixed pointer-events-none flex flex-col items-center gap-3"
      style={{
        zIndex:88,
        left: vpSize.w/2, top: vpSize.h/2,
        transform:'translate(-50%,-50%)',
      }}
      initial={{opacity:0, scale:0.5}}
      animate={{opacity:[0,1,1,0], scale:[0.5,1,0.98,0.3], y:[0,-8,0,60]}}
      transition={{duration:3.0, times:[0,0.12,0.72,1], ease:'easeInOut'}}
      onAnimationComplete={onDone}>
      <div className="rounded-2xl overflow-hidden shadow-2xl"
        style={{background:'rgba(6,3,18,0.97)',border:`1px solid ${pal.p}60`,
          boxShadow:`0 0 32px ${pal.p}55,0 8px 40px rgba(0,0,0,0.8)`,
          padding:'16px',maxWidth:'220px'}}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs" style={{color:pal.c,opacity:0.7}}>✦ 새로운 별이 떴습니다</span>
        </div>
        {posterUrl && <img src={posterUrl} alt="" className="w-full rounded-xl mb-3 object-cover"
          style={{height:'6rem',border:`1px solid ${pal.p}35`}}/>}
        <p className="text-sm font-bold text-white mb-1">{show.title}</p>
        {show.overview && <p className="text-xs leading-relaxed line-clamp-2"
          style={{color:'rgba(209,213,219,0.65)'}}>{show.overview.slice(0,65)}…</p>}
      </div>
      <div className="w-0.5 h-8" style={{background:`linear-gradient(to bottom,${pal.c}88,transparent)`}}/>
    </motion.div>
  );
}

// ============================================================
// USER GALAXY VIEW — 유저의 본 작품 은하 시각화
// ============================================================
function UserGalaxyView({ profileUser, shows=[], watchedMap={}, wantMap={}, onClose }) {
  const watched = useMemo(()=>shows.filter(s=>watchedMap[s.id]),[shows,watchedMap]);
  const vpW = typeof window!=='undefined'?window.innerWidth:375;
  const vpH = typeof window!=='undefined'?window.innerHeight:812;
  const cx = vpW/2, cy = vpH/2;
  // layout: arrange on elliptical spiral
  const items = useMemo(()=>{
    return watched.map((s,i)=>{
      const n = watched.length || 1;
      const angle = (2*Math.PI*i/n) - Math.PI/2;
      const ringFrac = 0.4 + 0.6*(i/Math.max(n-1,1));
      const rx = Math.min(cx*0.72, 240) * ringFrac;
      const ry = rx * 0.45;
      const pal = getNPal(primaryGenre(s));
      return {
        s, angle,
        x: cx + rx*Math.cos(angle),
        y: cy + ry*Math.sin(angle),
        color: pal.c, glow: pal.p,
      };
    });
  },[watched,cx,cy]);

  return (
    <motion.div className="fixed inset-0 flex items-center justify-center" style={{zIndex:75}}
      initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}>
      <div className="absolute inset-0" style={{background:'rgba(2,1,10,0.97)'}}/>
      {/* galaxy haze bg */}
      <div className="absolute pointer-events-none" style={{
        left:cx, top:cy, transform:'translate(-50%,-50%)',
        width:Math.min(cx,320)*2.4, height:Math.min(cy,240)*2.4,
        borderRadius:'50%',
        background:'radial-gradient(ellipse at 50% 50%, rgba(109,40,217,0.12) 0%, rgba(30,27,75,0.08) 50%, transparent 80%)',
        filter:'blur(18px)',
      }}/>
      {/* works */}
      <div className="absolute inset-0 pointer-events-none">
        {items.map(({s,x,y,color,glow})=>{
          const sz = 7;
          return (
            <div key={s.id} className="absolute" style={{
              left:x, top:y, transform:'translate(-50%,-50%)',
              width:sz, height:sz, borderRadius:'50%',
              background:`radial-gradient(circle at 38% 32%,rgba(255,255,255,0.9),${color})`,
              boxShadow:`0 0 ${sz*2}px ${glow}88`,
            }}/>
          );
        })}
        {/* connecting threads */}
        <svg className="absolute inset-0" style={{width:vpW,height:vpH}}>
          {items.map(({s,x,y,glow})=>(
            <line key={`l-${s.id}`} x1={cx} y1={cy} x2={x} y2={y}
              stroke={`${glow}18`} strokeWidth="0.5"/>
          ))}
        </svg>
      </div>
      {/* user core */}
      <div className="absolute flex flex-col items-center gap-2 pointer-events-none" style={{left:cx,top:cy,transform:'translate(-50%,-50%)'}}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
          style={{background:'rgba(139,92,246,0.25)',border:'2px solid rgba(196,181,253,0.4)',
            boxShadow:'0 0 24px rgba(139,92,246,0.5)'}}>
          {profileUser.avatar||'✦'}
        </div>
        <span className="text-xs font-semibold" style={{color:'rgba(196,181,253,0.9)',textShadow:'0 0 8px rgba(139,92,246,0.8)'}}>{profileUser.user}</span>
        <span className="text-xs" style={{color:'rgba(107,114,128,0.6)'}}>본 작품 {watched.length}편</span>
      </div>
      {/* close */}
      <button className="absolute top-14 right-4 flex items-center gap-2 px-4 py-2 rounded-full text-sm"
        style={{background:'rgba(4,1,14,0.92)',border:'1px solid rgba(255,255,255,0.12)',color:'rgba(196,181,253,0.85)',zIndex:1}}
        onClick={onClose}>← 프로필로</button>
      {watched.length===0&&(
        <p className="relative text-sm" style={{color:'rgba(107,114,128,0.55)'}}>아직 본 작품이 없어요</p>
      )}
    </motion.div>
  );
}

// ============================================================
// MAIN
// ============================================================
export default function ByeolHayum() {
  const [shows, setShows]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [hoveredId, setHoveredId]       = useState(null);
  const [selectedId, setSelectedId]     = useState(null);
  const [previewId, setPreviewId]       = useState(null);
  const [query, setQuery]               = useState('');
  const [showSearch, setShowSearch]     = useState(false);
  const [connectionMode, setConnectionMode] = useState('none');
  const [currentUser, setCurrentUser]   = useState(null);
  const [watchedMap, setWatchedMap]     = useState({});
  const [wantMap, setWantMap]           = useState({});
  const [showWatchedRoute, setShowWatchedRoute]       = useState(true);
  const [showExpeditionRoute, setShowExpeditionRoute] = useState(true);
  const [favoriteActors, setFavoriteActors] = useState([]);
  const [favoriteDirectors, setFavoriteDirectors] = useState([]);
  const [favoriteWriters, setFavoriteWriters] = useState([]);
  const [focusedActor, setFocusedActor]     = useState(null);
  const [actorQuery, setActorQuery]         = useState('');
  const [focusedDirector, setFocusedDirector] = useState(null);
  const [directorQuery, setDirectorQuery]   = useState('');
  const [focusedWriter, setFocusedWriter]   = useState(null);
  const [writerQuery, setWriterQuery]       = useState('');
  const [highlightColor, setHighlightColor] = useState('#a78bfa');
  const [yaw, setYaw]                   = useState(0.3);
  const [pitch, setPitch]               = useState(-0.15);
  const [zoom, setZoom]                 = useState(1);
  const [orbitStrength, setOrbitStrength] = useState(0);
  const [vpSize, setVpSize]             = useState({
    w: typeof window!=='undefined'?window.innerWidth:375,
    h: typeof window!=='undefined'?window.innerHeight:812,
  });
  const [showLogin, setShowLogin]       = useState(false);
  const [relatedQuery, setRelatedQuery] = useState(null); // {type:'genre'|'director'|'writer', value}
  const [relatedFocus, setRelatedFocus] = useState(null); // {type, value} — 카메라 진입 + 별 dimming용
  const [relatedWorksPage, setRelatedWorksPage] = useState(0);
  const [orbitTime, setOrbitTime] = useState(0); // 공전 애니메이션 시간
  const [loginNick, setLoginNick]       = useState('');
  const [shareMsg, setShareMsg]         = useState('');
  const [showFeed, setShowFeed]         = useState(false); // 전체 코멘트 피드
  const [profileUser, setProfileUser]   = useState(null); // {user, avatar}
  const [userGalaxyView, setUserGalaxyView] = useState(null); // {user, avatar} — 유저 은하 뷰
  const [newShowQueue, setNewShowQueue] = useState([]); // 새 작품 알림 큐 [{show, key}]
  const prevShowIdsRef = useRef(new Set()); // 이전에 알려진 show ID들

  const isMobile = useMemo(()=>vpSize.w<768,[vpSize.w]);
  const canvasRef = useRef(null);
  const dragRef   = useRef({dragging:false,lastX:0,lastY:0});
  const pinchRef  = useRef({active:false,dist:0});
  const yawRef    = useRef(0.3);
  const pitchRef  = useRef(-0.15);
  const zoomRef   = useRef(1);
  const orbitRef  = useRef(0);
  const orbitTimeRef  = useRef(0);  // 공전 애니메이션 누적 시간
  const lastOrbitTRef = useRef(0);  // setOrbitTime 마지막 호출 시점
  const animTarget   = useRef({yaw:0.3,pitch:-0.15,zoom:1,orbit:0});
  const rafRef       = useRef(null);
  const isFlyingRef  = useRef(false); // focus 진입 시 LERP 가속 플래그
  const hasAnyFocusRef = useRef(false); // focus 상태 drag 감도 조절용

  // Viewport resize
  useEffect(()=>{
    const fn=()=>setVpSize({w:window.innerWidth,h:window.innerHeight});
    window.addEventListener('resize',fn);
    return()=>window.removeEventListener('resize',fn);
  },[]);

  // Animation loop — 카메라 느낌: yaw/pitch 빠르게, zoom 천천히 (dolly feel)
  useEffect(()=>{
    const lerp=(a,b,t)=>a+(b-a)*t;
    const tick=()=>{
      const flying=isFlyingRef.current;
      // focus 진입 시 rot/zoom 모두 빠르게
      const LERP_ROT  = flying ? 0.22 : 0.11;
      const LERP_ZOOM = flying ? 0.14 : 0.07;
      const LERP_ORBIT= 0.09;
      const t=animTarget.current;
      const ny=lerp(yawRef.current,t.yaw,LERP_ROT),np=lerp(pitchRef.current,t.pitch,LERP_ROT);
      const nz=lerp(zoomRef.current,t.zoom,LERP_ZOOM),no=lerp(orbitRef.current,t.orbit,LERP_ORBIT);
      const changed=Math.abs(ny-yawRef.current)>0.00008||Math.abs(np-pitchRef.current)>0.00008||
        Math.abs(nz-zoomRef.current)>0.0005||Math.abs(no-orbitRef.current)>0.0015;
      yawRef.current=ny;pitchRef.current=np;zoomRef.current=nz;orbitRef.current=no;
      if(changed){setYaw(ny);setPitch(np);setZoom(nz);setOrbitStrength(no);}
      // 공전 애니메이션 — 약 10fps 로 update (성능 절약)
      orbitTimeRef.current += 0.00022;
      if(orbitTimeRef.current - lastOrbitTRef.current > 0.007){
        lastOrbitTRef.current = orbitTimeRef.current;
        setOrbitTime(orbitTimeRef.current);
      }
      rafRef.current=requestAnimationFrame(tick);
    };
    rafRef.current=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(rafRef.current);
  },[]);

  useEffect(()=>{
    animTarget.current.orbit=['genre','director','writer'].includes(connectionMode)?1:0;
    if(connectionMode!=='actor')    { setFocusedActor(null);    setActorQuery(''); }
    if(connectionMode!=='director') { setFocusedDirector(null); setDirectorQuery(''); }
    if(connectionMode!=='writer')   { setFocusedWriter(null);   setWriterQuery(''); }
    // 모드 전환 시 이전 system 자동 닫기
    setRelatedQuery(null);
    setRelatedFocus(null);
    setSelectedId(null);
  },[connectionMode]);

  // relatedQuery 변경 시 페이지 리셋
  useEffect(()=>{ setRelatedWorksPage(0); },[relatedQuery]);

  // focusedActor 변경 시 카메라 fly-in (actor mode와 동일한 강도)
  useEffect(()=>{
    if(!focusedActor) return;
    const members=projectedShows.filter(s=>(s.cast||[]).includes(focusedActor));
    if(!members.length) return;
    isFlyingRef.current=true;
    setTimeout(()=>{isFlyingRef.current=false;},1200);
    const avgX=members.reduce((s,m)=>s+(m.sceneX||0),0)/members.length;
    const avgZ=members.reduce((s,m)=>s+(m.sceneZ||0),0)/members.length;
    const avgY=members.reduce((s,m)=>s+(m.sceneY||0),0)/members.length;
    const raw={x:avgX*520,y:avgY*380,z:avgZ*440};
    const ty=Math.atan2(-raw.x,raw.z);
    const z1=-raw.x*Math.sin(ty)+raw.z*Math.cos(ty);
    const tp=Math.max(-Math.PI/2.4,Math.min(Math.PI/2.4,Math.atan2(raw.y,z1)));
    animTarget.current.yaw=ty;
    animTarget.current.pitch=tp;
    animTarget.current.zoom=Math.min(5.0,Math.max(3.8,zoomRef.current+2.2));
  },[focusedActor]);

  // focusedDirector/focusedWriter 변경 시 카메라 fly-in
  useEffect(()=>{
    const person=focusedDirector||focusedWriter;
    const field=focusedDirector?'directors':'writers';
    if(!person) return;
    const members=projectedShows.filter(s=>(s[field]||[]).includes(person));
    if(!members.length) return;
    isFlyingRef.current=true;
    setTimeout(()=>{isFlyingRef.current=false;},1200);
    const avgX=members.reduce((s,m)=>s+(m.sceneX||0),0)/members.length;
    const avgZ=members.reduce((s,m)=>s+(m.sceneZ||0),0)/members.length;
    const avgY=members.reduce((s,m)=>s+(m.sceneY||0),0)/members.length;
    const raw={x:avgX*520,y:avgY*380,z:avgZ*440};
    const ty=Math.atan2(-raw.x,raw.z);
    const z1=-raw.x*Math.sin(ty)+raw.z*Math.cos(ty);
    const tp=Math.max(-Math.PI/2.4,Math.min(Math.PI/2.4,Math.atan2(raw.y,z1)));
    animTarget.current.yaw=ty;
    animTarget.current.pitch=tp;
    animTarget.current.zoom=Math.min(5.0,Math.max(3.8,zoomRef.current+2.2));
  },[focusedDirector,focusedWriter]);

  // TMDB — 인기순 7p + 평점순 5p + 최신순 3p → dedupe → 전체 credits 병렬 batch
  useEffect(()=>{
    const fetch_=async()=>{
      try {
        setLoading(true);
        const base=`api_key=${TMDB_API_KEY}&language=ko-KR&with_genres=${DRAMA_GENRE_ID}&with_origin_country=KR`;
        const pages = (sort, n, extra='') =>
          Array.from({length:n},(_,i)=>
            fetch(`${TMDB_BASE}/discover/tv?${base}&sort_by=${sort}&page=${i+1}${extra}`)
              .then(r=>r.json()).catch(()=>({results:[]}))
          );
        const [popRes, ratingRes, dateRes] = await Promise.all([
          Promise.all(pages('popularity.desc', 7)),
          Promise.all(pages('vote_average.desc', 5, '&vote_count.gte=150')),
          Promise.all(pages('first_air_date.desc', 3, '&vote_count.gte=30')),
        ]);
        const seenIds=new Set();
        const unique=[...popRes,...ratingRes,...dateRes].flatMap(r=>r.results||[]).filter(s=>{
          if(seenIds.has(s.id)) return false; seenIds.add(s.id); return isDramaLike(s);
        });
        if(unique.length<5){setShows(FALLBACK_SHOWS);setError('샘플 데이터를 사용합니다.');setLoading(false);return;}
        // credits: 전체 대상 batch 15 병렬 처리
        const withCreds=[];
        for(let i=0;i<unique.length;i+=15){
          const batch=unique.slice(i,i+15);
          const res=await Promise.all(batch.map(s=>
            fetch(`${TMDB_BASE}/tv/${s.id}?api_key=${TMDB_API_KEY}&language=ko-KR&append_to_response=credits`)
              .then(r=>r.json()).catch(()=>s)
          ));
          withCreds.push(...res);
        }
        const normalized = withCreds.map(normalizeShow);
        // 새 작품 감지 — 이전 로드와 비교
        const prevIds = prevShowIdsRef.current;
        if(prevIds.size > 0) {
          const newcomers = normalized.filter(s => !prevIds.has(s.id));
          if(newcomers.length > 0) {
            setNewShowQueue(q => [...q, ...newcomers.slice(0,5).map(s=>({show:s,key:`nsc-${s.id}-${Date.now()}`}))]);
          }
        }
        prevShowIdsRef.current = new Set(normalized.map(s=>s.id));
        setShows(normalized);
      } catch(e) {
        console.error(e);
        setShows(FALLBACK_SHOWS); setError('API 연결 실패. 샘플 데이터를 표시합니다.');
      } finally { setLoading(false); }
    };
    fetch_();
  },[]);

  // Projected
  const projectedShows=useMemo(()=>{
    return shows.map(show=>{
      const raw=mapToScene(show), rotated=rotatePoint(raw,yaw,pitch);
      const proj=projectPoint(rotated,850*zoom);
      // depth alpha: 가까운 천체는 선명, 먼 천체는 depth fog로 페이드
      const depthAlpha=Math.max(0.18, Math.min(1, (proj.scale - 0.25) / 1.2));
      // 오른쪽 패널(데스크톱만) 열려 있을 때 남은 가용 영역 기준으로 중앙 정렬
      const panelW = (!isMobile && relatedQuery) ? Math.min(320, vpSize.w*0.88) : 0;
      const centerX = (vpSize.w - panelW) / 2;
      return {...show,proj,screenX:proj.screenX+centerX,screenY:proj.screenY+vpSize.h/2,depthAlpha};
    }).sort((a,b)=>a.proj.z-b.proj.z);
  },[shows,yaw,pitch,vpSize,zoom,relatedQuery]);

  const filteredShows=useMemo(()=>{
    if(!query) return projectedShows;
    const q=query.toLowerCase();
    return projectedShows.filter(s=>s.title.toLowerCase().includes(q)||s.overview.toLowerCase().includes(q));
  },[projectedShows,query]);

  const genreGroupsAll=useMemo(()=>{
    const g={}; projectedShows.forEach(s=>{const k=primaryGenre(s).toString();if(!g[k])g[k]=[];g[k].push(s);});
    const raw = Object.entries(g).map(([key,members])=>{
      const cx=members.reduce((s,m)=>s+m.screenX,0)/members.length;
      const cy=members.reduce((s,m)=>s+m.screenY,0)/members.length;
      const spread=Math.sqrt(members.reduce((s,m)=>s+(m.screenX-cx)**2+(m.screenY-cy)**2,0)/members.length);
      const avgScale=members.reduce((s,m)=>s+m.proj.scale,0)/members.length;
      return {key,members,cx,cy,spread,avgScale};
    });
    return spreadSystemCenters(raw, vpSize.w, vpSize.h, 155);
  },[projectedShows, vpSize]);

  const genreOrbPosAll=useMemo(()=>computeOrbitalPositions(genreGroupsAll),[genreGroupsAll]);

  // genreNebulae는 genreGroupsAll의 spread 중심과 동일 기준으로 계산 (haze↔galaxy center 정렬)
  const genreNebulae=useMemo(()=>{
    return genreGroupsAll.map(group=>{
      const gId=Number(group.key);
      const r=Math.max(110, group.spread*2.2);
      return {genre:gId, x:group.cx, y:group.cy, r};
    });
  },[genreGroupsAll]);

  // 배우/감독/작가 인덱스 (출현 횟수 순)
  const allActors=useMemo(()=>{
    const cnt={};
    shows.forEach(s=>(s.cast||[]).forEach(n=>{cnt[n]=(cnt[n]||0)+1;}));
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  },[shows]);
  const allDirectors=useMemo(()=>{
    const cnt={};
    shows.forEach(s=>(s.directors||[]).forEach(n=>{cnt[n]=(cnt[n]||0)+1;}));
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  },[shows]);
  const allWriters=useMemo(()=>{
    const cnt={};
    shows.forEach(s=>(s.writers||[]).forEach(n=>{cnt[n]=(cnt[n]||0)+1;}));
    return Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count}));
  },[shows]);

  // 감독/작가 모드 — 배경 system cluster (검색 전에도 보이는 다수 그룹)
  const BACKGROUND_PERSON_LIMIT = 14;
  const directorGroupsAll = useMemo(()=>{
    if(connectionMode!=='director') return [];
    const raw = allDirectors.slice(0, BACKGROUND_PERSON_LIMIT).map(({name})=>{
      const members=projectedShows.filter(s=>(s.directors||[]).includes(name));
      if(members.length<2) return null;
      const cx=members.reduce((s,m)=>s+m.screenX,0)/members.length;
      const cy=members.reduce((s,m)=>s+m.screenY,0)/members.length;
      return {key:name, members, cx, cy, color:deriveSystemColor(members), glow:deriveSystemGlow(members)};
    }).filter(Boolean);
    return spreadSystemCenters(raw, vpSize.w, vpSize.h, 135);
  },[connectionMode,allDirectors,projectedShows,vpSize]);

  const writerGroupsAll = useMemo(()=>{
    if(connectionMode!=='writer') return [];
    const raw = allWriters.slice(0, BACKGROUND_PERSON_LIMIT).map(({name})=>{
      const members=projectedShows.filter(s=>(s.writers||[]).includes(name));
      if(members.length<2) return null;
      const cx=members.reduce((s,m)=>s+m.screenX,0)/members.length;
      const cy=members.reduce((s,m)=>s+m.screenY,0)/members.length;
      return {key:name, members, cx, cy, color:deriveSystemColor(members), glow:deriveSystemGlow(members)};
    }).filter(Boolean);
    return spreadSystemCenters(raw, vpSize.w, vpSize.h, 135);
  },[connectionMode,allWriters,projectedShows,vpSize]);

  // 감독/작가 배경 orbital positions — orbitStrength로 부드럽게 중심 주변 배치
  const directorOrbPosAll=useMemo(()=>{
    if(connectionMode!=='director') return {};
    return computeOrbitalPositions(directorGroupsAll);
  },[connectionMode,directorGroupsAll]);

  const writerOrbPosAll=useMemo(()=>{
    if(connectionMode!=='writer') return {};
    return computeOrbitalPositions(writerGroupsAll);
  },[connectionMode,writerGroupsAll]);

  // 인물 포커스 (actor/director/writer 공통) — 해당 인물 작품 ID set
  const actorFocusedShowIds=useMemo(()=>{
    if(connectionMode==='actor'   &&focusedActor)
      return new Set(filteredShows.filter(s=>(s.cast||[]).includes(focusedActor)).map(s=>s.id));
    if(connectionMode==='director'&&focusedDirector)
      return new Set(filteredShows.filter(s=>(s.directors||[]).includes(focusedDirector)).map(s=>s.id));
    if(connectionMode==='writer'  &&focusedWriter)
      return new Set(filteredShows.filter(s=>(s.writers||[]).includes(focusedWriter)).map(s=>s.id));
    return null;
  },[connectionMode,focusedActor,focusedDirector,focusedWriter,filteredShows]);

  // focus orbit 좌표: actor/director/writer focus 시 겹침 방지 multi-ring 배치
  // 관련작 포커스: relatedFocus 있으면 해당 작품 ID set (dimming용)
  const relatedFocusedShowIds=useMemo(()=>{
    if(!relatedFocus) return null;
    const {type,value}=relatedFocus;
    if(type==='genre') return new Set(projectedShows.filter(s=>{
      const txt=`${s.title||''} ${s.overview||''}`.toLowerCase();
      const d=resolveGenreDisplay(s.genres||s.genre_ids||[],txt);
      return d.includes(value)||(s.genres||[]).includes(value);
    }).map(s=>s.id));
    if(type==='director') return new Set(projectedShows.filter(s=>(s.directors||[]).includes(value)).map(s=>s.id));
    if(type==='writer')   return new Set(projectedShows.filter(s=>(s.writers||[]).includes(value)).map(s=>s.id));
    return null;
  },[relatedFocus,projectedShows]);

  // focus orbit 좌표: person focus = 중심 주변 recency ring, system focus = 뷰포트 중심 대형 궤도
  const focusOrbits=useMemo(()=>{
    const isPersonMode=['actor','director','writer'].includes(connectionMode);
    const panelW = (!isMobile && relatedQuery) ? Math.min(320, vpSize.w*0.88) : 0;
    const mobilePanelH = (isMobile && relatedQuery) ? vpSize.h * 0.55 : 0;
    const vcx = (vpSize.w - panelW) / 2;
    const vcy = (vpSize.h - mobilePanelH) / 2;

    if(actorFocusedShowIds!==null){
      const members=projectedShows.filter(s=>actorFocusedShowIds.has(s.id));
      if(members.length<2) return {};
      // director/writer: 뷰포트 중심 기준 (actor는 화면상 centroid)
      const useCenter = connectionMode==='director'||connectionMode==='writer';
      const cx = useCenter ? vcx : members.reduce((s,m)=>s+m.screenX,0)/members.length;
      const cy = useCenter ? vcy : members.reduce((s,m)=>s+m.screenY,0)/members.length;
      return computePersonOrbits(members, cx, cy);
    }
    if(relatedFocusedShowIds!==null){
      const members=projectedShows.filter(s=>relatedFocusedShowIds.has(s.id));
      if(members.length<2) return {};
      // 뷰포트 중심 기준 대형 궤도 (항성계 도식)
      return computeSystemFocusOrbits(members, vcx, vcy);
    }
    return {};
  },[actorFocusedShowIds,relatedFocusedShowIds,projectedShows,connectionMode,vpSize,relatedQuery]);

  // 관련작 포커스 핸들러 — 카메라 그 구역으로 진입 + sheet 열기
  const openRelated=useCallback(q=>{
    isFlyingRef.current=true;
    // 1.2s 후 일반 LERP로 복귀
    setTimeout(()=>{isFlyingRef.current=false;},1200);
    setRelatedFocus(q);
    setRelatedQuery(q);
    const {type,value}=q;
    // projectedShows 기반으로 찾되, 없으면 shows(raw) 기반으로 scene 좌표 사용
    let relShows=[];
    if(type==='genre') relShows=projectedShows.filter(s=>{
      const txt=`${s.title||''} ${s.overview||''}`.toLowerCase();
      const d=resolveGenreDisplay(s.genres||s.genre_ids||[],txt);
      return d.includes(value)||(s.genres||[]).includes(value);
    });
    else if(type==='director') relShows=projectedShows.filter(s=>(s.directors||[]).includes(value));
    else if(type==='writer')   relShows=projectedShows.filter(s=>(s.writers||[]).includes(value));
    // fallback: raw shows (credits 로드 전)
    if(relShows.length===0&&(type==='director'||type==='writer')){
      const rawMatches=shows.filter(s=>(type==='director'?s.directors:s.writers)||[]).filter?.(
        s=>(type==='director'?s.directors:s.writers||[]).includes(value)
      );
      if(rawMatches?.length>0) relShows=rawMatches.map(s=>({...s,sceneX:s.sceneX,sceneY:s.sceneY,sceneZ:s.sceneZ}));
    }
    if(relShows.length>0){
      const avgX=relShows.reduce((s,m)=>s+(m.sceneX||0),0)/relShows.length;
      const avgZ=relShows.reduce((s,m)=>s+(m.sceneZ||0),0)/relShows.length;
      const avgY=relShows.reduce((s,m)=>s+(m.sceneY||0),0)/relShows.length;
      const raw={x:avgX*520, y:avgY*380, z:avgZ*440};
      const ty=Math.atan2(-raw.x,raw.z);
      const z1=-raw.x*Math.sin(ty)+raw.z*Math.cos(ty);
      const tp=Math.max(-Math.PI/2.4,Math.min(Math.PI/2.4,Math.atan2(raw.y,z1)));
      animTarget.current.yaw  =ty;
      animTarget.current.pitch=tp;
      // 절대값 타겟: director/writer 최소 zoom 3.8, genre 최소 3.2
      const minZ=(type==='director'||type==='writer')?3.8:3.2;
      animTarget.current.zoom=Math.min(5.0, Math.max(minZ, zoomRef.current+2.2));
    }
  },[projectedShows,shows]);

  const constellationGroups=useMemo(()=>{
    if(['none','genre','watched'].includes(connectionMode)) return [];
    // actor/director/writer 모두 검색 기반 단일 항성계
    const makeGroup=(key,field,color)=>{
      if(!key) return [];
      const members=filteredShows.filter(s=>(s[field]||[]).includes(key));
      if(!members.length) return [];
      const cx=members.reduce((s,m)=>s+m.screenX,0)/members.length;
      const cy=members.reduce((s,m)=>s+m.screenY,0)/members.length;
      return [{key,members,cx,cy,avgScale:1,color}];
    };
    if(connectionMode==='actor')    return makeGroup(focusedActor,   'cast',      '#fbbf24');
    if(connectionMode==='director') return makeGroup(focusedDirector,'directors','#c4b5fd');
    if(connectionMode==='writer')   return makeGroup(focusedWriter,  'writers',  '#6ee7b7');
    return [];
  },[filteredShows,connectionMode,focusedActor,focusedDirector,focusedWriter]);

  const orbitalPositions=useMemo(()=>{
    if(connectionMode==='genre') return genreOrbPosAll;
    if(connectionMode==='director') return directorOrbPosAll;
    if(connectionMode==='writer') return writerOrbPosAll;
    return {};
  },[connectionMode,genreOrbPosAll,directorOrbPosAll,writerOrbPosAll]);

  // focus 상태 ref 동기화
  useEffect(()=>{
    hasAnyFocusRef.current = !!relatedFocus || actorFocusedShowIds!==null;
  });

  // Drag helpers
  // camera pan — focus 상태에서 감도 감소 (정밀 탐색)
  const applyDrag=useCallback((dx,dy)=>{
    const speed = hasAnyFocusRef.current ? 0.0016 : 0.0048;
    animTarget.current.yaw  = yawRef.current  + dx*speed;
    animTarget.current.pitch= Math.max(-Math.PI/2.1,Math.min(Math.PI/2.1, pitchRef.current+dy*speed));
  },[]);

  // camera dolly
  const applyZoom=useCallback(delta=>{
    animTarget.current.zoom=Math.max(0.3,Math.min(5.0,zoomRef.current+delta));
  },[]);

  // Attach non-passive event listeners
  useEffect(()=>{
    const el=canvasRef.current; if(!el) return;
    const onWheel=e=>{e.preventDefault();applyZoom(-e.deltaY*0.0014);};
    const onTouchStart=e=>{
      if(e.touches.length===1){
        const t=e.touches[0];
        dragRef.current={dragging:true,lastX:t.clientX,lastY:t.clientY};
        pinchRef.current={active:false,dist:0};
      } else if(e.touches.length===2){
        dragRef.current.dragging=false;
        pinchRef.current={active:true,dist:getTouchDist(e.touches)};
      }
    };
    const onTouchMove=e=>{
      e.preventDefault();
      if(e.touches.length===1&&dragRef.current.dragging){
        const t=e.touches[0];
        applyDrag(t.clientX-dragRef.current.lastX,t.clientY-dragRef.current.lastY);
        dragRef.current.lastX=t.clientX; dragRef.current.lastY=t.clientY;
      } else if(e.touches.length===2&&pinchRef.current.active){
        const nd=getTouchDist(e.touches), ratio=nd/Math.max(pinchRef.current.dist,1);
        applyZoom((ratio-1)*3.2); pinchRef.current.dist=nd;
      }
    };
    const onTouchEnd=e=>{
      if(e.touches.length===0){dragRef.current.dragging=false;pinchRef.current.active=false;}
      else if(e.touches.length===1){
        pinchRef.current.active=false;
        const t=e.touches[0]; dragRef.current={dragging:true,lastX:t.clientX,lastY:t.clientY};
      }
    };
    el.addEventListener('wheel',onWheel,{passive:false});
    el.addEventListener('touchstart',onTouchStart,{passive:true});
    el.addEventListener('touchmove',onTouchMove,{passive:false});
    el.addEventListener('touchend',onTouchEnd,{passive:true});
    return()=>{
      el.removeEventListener('wheel',onWheel);
      el.removeEventListener('touchstart',onTouchStart);
      el.removeEventListener('touchmove',onTouchMove);
      el.removeEventListener('touchend',onTouchEnd);
    };
  },[applyDrag,applyZoom]);

  // Mouse events
  const handleMouseDown=useCallback(e=>{dragRef.current={dragging:true,lastX:e.clientX,lastY:e.clientY};},[]);
  const handleMouseMove=useCallback(e=>{
    if(!dragRef.current.dragging) return;
    applyDrag(e.clientX-dragRef.current.lastX,e.clientY-dragRef.current.lastY);
    dragRef.current.lastX=e.clientX; dragRef.current.lastY=e.clientY;
  },[applyDrag]);
  const handleMouseUp=useCallback(()=>{dragRef.current.dragging=false;},[]);

  // Star interactions
  const handleStarClick=useCallback(id=>{
    setSelectedId(id);setHoveredId(null);setPreviewId(null);
    const show=shows.find(s=>s.id===id); if(!show) return;
    const raw=mapToScene(show), ty=Math.atan2(-raw.x,raw.z);
    const z1=-raw.x*Math.sin(ty)+raw.z*Math.cos(ty);
    const tp=Math.max(-Math.PI/2.4,Math.min(Math.PI/2.4,Math.atan2(raw.y,z1)));
    animTarget.current={...animTarget.current,yaw:ty,pitch:tp,zoom:2.2};
  },[shows]);
  const handleLongPress=useCallback(id=>setPreviewId(id),[]);

  // 항성계 lock-in 해제 — 뒤로 가기
  const handleBackFromSystem=useCallback(()=>{
    setRelatedFocus(null);
    setRelatedQuery(null);
    setFocusedActor(null);
    setFocusedDirector(null);
    setFocusedWriter(null);
    animTarget.current.zoom=Math.max(0.7, zoomRef.current-1.8);
    isFlyingRef.current=true;
    setTimeout(()=>{isFlyingRef.current=false;},800);
  },[]);

  const toggleWatched=useCallback(id=>setWatchedMap(prev=>({...prev,[id]:!prev[id]})),[]);
  const toggleWant=useCallback(id=>setWantMap(prev=>({...prev,[id]:!prev[id]})),[]);
  const toggleFavoriteActor=useCallback(name=>setFavoriteActors(prev=>prev.includes(name)?prev.filter(n=>n!==name):[...prev,name]),[]);
  const toggleFavoriteDirector=useCallback(name=>setFavoriteDirectors(prev=>prev.includes(name)?prev.filter(n=>n!==name):[...prev,name]),[]);
  const toggleFavoriteWriter=useCallback(name=>setFavoriteWriters(prev=>prev.includes(name)?prev.filter(n=>n!==name):[...prev,name]),[]);
  const handleShare=useCallback(async()=>{
    const text=`${currentUser?.nickname||'별헤윰 유저'} 은하로 놀러와 ✨`;
    try {
      if(navigator.share) await navigator.share({title:'별헤윰',text,url:window.location.href});
      else {await navigator.clipboard.writeText(`${text}\n${window.location.href}`);setShareMsg('복사됨!');setTimeout(()=>setShareMsg(''),2000);}
    } catch {setShareMsg('공유 실패');setTimeout(()=>setShareMsg(''),2000);}
  },[currentUser]);
  const handleLogin=useCallback(provider=>{
    setCurrentUser({nickname:loginNick||`star_${Math.floor(Math.random()*9999)}`,provider});
    setShowLogin(false);setLoginNick('');
  },[loginNick]);

  const displayedShows=useMemo(()=>{
    const base=query?filteredShows:projectedShows;
    if(connectionMode==='watched') return base.filter(s=>watchedMap[s.id]||wantMap[s.id]);
    return base;
  },[query,filteredShows,projectedShows,connectionMode,watchedMap,wantMap]);
  const hoveredShow =hoveredId ?filteredShows.find(s=>s.id===hoveredId):null;
  const previewShow =previewId ?filteredShows.find(s=>s.id===previewId):null;
  const selectedShow=selectedId?shows.find(s=>s.id===selectedId):null;

  return (
    <div ref={canvasRef} className="fixed inset-0 overflow-hidden select-none"
      style={{background:'#030209',fontFamily:"'Pretendard','Apple SD Gothic Neo',system-ui,sans-serif",
        cursor:'grab',touchAction:'none'}}
      onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

      {/* 1. 은하 배경 */}
      <GalaxyBackground showCount={shows.length} isOrbitMode={connectionMode==='genre'} isMobile={isMobile} yaw={yaw} pitch={pitch}/>

      {/* 1b. 좌표축 오버레이 — 일반 탐색 모드에서만 */}
      <AxisOverlay vpSize={vpSize} yaw={yaw} pitch={pitch} zoom={zoom}
        visible={connectionMode==='none' && !relatedFocus && actorFocusedShowIds===null}/>

      {/* 항성계 lock-in 뒤로 가기 버튼 */}
      <AnimatePresence>
        {(relatedFocus||actorFocusedShowIds!==null)&&(
          <motion.button
            key="back-btn"
            className="fixed flex items-center gap-2"
            style={{top:'3.8rem',left:'1rem',zIndex:55,
              background:'rgba(4,1,14,0.94)',backdropFilter:isMobile?'none':'blur(14px)',
              border:'1px solid rgba(255,255,255,0.13)',
              color:'rgba(255,255,255,0.88)',borderRadius:'12px',
              padding:'0.45rem 1rem',fontSize:'13px',fontWeight:600,cursor:'pointer'}}
            initial={{opacity:0,x:-18}} animate={{opacity:1,x:0}} exit={{opacity:0,x:-18}}
            transition={{duration:0.22}}
            onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
            onClick={handleBackFromSystem}>
            ← 항성계 나가기
          </motion.button>
        )}
      </AnimatePresence>

      {/* 2. 성간 haze — 선택 장르만 local cloud */}
      <GenreHazeLayer genreNebulae={genreNebulae}
        focusedGenreKey={connectionMode==='genre'&&relatedFocus?String(relatedFocus.value):null}/>
      {/* 2b. 작품별 초미세 tint — genre mode only, selected genre only */}
      {connectionMode==='genre'&&relatedFocus&&(
        <PerStarGenreTint shows={displayedShows.filter(s=>{
          const txt=`${s.title||''} ${s.overview||''}`.toLowerCase();
          const d=resolveGenreDisplay(s.genres||[],txt);
          const gv=relatedFocus.value;
          return d.includes(gv)||(s.genres||[]).includes(gv);
        })} orbitalPositions={orbitalPositions} orbitStrength={orbitStrength}/>
      )}

      {/* 2c. 장르 포커스 dim overlay — 선택 장르 배경 강조 */}
      {relatedFocus?.type==='genre'&&(
        <div className="absolute inset-0 pointer-events-none"
          style={{zIndex:7, background:'rgba(0,0,0,0.62)', transition:'opacity 0.35s'}}/>
      )}

      {/* 3. TopBar */}
      <TopBar currentUser={currentUser} highlightColor={highlightColor} setHighlightColor={setHighlightColor}
        onLogin={()=>setShowLogin(true)} onShare={handleShare} shareMsg={shareMsg}
        onOpenSearch={()=>setShowSearch(true)} isMobile={isMobile}/>

      {/* 4. 항성계 레이어 */}
      {(()=>{
        const focusedGroupKey=
          (connectionMode==='actor'&&focusedActor)?focusedActor:
          (connectionMode==='director'&&focusedDirector)?focusedDirector:
          (connectionMode==='writer'&&focusedWriter)?focusedWriter:
          relatedFocus?String(relatedFocus.value):null;
        return (
          <StarSystemLayer genreGroupsAll={genreGroupsAll} genreOrbPosAll={genreOrbPosAll}
            personGroupsAll={connectionMode==='director'?directorGroupsAll:connectionMode==='writer'?writerGroupsAll:[]}
            connectionGroups={constellationGroups} connectionMode={connectionMode}
            highlightColor={highlightColor} orbitStrength={orbitStrength}
            focusedGroupKey={focusedGroupKey} isMobile={isMobile}
            onNameClick={q=>{setSelectedId(null);openRelated(q);}}/>
        );
      })()}

      {/* 5. 항해 항적 (watched route) */}
      <WatchedRouteLayer shows={displayedShows} watchedMap={watchedMap} highlightColor={highlightColor} showRoute={showWatchedRoute}/>
      {/* 5b. 탐사 계획 경로 (expedition route) */}
      <ExpeditionRouteLayer shows={displayedShows} wantMap={wantMap} showRoute={showExpeditionRoute}/>

      {/* 6. Drama nodes */}
      <div className="absolute inset-0" style={{zIndex:10}}>
        {displayedShows.map(show=>{
          const op=orbitalPositions[show.id];
          const fp=focusOrbits[show.id];
          let bsx, bsy;
          let focusPlanetMult = 3.2;
          let orbitZIndex = 9000;
          if(fp && fp.rx !== undefined) {
            // 중심 항성 기준 static 배치 (orbit animation 제거)
            bsx = fp.x;
            bsy = fp.y;
            // 안쪽 ring일수록 행성 크기 크게
            focusPlanetMult = Math.max(2.0, Math.min(6.0, 5.8 * (1 - fp.rx / 480)));
            orbitZIndex = 9200;
          } else if(fp) {
            bsx=fp.x; bsy=fp.y;
            focusPlanetMult = 5.0; // person orbit — 별 크기 키우기
            orbitZIndex = 9200;
          } else if(op) {
            bsx=show.screenX+(op.x-show.screenX)*orbitStrength;
            bsy=show.screenY+(op.y-show.screenY)*orbitStrength;
          } else {
            bsx=show.screenX; bsy=show.screenY;
          }
          return (
            <StarNode key={show.id} show={{...show,screenX:bsx,screenY:bsy}}
              isWatched={!!watchedMap[show.id]} isWanted={!!wantMap[show.id]}
              isDimmed={
                (actorFocusedShowIds!==null&&!actorFocusedShowIds.has(show.id)) ||
                (actorFocusedShowIds===null&&relatedFocusedShowIds!==null&&!relatedFocusedShowIds.has(show.id))
              }
              isFocused={
                (actorFocusedShowIds!==null&&actorFocusedShowIds.has(show.id)) ||
                (actorFocusedShowIds===null&&relatedFocusedShowIds!==null&&relatedFocusedShowIds.has(show.id))
              }
              watchedColor={highlightColor}
              isHovered={hoveredId===show.id||previewId===show.id}
              isSelected={selectedId===show.id}
              focusPlanetMult={focusPlanetMult}
              focusZIndex={orbitZIndex}
              depthMode={connectionMode==='director'||connectionMode==='writer'}
              onHover={setHoveredId} onClick={handleStarClick} onLongPress={handleLongPress}
              isMobile={isMobile}/>
          );
        })}
      </div>

      {/* 6b. orbit 제거됨 — 별 배치 구조만으로 항성계 표현 */}

      {/* 6c. 항성계 중심 구형 천체 (SystemCenterNode) */}
      {/* hasAnyFocus: 어떤 system이든 선택된 상태 → 비포커스 노드 잠금 */}
      {(()=>{
      const hasAnyFocus = !!relatedFocus || actorFocusedShowIds!==null;
      return (
      <div className="absolute inset-0" style={{zIndex:14,pointerEvents:'none'}}>
        {/* 장르 모드 — 각 장르 중심 galaxy haze */}
        {connectionMode==='genre'&&genreGroupsAll.map(group=>{
          const gId=Number(group.key);
          const name=GENRE_NAMES[gId]||'';
          if(!name) return null;
          const isFocusedG = !!relatedFocus&&relatedFocus.type==='genre'&&String(relatedFocus.value)===String(gId);
          const panelW = (!isMobile && relatedQuery) ? Math.min(320, vpSize.w*0.88) : 0;
          const mobilePanelH = (isMobile && relatedQuery) ? vpSize.h * 0.55 : 0;
          const fcx = isFocusedG ? (vpSize.w-panelW)/2 : group.cx;
          const fcy = isFocusedG ? (vpSize.h-mobilePanelH)/2 : group.cy;
          const lockedG = hasAnyFocus && !isFocusedG;
          // 장르 포커스 상태에서 비선택 장르는 완전 숨김
          if (lockedG && relatedFocus?.type==='genre') return null;
          return (
            <GenreCenterGalaxy key={`gc-${group.key}`}
              cx={fcx} cy={fcy} gId={gId} spread={group.spread||80}
              isFocused={isFocusedG} isMobile={isMobile}
              zIndex={isFocusedG?9500: lockedG?1 :12}
              onClick={lockedG?undefined:()=>{setSelectedId(null);openRelated({type:'genre',value:gId});}}/>
          );
        })}

        {/* 감독 모드 — 배경 그룹 sphere */}
        {connectionMode==='director'&&directorGroupsAll.map(group=>{
          const isFocused=focusedDirector===group.key;
          const {stops,brightnessFactor,dominantColor,dominantGlow}=derivePersonColorStops(group.members);
          const panelW2=(!isMobile&&relatedQuery)?Math.min(320,vpSize.w*0.88):0;
          const mPanelH2=(isMobile&&relatedQuery)?vpSize.h*0.55:0;
          const ncx=isFocused?(vpSize.w-panelW2)/2:group.cx;
          const ncy=isFocused?(vpSize.h-mPanelH2)/2:group.cy;
          return (
            <div key={`dc-${group.key}`}
              style={{opacity:(hasAnyFocus&&!isFocused)?0.07:1, transition:'opacity 0.4s', position:'absolute', left:0, top:0, width:'100%', height:'100%', pointerEvents:'none'}}>
              <SystemCenterNode
                label={group.key} cx={ncx} cy={ncy}
                color={dominantColor} glow={dominantGlow} colorStops={stops}
                brightnessFactor={brightnessFactor}
                size={isFocused?Math.round(Math.min(Math.max(vpSize.w/7,52),165)):26}
                isFocused={isFocused} isMobile={isMobile}
                zIndex={isFocused?9500:(hasAnyFocus&&!isFocused)?1:12}
                onClick={(hasAnyFocus&&!isFocused)?undefined:()=>{setSelectedId(null);setFocusedDirector(group.key);}}/>
            </div>
          );
        })}

        {/* 작가 모드 — 배경 그룹 sphere */}
        {connectionMode==='writer'&&writerGroupsAll.map(group=>{
          const isFocused=focusedWriter===group.key;
          const {stops,brightnessFactor,dominantColor,dominantGlow}=derivePersonColorStops(group.members);
          const panelW2=(!isMobile&&relatedQuery)?Math.min(320,vpSize.w*0.88):0;
          const mPanelH2=(isMobile&&relatedQuery)?vpSize.h*0.55:0;
          const ncx=isFocused?(vpSize.w-panelW2)/2:group.cx;
          const ncy=isFocused?(vpSize.h-mPanelH2)/2:group.cy;
          return (
            <div key={`wc-${group.key}`}
              style={{opacity:(hasAnyFocus&&!isFocused)?0.07:1, transition:'opacity 0.4s', position:'absolute', left:0, top:0, width:'100%', height:'100%', pointerEvents:'none'}}>
              <SystemCenterNode
                label={group.key} cx={ncx} cy={ncy}
                color={dominantColor} glow={dominantGlow} colorStops={stops}
                brightnessFactor={brightnessFactor}
                size={isFocused?Math.round(Math.min(Math.max(vpSize.w/7,52),165)):26}
                isFocused={isFocused} isMobile={isMobile}
                zIndex={isFocused?9500:(hasAnyFocus&&!isFocused)?1:12}
                onClick={(hasAnyFocus&&!isFocused)?undefined:()=>{setSelectedId(null);setFocusedWriter(group.key);}}/>
            </div>
          );
        })}

        {/* 배우 모드 — 포커스된 배우 중심 sphere */}
        {connectionMode==='actor'&&focusedActor&&(()=>{
          const members=projectedShows.filter(s=>(s.cast||[]).includes(focusedActor));
          if(!members.length) return null;
          // actor mode에서는 focusOrbits의 cx/cy가 없으므로 centroid 사용
          const firstFp = focusOrbits[members[0]?.id];
          const cx = firstFp?.cx ?? members.reduce((s,m)=>s+m.screenX,0)/members.length;
          const cy = firstFp?.cy ?? members.reduce((s,m)=>s+m.screenY,0)/members.length;
          const colorStops=deriveColorStops(members);
          return (
            <SystemCenterNode key="actor-center"
              label={focusedActor} cx={cx} cy={cy}
              color="#fbbf24" glow="#92400e" colorStops={colorStops}
              size={Math.round(Math.min(Math.max(vpSize.w/7,52),165))} isFocused={true} isMobile={isMobile} zIndex={9500}
              onClick={()=>{}}/>
          );
        })()}
      </div>
      );})()}

      {/* 7a. 인물 포커스 패널 — actor/director/writer 모드 */}
      <AnimatePresence>
        {connectionMode==='actor'&&(
          <ActorFocusPanel
            allActors={allActors}
            favoriteActors={favoriteActors}
            focusedActor={focusedActor}
            setFocusedActor={setFocusedActor}
            actorQuery={actorQuery}
            setActorQuery={setActorQuery}
            onToggleFavoriteActor={toggleFavoriteActor}/>
        )}
        {connectionMode==='director'&&(
          <PersonFocusPanel mode="director"
            allPersons={allDirectors}
            focusedPerson={focusedDirector}
            setFocusedPerson={setFocusedDirector}
            personQuery={directorQuery}
            setPersonQuery={setDirectorQuery}
            favoritePersons={favoriteDirectors}
            onToggleFavoritePerson={toggleFavoriteDirector}/>
        )}
        {connectionMode==='writer'&&(
          <PersonFocusPanel mode="writer"
            allPersons={allWriters}
            focusedPerson={focusedWriter}
            setFocusedPerson={setFocusedWriter}
            personQuery={writerQuery}
            setPersonQuery={setWriterQuery}
            favoritePersons={favoriteWriters}
            onToggleFavoritePerson={toggleFavoriteWriter}/>
        )}
      </AnimatePresence>

      {/* 7b. ModeBar */}
      <ModeBar connectionMode={connectionMode} setConnectionMode={setConnectionMode}
        showWatchedRoute={showWatchedRoute} setShowWatchedRoute={setShowWatchedRoute}
        showExpeditionRoute={showExpeditionRoute} setShowExpeditionRoute={setShowExpeditionRoute}/>

      {/* 8. 전체 코멘트 피드 토글 버튼 — 헤더 바로 아래 우측 */}
      <motion.button
        className="fixed flex items-center gap-1"
        style={{top:'3.6rem',right:'1rem',zIndex:53,
          background: showFeed ? 'rgba(139,92,246,0.28)' : 'rgba(4,1,14,0.82)',
          backdropFilter:'blur(10px)',
          border:`1px solid ${showFeed ? 'rgba(139,92,246,0.5)' : 'rgba(255,255,255,0.09)'}`,
          color: showFeed ? 'rgba(196,181,253,1)' : 'rgba(156,163,175,0.65)',
          borderRadius:'10px',padding:'0.32rem 0.72rem',fontSize:'11px',fontWeight:600,cursor:'pointer'}}
        onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()}
        onClick={()=>setShowFeed(v=>!v)}
        whileTap={{scale:0.95}}>
        💬 {showFeed ? '닫기' : '피드'}
      </motion.button>

      {/* 9. 전체 코멘트 피드 패널 */}
      <AnimatePresence>
        {showFeed&&(
          <GlobalCommentFeed key="feed-panel"
            shows={shows}
            onUserClick={u=>{setProfileUser(u); setShowFeed(false);}}
            onClose={()=>setShowFeed(false)}/>
        )}
      </AnimatePresence>

      {/* 10. 유저 프로필 패널 */}
      <AnimatePresence>
        {profileUser&&!userGalaxyView&&(
          <UserProfilePanel key="profile-panel"
            profileUser={profileUser}
            shows={shows}
            watchedMap={watchedMap}
            wantMap={wantMap}
            onClose={()=>setProfileUser(null)}
            onViewGalaxy={()=>setUserGalaxyView(profileUser)}/>
        )}
      </AnimatePresence>

      {/* 10b. 유저 은하 뷰 */}
      <AnimatePresence>
        {userGalaxyView&&(
          <UserGalaxyView key="user-galaxy"
            profileUser={userGalaxyView}
            shows={shows}
            watchedMap={watchedMap}
            wantMap={wantMap}
            onClose={()=>setUserGalaxyView(null)}/>
        )}
      </AnimatePresence>

      {/* 11. 새 작품 알림 카드 */}
      <AnimatePresence>
        {newShowQueue.length>0&&(
          <NewStarCard key={newShowQueue[0].key}
            show={newShowQueue[0].show}
            vpSize={vpSize}
            onDone={()=>setNewShowQueue(q=>q.slice(1))}/>
        )}
      </AnimatePresence>

      {/* 탐색 힌트 */}
      {!loading&&shows.length>0&&(
        <motion.div className="absolute pointer-events-none"
          style={{bottom:'3.5rem',left:'50%',transform:'translateX(-50%)',zIndex:20,
            color:'rgba(139,92,246,0.32)',fontSize:'11px',letterSpacing:'0.05em',whiteSpace:'nowrap'}}
          initial={{opacity:0}} animate={{opacity:1}} transition={{delay:3}}>
          {isMobile?'드래그로 이동 · 두 손가락으로 접근/후퇴':'드래그로 이동 · 마우스 휠로 접근/후퇴'}
        </motion.div>
      )}

      {/* Hover card — PC only */}
      <AnimatePresence>
        {!isMobile&&hoveredShow&&<HoverCard key={hoveredShow.id} show={hoveredShow} vpWidth={vpSize.w} vpHeight={vpSize.h}/>}
      </AnimatePresence>

      {/* Preview card — 모바일 롱프레스 */}
      <AnimatePresence>
        {isMobile&&previewShow&&!selectedShow&&(
          <motion.div className="fixed left-4 right-4" style={{bottom:'5rem',zIndex:45}}
            initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:16}}>
            <div className="rounded-2xl overflow-hidden shadow-2xl"
              style={{background:'rgba(6,3,18,0.96)',backdropFilter:'blur(20px)',border:'1px solid rgba(255,255,255,0.1)'}}>
              <div className="flex gap-3 p-3">
                {buildPosterUrl(previewShow.posterPath,'w92')&&
                  <img src={buildPosterUrl(previewShow.posterPath,'w92')} alt=""
                    className="w-12 object-cover rounded-lg flex-shrink-0" style={{height:'4.5rem'}}/>}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm">{previewShow.title}</p>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {previewShow.genres.slice(0,2).map(g=>(
                      <span key={g} className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{background:`${getNPal(g).p}50`,color:getNPal(g).c}}>{GENRE_NAMES[g]||g}</span>
                    ))}
                  </div>
                  <p className="text-xs mt-1 line-clamp-2" style={{color:'rgba(156,163,175,0.8)'}}>{previewShow.overview}</p>
                </div>
              </div>
              <div className="px-3 pb-3 flex gap-2">
                <button className="flex-1 py-2 rounded-xl text-xs font-medium"
                  style={{background:'rgba(109,40,217,0.25)',border:'1px solid rgba(109,40,217,0.4)',color:'rgba(196,181,253,0.9)'}}
                  onClick={()=>{handleStarClick(previewShow.id);setPreviewId(null);}}>자세히 보기</button>
                <button className="px-4 py-2 rounded-xl text-xs"
                  style={{background:'rgba(255,255,255,0.06)',color:'rgba(255,255,255,0.5)'}}
                  onClick={()=>setPreviewId(null)}>닫기</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedShow&&<DetailModal show={selectedShow}
          isWatched={!!watchedMap[selectedShow.id]}
          isWanted={!!wantMap[selectedShow.id]}
          watchedColor={highlightColor}
          favoriteActors={favoriteActors}
          onToggleWatched={toggleWatched}
          onToggleWant={toggleWant}
          onToggleFavoriteActor={toggleFavoriteActor}
          onFocusActor={name=>{setConnectionMode('actor');setFocusedActor(name);setSelectedId(null);animTarget.current.zoom=1;}}
          onOpenRelated={q=>{setSelectedId(null);openRelated(q);}}
          onClose={()=>{setSelectedId(null);animTarget.current.zoom=1;}}
          onShare={handleShare} isMobile={isMobile} currentUser={currentUser}/>}
      </AnimatePresence>

      {/* Search sheet */}
      <AnimatePresence>
        {showSearch&&<SearchSheet query={query} setQuery={setQuery}
          filteredShows={filteredShows}
          onSelectShow={id=>{handleStarClick(id);}}
          onClose={()=>setShowSearch(false)}/>}
      </AnimatePresence>

      {/* Related works panel (right side) */}
      <AnimatePresence>
        {relatedQuery&&<RelatedWorksPanel
          query={relatedQuery}
          shows={shows}
          isMobile={isMobile}
          page={relatedWorksPage}
          setPage={setRelatedWorksPage}
          currentUser={currentUser}
          onSelectShow={id=>{
            isFlyingRef.current=true; setTimeout(()=>{isFlyingRef.current=false;},900);
            setSelectedId(id);setRelatedQuery(null);setRelatedFocus(null);
            animTarget.current.zoom=Math.max(0.8,zoomRef.current-2.2);
          }}
          onClose={()=>{
            isFlyingRef.current=true; setTimeout(()=>{isFlyingRef.current=false;},900);
            setRelatedQuery(null);setRelatedFocus(null);
            animTarget.current.zoom=Math.max(0.8,zoomRef.current-2.2);
          }}/>}
      </AnimatePresence>

      {/* Login */}
      <AnimatePresence>
        {showLogin&&<LoginModal loginNick={loginNick} setLoginNick={setLoginNick}
          onLogin={handleLogin} onClose={()=>setShowLogin(false)}/>}
      </AnimatePresence>

      {/* Loading */}
      {loading&&(
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={{zIndex:50}}>
          <motion.div style={{color:'rgba(196,181,253,0.7)',fontSize:'20px'}}
            animate={{rotate:360}} transition={{duration:3,repeat:Infinity,ease:'linear'}}>✦</motion.div>
          <p className="text-sm" style={{color:'rgba(196,181,253,0.55)'}}>별을 불러오는 중...</p>
        </div>
      )}

      {/* Error */}
      {error&&!loading&&(
        <motion.div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs pointer-events-none"
          style={{zIndex:50,background:'rgba(55,14,130,0.45)',backdropFilter:'blur(10px)',
            border:'1px solid rgba(109,40,217,0.25)',color:'rgba(196,181,253,0.8)',whiteSpace:'nowrap'}}
          initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}>
          {error}
        </motion.div>
      )}
    </div>
  );
}
