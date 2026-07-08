import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import MenubarItem from './MenubarItem';
import MenubarSeparator from './MenubarSeparator';

export default function MenubarMenu({ menu, onAction, checkedItems = {}, dynamicData = {}, isMobile = false }) {
  const resolveItems = (items) =>
    items
      .filter(item => !(isMobile && item !== 'separator' && item.mobileHide))
      .map(item => {
      if (item === 'separator') return item;
      const mobilized = (isMobile && item.mobileLabel) ? { ...item, label: item.mobileLabel } : item;
      if (mobilized.dynamic && dynamicData[mobilized.dynamic]) {
        const dynItems = dynamicData[item.dynamic];
        // action 필드가 있는 pre-formed 아이템은 그대로 사용 (cloudSave 등).
        // 배열 내 separator(string)가 섞일 수 있으므로 객체 타입 체크 후 'action' 확인.
        const hasPreformed = dynItems.some(d => d !== null && typeof d === 'object' && 'action' in d);
        if (hasPreformed) {
          return { ...mobilized, submenu: dynItems };
        }
        // recentProjects: { id, title } 형태에서 변환
        return {
          ...mobilized,
          submenu: dynItems.length > 0
            ? dynItems.map(p => ({ id: `recent-${p.id}`, label: p.title || '(제목 없음)', action: `file:openRecent:${p.id}` }))
            : [{ id: 'no-recent', label: '없음', disabled: true, action: '' }],
        };
      }
      return mobilized;
    });

  const resolved = resolveItems(menu.items);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="menubar-trigger"
          onKeyDown={e => {
            if (e.altKey && e.key?.toLowerCase() === menu.altKey) e.preventDefault();
          }}
        >
          {menu.label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menubar-content" sideOffset={2} align="start">
          {resolved.map((item, i) =>
            item === 'separator' ? (
              <MenubarSeparator key={i} />
            ) : (
              <MenubarItem
                key={item.id}
                item={item}
                onAction={onAction}
                checked={checkedItems[item.id]}
                checkedItems={checkedItems}
              />
            )
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
