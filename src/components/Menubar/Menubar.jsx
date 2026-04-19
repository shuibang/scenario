import React, { useEffect } from 'react';
import { menuConfig } from './menuConfig';
import MenubarMenu from './MenubarMenu';

/**
 * @param {function} onAction  - (action: string, item: object) => void
 * @param {object[]} recentProjects - 최근 프로젝트 목록 (최대 5개)
 * @param {object}   checkedItems  - { [itemId]: boolean } 토글 상태
 */
export default function Menubar({ onAction, recentProjects = [], checkedItems = {} }) {
  const dynamicData = { recentProjects: recentProjects.slice(0, 5) };

  // Alt+[key] 접근성 단축키
  useEffect(() => {
    const handler = (e) => {
      if (!e.altKey) return;
      const key = e.key.toLowerCase();
      const menu = menuConfig.find(m => m.altKey === key);
      if (menu) {
        e.preventDefault();
        // 해당 메뉴 트리거 버튼에 포커스 → 스페이스/엔터로 열기
        const trigger = document.querySelector(`[data-menubar-id="${menu.id}"]`);
        trigger?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="menubar-root" role="menubar">
      {menuConfig.map(menu => (
        <MenubarMenu
          key={menu.id}
          menu={menu}
          onAction={onAction}
          checkedItems={checkedItems}
          dynamicData={dynamicData}
        />
      ))}
    </div>
  );
}
