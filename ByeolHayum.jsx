import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// CONFIG  (운영 시 env / 백엔드 프록시로 교체)
// ============================================================
const TMDB_API_KEY =
  process.env.REACT_APP_TMDB_API_KEY || 'a75fe4999b5b6edaa91591a6a7e95659';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

const EXCLUDED_GENRE_IDS = new Set([10764, 10767, 10763, 99, 10766, 10768]);
const DRAMA_GENRE_ID = 18;
const EXCLUDED_KEYWORDS = [
  '예능', '리얼리티', '토크쇼', '뉴스', '다큐',
  'reality', 'talk show', 'game show', 'variety',
];

// ============================================================
// GENRE DISPLAY MAP
// ============================================================
const GENRE_NAMES = {
  18: '드라마', 80: '범죄', 9648: '미스터리', 10765: 'SF·판타지',
  35: '코미디', 10749: '로맨스', 28: '액션', 53: '스릴러',
  27: '호러', 14: '판타지', 878: 'SF', 10751: '가족', 16: '애니메이션',
};

// ============================================================
// HELPERS
// ============================================================
const buildPosterUrl = (path, size = 'w342') =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;

const buildBackdropUrl = (path, size = 'w780') =>
  path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;

const isDramaLikeShow = (show) => {
  const genres = show.genre_ids || show.genres?.map((g) => g.id) || [];
  if (!genres.includes(DRAMA_GENRE_ID)) return false;
  if (genres.some((id) => EXCLUDED_GENRE_IDS.has(id))) return false;
  const text = `${show.name || ''} ${show.overview || ''}`.toLowerCase();
  if (EXCLUDED_KEYWORDS.some((kw) => text.includes(kw))) return false;
  return true;
};

const pseudoMoodFromGenres = (genreIds) => {
  const genreMap = {
    18: { x: 0, y: 0, z: 0 },
    80: { x: -0.7, y: -0.5, z: -0.3 },
    9648: { x: -0.8, y: -0.4, z: -0.2 },
    10765: { x: 0.2, y: 0.3, z: 0.8 },
    35: { x: 0.3, y: 0.8, z: 0 },
    10749: { x: 0.9, y: 0.6, z: 0.1 },
    28: { x: -0.3, y: -0.2, z: 0 },
    53: { x: -0.5, y: -0.6, z: 0.1 },
    27: { x: -0.1, y: -0.8, z: 0.3 },
    14: { x: 0.4, y: 0.5, z: 0.9 },
    878: { x: -0.4, y: 0, z: 0.9 },
    10751: { x: 0.7, y: 0.8, z: -0.1 },
    16: { x: 0.5, y: 0.7, z: 0.2 },
  };

  if (!genreIds || genreIds.length === 0) {
    return {
      x: (Math.random() - 0.5) * 1.5,
      y: (Math.random() - 0.5) * 1.5,
      z: (Math.random() - 0.5) * 1.5,
    };
  }

  let x = 0, y = 0, z = 0, count = 0;
  genreIds.forEach((id) => {
    if (genreMap[id]) { x += genreMap[id].x; y += genreMap[id].y; z += genreMap[id].z; count++; }
  });
  if (count > 0) { x /= count; y /= count; z /= count; }

  const seed = (genreIds[0] || 0) * 0.001;
  x += Math.sin(seed * 137.5) * 0.3;
  y += Math.cos(seed * 137.5) * 0.3;
  z += Math.sin(seed * 97.3) * 0.3;

  const clamp = (v) => Math.max(-1, Math.min(1, v));
  return { x: clamp(x), y: clamp(y), z: clamp(z) };
};

const normalizeTmdbShow = (show) => {
  const genres = show.genre_ids || show.genres?.map((g) => g.id) || [];
  const mood = pseudoMoodFromGenres(genres);
  const crew = show.credits?.crew || [];
  const cast = show.credits?.cast || [];
  return {
    id: show.id,
    mediaType: 'drama',
    title: show.name || show.original_name || '',
    originalTitle: show.original_name || '',
    overview: show.overview || '',
    posterPath: show.poster_path || null,
    backdropPath: show.backdrop_path || null,
    genres,
    rating: show.vote_average || 0,
    voteCount: show.vote_count || 0,
    firstAirDate: show.first_air_date || '',
    popularity: show.popularity || 0,
    originCountry: show.origin_country || [],
    sceneX: mood.x,
    sceneY: mood.y,
    sceneZ: mood.z,
    directors: crew.filter((p) => p.job === 'Director').map((p) => p.name),
    writers: crew
      .filter((p) => ['Writer', 'Screenplay', 'Story'].includes(p.job))
      .map((p) => p.name),
    cast: cast.slice(0, 5).map((p) => p.name),
    comments: [],
  };
};

const mapToScenePoint = (item) => ({
  x: item.sceneX * 420,
  y: item.sceneY * 310,
  z: item.sceneZ * 360,
});

const rotatePoint = (pt, yaw, pitch) => {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const x1 = pt.x * cy + pt.z * sy;
  const z1 = -pt.x * sy + pt.z * cy;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const y2 = pt.y * cp - z1 * sp;
  const z2 = pt.y * sp + z1 * cp;
  return { x: x1, y: y2, z: z2 };
};

const projectPoint = (pt, fov = 850) => {
  const z = pt.z + fov;
  const scale = fov / Math.max(z, 1);
  return { screenX: pt.x * scale, screenY: pt.y * scale, scale, z: pt.z };
};

const getHoverCardPosition = (sx, sy, vpW, vpH, cW = 220, cH = 290) => {
  let left = sx + 22;
  let top = sy - 90;
  if (left + cW > vpW - 10) left = sx - cW - 22;
  if (top + cH > vpH - 10) top = vpH - cH - 10;
  if (top < 10) top = 10;
  if (left < 10) left = 10;
  return { left, top };
};

const shareText = (nickname) =>
  `${nickname || '별헤윰 유저'} 은하로 놀러와 ✨`;

// ============================================================
// FALLBACK DATA
// ============================================================
const FALLBACK_SHOWS = [
  {
    id: 1001, mediaType: 'drama', title: '나의 아저씨', originalTitle: 'My Mister',
    overview: '세상의 무게를 묵묵히 견뎌온 중년 남자와 가혹한 삶을 꿋꿋이 살아온 청년 여자가 서로를 바라보며 위로받는 이야기.',
    posterPath: null, backdropPath: null, genres: [18], rating: 9.2, voteCount: 8400,
    firstAirDate: '2018-03-21', popularity: 95, originCountry: ['KR'],
    sceneX: 0.1, sceneY: -0.7, sceneZ: -0.5,
    directors: ['김원석'], writers: ['박해영'], cast: ['이선균', '아이유', '박호산', '오나라', '송새벽'],
    comments: [
      { id: 1, user: 'starlight_j', text: '인생작입니다. 위로 그 자체였어요.', createdAt: '2024-12-01' },
      { id: 2, user: 'moonwatcher', text: '아이유의 연기에 완전히 빠져들었어요.', createdAt: '2024-11-20' },
    ],
  },
  {
    id: 1002, mediaType: 'drama', title: '무빙', originalTitle: 'Moving',
    overview: '남다른 능력을 숨기며 살아가던 아이들이 자신들의 부모가 숨겨온 과거와 마주하게 되는 이야기.',
    posterPath: null, backdropPath: null, genres: [18, 28, 878], rating: 8.8, voteCount: 5200,
    firstAirDate: '2023-08-09', popularity: 88, originCountry: ['KR'],
    sceneX: -0.3, sceneY: 0.2, sceneZ: 0.8,
    directors: ['박인제'], writers: ['강풀'], cast: ['류승룡', '한효주', '조인성', '고윤정', '이정하'],
    comments: [
      { id: 1, user: 'cosmic_k', text: '국내 슈퍼히어로물의 새 역사를 썼다.', createdAt: '2024-10-05' },
      { id: 2, user: 'nebula_v', text: '부모 세대 이야기에 눈물 펑펑.', createdAt: '2024-09-12' },
    ],
  },
  {
    id: 1003, mediaType: 'drama', title: '선재 업고 튀어', originalTitle: 'Lovely Runner',
    overview: '죽음을 앞둔 팬이 타임슬립으로 과거로 돌아가 아이돌 스타의 운명을 바꾸려는 이야기.',
    posterPath: null, backdropPath: null, genres: [18, 10749, 10765], rating: 8.9, voteCount: 4800,
    firstAirDate: '2024-04-08', popularity: 92, originCountry: ['KR'],
    sceneX: 0.8, sceneY: 0.6, sceneZ: 0.7,
    directors: ['윤종호'], writers: ['이시은'], cast: ['변우석', '김혜윤', '송건희', '전효성'],
    comments: [
      { id: 1, user: 'aurora_b', text: '설레임 폭발. 엔딩 때 소리질렀어요.', createdAt: '2024-08-01' },
      { id: 2, user: 'starlight_j', text: '변우석 이름 세 글자가 마법이네요.', createdAt: '2024-07-22' },
    ],
  },
  {
    id: 1004, mediaType: 'drama', title: '시그널', originalTitle: 'Signal',
    overview: '과거와 현재를 연결하는 무전기를 통해 미제 사건을 해결하는 형사들의 이야기.',
    posterPath: null, backdropPath: null, genres: [18, 9648, 80], rating: 9.0, voteCount: 7100,
    firstAirDate: '2016-01-22', popularity: 86, originCountry: ['KR'],
    sceneX: -0.7, sceneY: -0.4, sceneZ: 0.3,
    directors: ['김원석'], writers: ['김은희'], cast: ['이제훈', '김혜수', '조진웅'],
    comments: [
      { id: 1, user: 'detective_m', text: '매회 소름돋는 반전. 역대급 미스터리.', createdAt: '2024-06-15' },
      { id: 2, user: 'timewave_p', text: '결말은 아직도 인정못해... 시즌2 주세요.', createdAt: '2024-05-30' },
    ],
  },
  {
    id: 1005, mediaType: 'drama', title: '비밀의 숲', originalTitle: 'Stranger',
    overview: '감정이 없는 검사와 따뜻한 형사가 함께 검찰 내부의 비리를 파헤치는 이야기.',
    posterPath: null, backdropPath: null, genres: [18, 9648, 80, 53], rating: 9.1, voteCount: 6800,
    firstAirDate: '2017-06-10', popularity: 89, originCountry: ['KR'],
    sceneX: -0.8, sceneY: -0.3, sceneZ: -0.6,
    directors: ['조현탁'], writers: ['이수연'], cast: ['조승우', '배두나', '유재명', '이준혁'],
    comments: [
      { id: 1, user: 'forest_w', text: '배두나와 조승우의 케미가 환상적.', createdAt: '2024-04-10' },
      { id: 2, user: 'logic_r', text: '이렇게 완성도 높은 한국 드라마가 또 있을까.', createdAt: '2024-03-22' },
    ],
  },
  {
    id: 1006, mediaType: 'drama', title: '도깨비', originalTitle: 'Goblin',
    overview: '939년간 불멸의 삶을 살아온 도깨비와 신부를 자처하는 소녀 사이의 신비로운 사랑 이야기.',
    posterPath: null, backdropPath: null, genres: [18, 10749, 14], rating: 8.7, voteCount: 9200,
    firstAirDate: '2016-12-02', popularity: 94, originCountry: ['KR'],
    sceneX: 0.5, sceneY: 0.1, sceneZ: 0.9,
    directors: ['이응복'], writers: ['김은숙'], cast: ['공유', '김고은', '이동욱', '유인나', '육성재'],
    comments: [
      { id: 1, user: 'goblin_fan', text: '지금도 OST 들으면 눈물나는 명작.', createdAt: '2024-02-14' },
      { id: 2, user: 'eternal_s', text: '이동욱 저승사자 코스튬이 아직도 눈에 선해요.', createdAt: '2024-01-05' },
    ],
  },
];

// ============================================================
// STAR COLOR HELPERS
// ============================================================
function getStarColor(genres) {
  if (!genres || genres.length === 0) return '#c4b5fd';
  const map = {
    18: '#c4b5fd', 80: '#fb923c', 9648: '#60a5fa',
    10765: '#34d399', 35: '#fbbf24', 10749: '#f472b6',
    28: '#ef4444', 53: '#94a3b8', 27: '#a855f7', 14: '#a78bfa',
    878: '#6ee7b7', 10751: '#fde68a', 16: '#67e8f9',
  };
  return map[genres[0]] || '#c4b5fd';
}

function getStarGlowColor(genres) {
  if (!genres || genres.length === 0) return '#a78bfa';
  const map = {
    18: '#a78bfa', 80: '#f97316', 9648: '#3b82f6',
    10765: '#10b981', 35: '#f59e0b', 10749: '#ec4899',
    28: '#dc2626', 53: '#64748b', 27: '#9333ea', 14: '#8b5cf6',
    878: '#059669', 10751: '#d97706', 16: '#0891b2',
  };
  return map[genres[0]] || '#a78bfa';
}

// ============================================================
// STARFIELD BACKGROUND
// ============================================================
function StarfieldBackground({ darkMode }) {
  const stars = useMemo(
    () =>
      Array.from({ length: 220 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 1.4 + 0.3,
        opacity: Math.random() * 0.55 + 0.08,
        delay: Math.random() * 6,
      })),
    []
  );

  return (
    <div className="absolute inset-0" style={{ zIndex: 1 }}>
      <div className="absolute top-1/4 left-1/3 w-96 h-96 rounded-full blur-3xl"
        style={{ background: darkMode ? 'radial-gradient(circle, rgba(109,40,217,0.18) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)' }} />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full blur-3xl"
        style={{ background: darkMode ? 'radial-gradient(circle, rgba(30,64,175,0.18) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(96,165,250,0.1) 0%, transparent 70%)' }} />
      <div className="absolute top-2/3 left-1/5 w-64 h-64 rounded-full blur-3xl"
        style={{ background: darkMode ? 'radial-gradient(circle, rgba(67,56,202,0.12) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(109,40,217,0.08) 0%, transparent 70%)' }} />
      <div className="absolute top-1/2 right-1/3 w-72 h-72 rounded-full blur-3xl"
        style={{ background: darkMode ? 'radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(167,139,250,0.09) 0%, transparent 70%)' }} />

      {darkMode && stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
          }}
          animate={{ opacity: [star.opacity, star.opacity * 0.25, star.opacity] }}
          transition={{ duration: 3 + star.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ============================================================
// TOP BAR
// ============================================================
function TopBar({
  query, setQuery, connectionMode, setConnectionMode,
  connectionSubtitle, currentUser, highlightColor, setHighlightColor,
  onLogin, onShare, shareMsg, darkMode, setDarkMode,
}) {
  return (
    <div
      className="absolute top-0 left-0 right-0 px-4 pt-3 pb-2 flex flex-col gap-2"
      style={{ zIndex: 30 }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        {/* Logo */}
        <div className="flex-shrink-0 mr-1">
          <h1 className="text-base font-bold tracking-widest"
            style={{ background: 'linear-gradient(90deg,#d8b4fe,#f9a8d4,#93c5fd)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            별헤윰
          </h1>
          <p className="text-xs leading-none" style={{ color: 'rgba(167,139,250,0.6)', marginTop: '-1px' }}>드라마 유니버스</p>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-0 max-w-xs">
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="작품 검색..."
              className="w-full rounded-full px-4 py-1.5 text-sm outline-none"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                color: darkMode ? '#fff' : '#1e1b4b',
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                style={{ color: darkMode ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)' }}
                onClick={() => setQuery('')}
                onMouseDown={(e) => e.stopPropagation()}
              >✕</button>
            )}
          </div>
        </div>

        {/* Connection mode */}
        <div onMouseDown={(e) => e.stopPropagation()}>
          <select
            value={connectionMode}
            onChange={(e) => setConnectionMode(e.target.value)}
            className="rounded-full px-3 py-1.5 text-xs outline-none cursor-pointer"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              color: darkMode ? '#c4b5fd' : '#7c3aed',
              appearance: 'none',
            }}
          >
            <option value="none">성운 연결 없음</option>
            <option value="director">감독 성운</option>
            <option value="writer">작가 성운</option>
            <option value="actor">배우 성운</option>
            <option value="watched">내가 본 작품</option>
          </select>
        </div>

        {/* Color picker */}
        {currentUser && (
          <div className="flex-shrink-0" onMouseDown={(e) => e.stopPropagation()}>
            <label className="relative cursor-pointer block">
              <input
                type="color"
                value={highlightColor}
                onChange={(e) => setHighlightColor(e.target.value)}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
              <div
                className="w-5 h-5 rounded-full"
                style={{
                  background: highlightColor,
                  border: '2px solid rgba(255,255,255,0.25)',
                  boxShadow: `0 0 8px ${highlightColor}80`,
                }}
                title="나의 별 색상"
              />
            </label>
          </div>
        )}

        {/* Dark/Light mode toggle */}
        <button
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors"
          style={{
            background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.12)',
            color: darkMode ? '#c4b5fd' : '#7c3aed',
          }}
          onClick={() => setDarkMode((v) => !v)}
          onMouseDown={(e) => e.stopPropagation()}
          title={darkMode ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {darkMode ? '☀️ 라이트' : '🌙 다크'}
        </button>

        {/* Share */}
        <button
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors"
          style={{
            background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)',
            border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.12)',
            color: darkMode ? '#c4b5fd' : '#7c3aed',
          }}
          onClick={onShare}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {shareMsg || '✨ 공유'}
        </button>

        {/* User */}
        <div onMouseDown={(e) => e.stopPropagation()}>
          {currentUser ? (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: darkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                border: darkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: highlightColor, boxShadow: `0 0 4px ${highlightColor}` }}
              />
              <span className="text-xs" style={{ color: darkMode ? '#c4b5fd' : '#7c3aed' }}>{currentUser.nickname}</span>
            </div>
          ) : (
            <button
              className="px-3 py-1.5 rounded-full text-xs transition-colors"
              style={{
                background: 'rgba(139,92,246,0.2)',
                border: '1px solid rgba(139,92,246,0.35)',
                color: '#c4b5fd',
              }}
              onClick={onLogin}
            >
              로그인
            </button>
          )}
        </div>
      </div>

      {/* Constellation subtitle */}
      {connectionSubtitle && (
        <div className="text-center">
          <span
            className="text-xs px-3 py-1 rounded-full backdrop-blur-sm"
            style={{
              color: 'rgba(196,181,253,0.8)',
              background: 'rgba(109,40,217,0.2)',
              border: '1px solid rgba(139,92,246,0.2)',
            }}
          >
            ✦ {connectionSubtitle}
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// POSTER FALLBACK
// ============================================================
function PosterFallback({ title }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.4), rgba(30,64,175,0.4))' }}
    >
      <div className="text-2xl mb-1" style={{ color: 'rgba(196,181,253,0.6)' }}>✦</div>
      <div className="text-xs text-center px-2 line-clamp-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
        {title}
      </div>
    </div>
  );
}

// ============================================================
// STAR
// ============================================================
function Star({ show, isWatched, watchedColor, isHovered, isSelected, onHover, onClick }) {
  const clampedSize = useMemo(() => {
    const base = 4;
    const scale = Math.max(0.5, Math.min(2.5, show.proj.scale));
    const s = base * scale * (1 + show.popularity * 0.0015);
    return Math.max(3, Math.min(13, s));
  }, [show.proj.scale, show.popularity]);

  const color = isWatched ? watchedColor : getStarColor(show.genres);
  const glow = isWatched ? watchedColor : getStarGlowColor(show.genres);
  const highlighted = isHovered || isSelected || isWatched;

  return (
    <motion.div
      className="absolute cursor-pointer"
      style={{
        left: show.screenX,
        top: show.screenY,
        transform: 'translate(-50%, -50%)',
        zIndex: Math.round(show.proj.z + 1000),
      }}
      whileHover={{ scale: 1.7 }}
      onMouseEnter={() => onHover(show.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); onClick(show.id); }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Outer glow */}
      {highlighted && (
        <motion.div
          className="absolute rounded-full pointer-events-none"
          style={{
            width: clampedSize * 5,
            height: clampedSize * 5,
            left: -clampedSize * 2,
            top: -clampedSize * 2,
            background: `radial-gradient(circle, ${glow}55 0%, transparent 65%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />
      )}

      {/* Star dot */}
      <motion.div
        className="rounded-full pointer-events-none"
        style={{
          width: clampedSize,
          height: clampedSize,
          background: `radial-gradient(circle at 35% 30%, #fff, ${color})`,
        }}
        animate={
          isWatched
            ? {
                boxShadow: [
                  `0 0 ${clampedSize * 2}px ${glow}50`,
                  `0 0 ${clampedSize * 4}px ${glow}80`,
                  `0 0 ${clampedSize * 2}px ${glow}50`,
                ],
              }
            : {
                boxShadow: [`0 0 ${clampedSize * 1.5}px ${glow}50`],
              }
        }
        transition={{ duration: 2, repeat: Infinity }}
      />

      {/* Label */}
      {(isHovered || isSelected) && (
        <motion.div
          className="absolute whitespace-nowrap text-xs pointer-events-none"
          style={{
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginTop: 4,
            color: 'rgba(255,255,255,0.85)',
            textShadow: '0 0 10px rgba(0,0,0,0.9)',
          }}
          initial={{ opacity: 0, y: -3 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {show.title}
        </motion.div>
      )}
    </motion.div>
  );
}

// ============================================================
// HOVER CARD
// ============================================================
function HoverCard({ show, vpWidth, vpHeight }) {
  const pos = getHoverCardPosition(show.screenX, show.screenY, vpWidth, vpHeight);
  const posterUrl = buildPosterUrl(show.posterPath, 'w185');

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: pos.left, top: pos.top, zIndex: 45 }}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.16 }}
    >
      <div
        className="w-52 rounded-xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(15,10,30,0.92)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <div className="h-28 bg-gray-800 relative overflow-hidden">
          {posterUrl ? (
            <img src={posterUrl} alt={show.title} className="w-full h-full object-cover" />
          ) : (
            <PosterFallback title={show.title} />
          )}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(15,10,30,0.85) 0%, transparent 55%)' }} />
          <div className="absolute bottom-2 left-2 right-2">
            <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2">{show.title}</h3>
          </div>
        </div>

        <div className="p-2.5">
          <div className="flex gap-1 flex-wrap mb-1.5">
            {show.genres.slice(0, 2).map((g) => (
              <span
                key={g}
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(109,40,217,0.4)', color: '#c4b5fd' }}
              >
                {GENRE_NAMES[g] || g}
              </span>
            ))}
            {show.rating > 0 && (
              <span
                className="text-xs px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(161,110,14,0.3)', color: '#fde68a' }}
              >
                ★ {show.rating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-xs line-clamp-2" style={{ color: 'rgba(156,163,175,0.9)' }}>
            {show.overview || '설명 없음'}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================================
// DETAIL MODAL
// ============================================================
function DetailModal({ show, isWatched, watchedColor, onToggleWatched, onClose, onShare }) {
  const posterUrl = buildPosterUrl(show.posterPath, 'w342');
  const backdropUrl = buildBackdropUrl(show.backdropPath);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 60 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      <motion.div
        className="relative w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{
          background: 'rgba(10,8,25,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
          maxHeight: '88vh',
          overflowY: 'auto',
        }}
        initial={{ scale: 0.88, y: 24 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.88, y: 24 }}
      >
        {/* Backdrop */}
        <div className="relative h-40 bg-gray-900 overflow-hidden">
          {backdropUrl ? (
            <img src={backdropUrl} alt="" className="w-full h-full object-cover opacity-50" />
          ) : (
            <div style={{ background: 'linear-gradient(135deg, rgba(109,40,217,0.3), rgba(30,64,175,0.3))' }}
              className="w-full h-full" />
          )}
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to bottom, transparent 20%, rgba(10,8,25,0.97) 100%)' }} />
          <button
            className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors"
            style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.6)' }}
            onClick={onClose}
          >✕</button>
        </div>

        <div className="p-4 -mt-16 relative">
          <div className="flex gap-4">
            {/* Poster */}
            <div
              className="flex-shrink-0 w-24 h-36 rounded-xl overflow-hidden shadow-xl"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              {posterUrl ? (
                <img src={posterUrl} alt={show.title} className="w-full h-full object-cover" />
              ) : (
                <PosterFallback title={show.title} />
              )}
            </div>

            {/* Title meta */}
            <div className="flex-1 pt-16">
              <h2 className="text-xl font-bold text-white mb-0.5">{show.title}</h2>
              {show.originalTitle && show.originalTitle !== show.title && (
                <p className="text-sm mb-1.5" style={{ color: 'rgba(156,163,175,0.7)' }}>
                  {show.originalTitle}
                </p>
              )}
              <div className="flex gap-1.5 flex-wrap">
                {show.genres.slice(0, 3).map((g) => (
                  <span key={g} className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(109,40,217,0.35)', color: '#c4b5fd' }}>
                    {GENRE_NAMES[g] || g}
                  </span>
                ))}
                {show.rating > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(161,110,14,0.25)', color: '#fde68a' }}>
                    ★ {show.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Overview */}
          <p className="mt-4 text-sm leading-relaxed" style={{ color: 'rgba(209,213,219,0.85)' }}>
            {show.overview || '설명 없음'}
          </p>

          {/* Credits */}
          <div className="mt-4 space-y-1.5">
            {show.directors?.length > 0 && (
              <div className="text-sm">
                <span style={{ color: 'rgba(107,114,128,0.9)' }}>감독  </span>
                <span style={{ color: 'rgba(229,231,235,0.9)' }}>{show.directors.join(', ')}</span>
              </div>
            )}
            {show.writers?.length > 0 && (
              <div className="text-sm">
                <span style={{ color: 'rgba(107,114,128,0.9)' }}>작가  </span>
                <span style={{ color: 'rgba(229,231,235,0.9)' }}>{show.writers.join(', ')}</span>
              </div>
            )}
            {show.cast?.length > 0 && (
              <div className="text-sm">
                <span style={{ color: 'rgba(107,114,128,0.9)' }}>출연  </span>
                <span style={{ color: 'rgba(229,231,235,0.9)' }}>{show.cast.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button
              className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
              style={
                isWatched
                  ? { background: `${watchedColor}28`, border: `1px solid ${watchedColor}55`, color: watchedColor }
                  : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.55)' }
              }
              onClick={() => onToggleWatched(show.id)}
            >
              {isWatched ? '✦ 봤어요' : '○ 봤어요'}
            </button>

            <button
              className="px-4 py-2 rounded-xl text-sm transition-colors"
              style={{
                background: 'rgba(109,40,217,0.25)',
                border: '1px solid rgba(139,92,246,0.3)',
                color: '#c4b5fd',
              }}
              onClick={onShare}
            >
              공유
            </button>

            <button
              className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
              style={{
                background: 'linear-gradient(135deg, rgba(109,40,217,0.5), rgba(37,99,235,0.5))',
                border: '1px solid rgba(139,92,246,0.35)',
              }}
              onClick={() => alert('커뮤니티 기능은 준비 중입니다 :)')}
            >
              입장
            </button>
          </div>

          {/* Comments */}
          <div className="mt-5">
            <h3 className="text-sm font-semibold mb-2.5" style={{ color: 'rgba(196,181,253,0.7)' }}>
              별헤윰 코멘트
            </h3>
            {show.comments && show.comments.length > 0 ? (
              <div className="space-y-2">
                {show.comments.map((c) => (
                  <div key={c.id} className="rounded-xl p-3"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                      <span className="text-xs font-medium" style={{ color: '#c4b5fd' }}>{c.user}</span>
                      <span className="text-xs ml-auto" style={{ color: 'rgba(107,114,128,0.7)' }}>{c.createdAt}</span>
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(209,213,219,0.8)' }}>{c.text}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center py-4" style={{ color: 'rgba(107,114,128,0.7)' }}>
                아직 코멘트가 없어요. 첫 번째 코멘트를 남겨보세요!
              </p>
            )}
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
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 70 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      <motion.div
        className="relative w-80 rounded-2xl p-6 shadow-2xl"
        style={{
          background: 'rgba(10,8,25,0.97)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
        initial={{ scale: 0.88 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.88 }}
      >
        <button
          className="absolute top-4 right-4 text-sm transition-colors"
          style={{ color: 'rgba(255,255,255,0.35)' }}
          onClick={onClose}
        >✕</button>

        <div className="text-center mb-6">
          <div className="text-2xl mb-2">✦</div>
          <h2 className="text-lg font-bold text-white">별헤윰에 오신 걸 환영해요</h2>
          <p className="text-xs mt-1" style={{ color: 'rgba(156,163,175,0.7)' }}>
            나만의 드라마 우주를 만들어보세요
          </p>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            placeholder="닉네임 (선택)"
            value={loginNick}
            onChange={(e) => setLoginNick(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm text-white outline-none"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />

          <button
            className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: '#FEE500', color: '#1a1a1a' }}
            onClick={() => onLogin('kakao')}
          >
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-black"
              style={{ background: '#3A1D1D', color: '#FEE500' }}
            >K</span>
            카카오로 시작하기
          </button>

          <button
            className="w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
            style={{ background: '#03C75A', color: '#fff' }}
            onClick={() => onLogin('naver')}
          >
            <span
              className="w-5 h-5 rounded flex items-center justify-center text-xs font-black"
              style={{ background: '#fff', color: '#03C75A' }}
            >N</span>
            네이버로 시작하기
          </button>

          <button
            className="w-full py-2.5 rounded-xl text-sm transition-colors"
            style={{ color: 'rgba(156,163,175,0.7)' }}
            onClick={() => onLogin('guest')}
          >
            게스트로 계속하기
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function ByeolHayum() {
  // ---- State ----
  const [shows, setShows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [hoveredId, setHoveredId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');

  const [connectionMode, setConnectionMode] = useState('none');

  const [currentUser, setCurrentUser] = useState(null);
  const [watchedMap, setWatchedMap] = useState({});
  const [highlightColor, setHighlightColor] = useState('#a78bfa');

  const [yaw, setYaw] = useState(0.3);
  const [pitch, setPitch] = useState(-0.15);

  const [vpSize, setVpSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 1280,
    h: typeof window !== 'undefined' ? window.innerHeight : 800,
  });

  const [showLogin, setShowLogin] = useState(false);
  const [loginNick, setLoginNick] = useState('');
  const [shareMsg, setShareMsg] = useState('');
  const [darkMode, setDarkMode] = useState(true);

  const svgRef = useRef(null);
  const dragRef = useRef({ dragging: false, lastX: 0, lastY: 0 });

  // ---- Viewport ----
  useEffect(() => {
    const onResize = () => setVpSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ---- TMDB fetch ----
  useEffect(() => {
    const fetchShows = async () => {
      try {
        setLoading(true);
        const pages = [1, 2, 3];
        const results = await Promise.all(
          pages.map((page) =>
            fetch(
              `${TMDB_BASE}/discover/tv?api_key=${TMDB_API_KEY}&with_genres=${DRAMA_GENRE_ID}&language=ko-KR&page=${page}&sort_by=popularity.desc&with_origin_country=KR`
            ).then((r) => r.json())
          )
        );
        const all = results.flatMap((r) => r.results || []);
        const filtered = all.filter(isDramaLikeShow);

        if (filtered.length < 5) {
          setShows(FALLBACK_SHOWS);
          setError('API 결과가 부족하여 샘플 데이터를 사용합니다.');
        } else {
          setShows(filtered.map(normalizeTmdbShow));
        }
      } catch (e) {
        console.error(e);
        setShows(FALLBACK_SHOWS);
        setError('API 연결 실패. 샘플 데이터를 표시합니다.');
      } finally {
        setLoading(false);
      }
    };
    fetchShows();
  }, []);

  // ---- Projected shows ----
  const projectedShows = useMemo(() => {
    return shows
      .map((show) => {
        const raw = mapToScenePoint(show);
        const rotated = rotatePoint(raw, yaw, pitch);
        const proj = projectPoint(rotated);
        return {
          ...show,
          proj,
          screenX: proj.screenX + vpSize.w / 2,
          screenY: proj.screenY + vpSize.h / 2,
        };
      })
      .sort((a, b) => a.proj.z - b.proj.z);
  }, [shows, yaw, pitch, vpSize]);

  // ---- Filtered shows ----
  const filteredShows = useMemo(() => {
    if (!query) return projectedShows;
    const q = query.toLowerCase();
    return projectedShows.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.overview.toLowerCase().includes(q)
    );
  }, [projectedShows, query]);

  // ---- Constellation lines ----
  const constellationLines = useMemo(() => {
    if (connectionMode === 'none') return [];
    const groups = {};

    filteredShows.forEach((show) => {
      let keys = [];
      if (connectionMode === 'director') keys = show.directors || [];
      else if (connectionMode === 'writer') keys = show.writers || [];
      else if (connectionMode === 'actor') keys = show.cast || [];
      else if (connectionMode === 'watched' && watchedMap[show.id]) keys = ['watched'];

      keys.forEach((k) => {
        if (!groups[k]) groups[k] = [];
        groups[k].push(show);
      });
    });

    const lines = [];
    Object.entries(groups).forEach(([key, members]) => {
      if (members.length < 2) return;
      for (let i = 0; i < members.length - 1; i++) {
        lines.push({ key: `${key}-${i}`, from: members[i], to: members[i + 1], label: key });
      }
    });
    return lines;
  }, [filteredShows, connectionMode, watchedMap]);

  // ---- Connection subtitle ----
  const connectionSubtitle = useMemo(() => {
    if (connectionMode === 'none') return '';
    if (connectionMode === 'watched') return currentUser ? `${currentUser.nickname} 성운` : '내가 본 작품 성운';
    if (connectionMode === 'director') return '감독 성운';
    if (connectionMode === 'writer') return '작가 성운';
    if (connectionMode === 'actor') return '배우 성운';
    return '';
  }, [connectionMode, currentUser]);

  // ---- Drag ----
  const handleMouseDown = useCallback((e) => {
    dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    setYaw((y) => y + dx * 0.005);
    setPitch((p) => Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, p + dy * 0.005)));
  }, []);

  const handleMouseUp = useCallback(() => { dragRef.current.dragging = false; }, []);

  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    dragRef.current = { dragging: true, lastX: t.clientX, lastY: t.clientY };
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.lastX;
    const dy = t.clientY - dragRef.current.lastY;
    dragRef.current.lastX = t.clientX;
    dragRef.current.lastY = t.clientY;
    setYaw((y) => y + dx * 0.005);
    setPitch((p) => Math.max(-Math.PI / 2.4, Math.min(Math.PI / 2.4, p + dy * 0.005)));
  }, []);

  // ---- Watched ----
  const toggleWatched = useCallback((id) => {
    setWatchedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // ---- Share ----
  const handleShare = useCallback(async () => {
    const text = shareText(currentUser?.nickname);
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: '별헤윰', text, url });
      } else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareMsg('복사됨!');
        setTimeout(() => setShareMsg(''), 2000);
      }
    } catch {
      setShareMsg('공유 실패');
      setTimeout(() => setShareMsg(''), 2000);
    }
  }, [currentUser]);

  // ---- Login ----
  const handleLogin = useCallback(
    (provider) => {
      const nick = loginNick || `star_${Math.floor(Math.random() * 9999)}`;
      setCurrentUser({ nickname: nick, provider });
      setShowLogin(false);
      setLoginNick('');
    },
    [loginNick]
  );

  const hoveredShow = hoveredId ? filteredShows.find((s) => s.id === hoveredId) : null;
  const selectedShow = selectedId ? shows.find((s) => s.id === selectedId) : null;

  // ---- Render ----
  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ background: darkMode ? '#050310' : '#f5f3ff', fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif", cursor: 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => { dragRef.current.dragging = false; }}
    >
      <StarfieldBackground darkMode={darkMode} />

      <TopBar
        query={query}
        setQuery={setQuery}
        connectionMode={connectionMode}
        setConnectionMode={setConnectionMode}
        connectionSubtitle={connectionSubtitle}
        currentUser={currentUser}
        highlightColor={highlightColor}
        setHighlightColor={setHighlightColor}
        onLogin={() => setShowLogin(true)}
        onShare={handleShare}
        shareMsg={shareMsg}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />

      {/* Constellation SVG */}
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 8 }}
      >
        {constellationLines.map((line) => {
          const avgScale = (line.from.proj.scale + line.to.proj.scale) * 0.5;
          return (
            <line
              key={line.key}
              x1={line.from.screenX}
              y1={line.from.screenY}
              x2={line.to.screenX}
              y2={line.to.screenY}
              stroke={connectionMode === 'watched' ? `${highlightColor}50` : 'rgba(167,139,250,0.28)'}
              strokeWidth={Math.max(0.4, Math.min(1.8, avgScale * 0.4))}
              strokeDasharray="5 10"
            />
          );
        })}
      </svg>

      {/* Stars layer */}
      <div className="absolute inset-0" style={{ zIndex: 10 }}>
        {filteredShows.map((show) => (
          <Star
            key={show.id}
            show={show}
            isWatched={!!watchedMap[show.id]}
            watchedColor={highlightColor}
            isHovered={hoveredId === show.id}
            isSelected={selectedId === show.id}
            onHover={setHoveredId}
            onClick={(id) => { setSelectedId(id); setHoveredId(null); }}
          />
        ))}
      </div>

      {/* Drag hint */}
      {!loading && shows.length > 0 && (
        <motion.div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs pointer-events-none"
          style={{ color: 'rgba(167,139,250,0.4)', zIndex: 20 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          드래그로 우주를 회전하세요 ✦
        </motion.div>
      )}

      {/* Hover card */}
      <AnimatePresence>
        {hoveredShow && (
          <HoverCard
            key={hoveredShow.id}
            show={hoveredShow}
            vpWidth={vpSize.w}
            vpHeight={vpSize.h}
          />
        )}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedShow && (
          <DetailModal
            show={selectedShow}
            isWatched={!!watchedMap[selectedShow.id]}
            watchedColor={highlightColor}
            onToggleWatched={toggleWatched}
            onClose={() => setSelectedId(null)}
            onShare={handleShare}
          />
        )}
      </AnimatePresence>

      {/* Login modal */}
      <AnimatePresence>
        {showLogin && (
          <LoginModal
            loginNick={loginNick}
            setLoginNick={setLoginNick}
            onLogin={handleLogin}
            onClose={() => setShowLogin(false)}
          />
        )}
      </AnimatePresence>

      {/* Loading overlay */}
      {loading && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3"
          style={{ zIndex: 50 }}
        >
          <motion.div
            className="text-2xl"
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          >
            ✦
          </motion.div>
          <p className="text-sm" style={{ color: 'rgba(196,181,253,0.7)' }}>별을 불러오는 중...</p>
        </div>
      )}

      {/* Error toast */}
      {error && !loading && (
        <motion.div
          className="absolute bottom-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-xs pointer-events-none"
          style={{
            zIndex: 50,
            background: 'rgba(109,40,217,0.5)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(139,92,246,0.3)',
            color: '#c4b5fd',
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}
    </div>
  );
}
