/**
 * 인물 이름 변경에 필요한 검색/치환 쌍 생성
 *
 * block.charName에는 항상 givenName만 저장 (성 제외).
 * 풀네임(surname+givenName)은 지문/대사 content 안에서만 나타남.
 *
 * @param {{ surname: string, givenName: string }} oldChar
 * @param {{ surname: string, givenName: string }} newChar
 * @returns {Array<{ oldText, newText, label, searchScope }>}
 *   searchScope: 'content_only' | 'content_and_charname'
 */
export function generateRenamePairs(oldChar, newChar) {
  const oldSurname = oldChar.surname || '';
  const oldGiven   = oldChar.givenName || '';
  const newSurname = newChar.surname || '';
  const newGiven   = newChar.givenName || '';

  const oldFull = (oldSurname + oldGiven).trim();
  const newFull = (newSurname + newGiven).trim();

  const pairs = [];

  // 1. 풀네임이 바뀐 경우 (성이 있을 때만 의미 있음)
  //    charName은 givenName만 저장하므로 content_only
  if (oldSurname && oldFull !== newFull) {
    pairs.push({
      oldText:     oldFull,
      newText:     newFull,
      label:       `풀네임 "${oldFull}" → "${newFull}"`,
      searchScope: 'content_only',
    });
  }

  // 2. givenName이 바뀐 경우
  //    charName(=givenName) + content 둘 다 검색
  if (oldGiven && oldGiven !== newGiven) {
    pairs.push({
      oldText:     oldGiven,
      newText:     newGiven,
      label:       `이름 "${oldGiven}" → "${newGiven}"`,
      searchScope: 'content_and_charname',
    });
  }

  return pairs;
}
