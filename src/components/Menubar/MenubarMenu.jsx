import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import MenubarItem from './MenubarItem';
import MenubarSeparator from './MenubarSeparator';

export default function MenubarMenu({ menu, onAction, checkedItems = {}, dynamicData = {} }) {
  const resolveItems = (items) =>
    items.map(item => {
      if (item === 'separator') return item;
      if (item.dynamic && dynamicData[item.dynamic]) {
        const dynItems = dynamicData[item.dynamic];
        return {
          ...item,
          submenu: dynItems.length > 0
            ? dynItems.map(p => ({ id: `recent-${p.id}`, label: p.title || '(제목 없음)', action: `file:openRecent:${p.id}` }))
            : [{ id: 'no-recent', label: '없음', disabled: true, action: '' }],
        };
      }
      return item;
    });

  const resolved = resolveItems(menu.items);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="menubar-trigger"
          onKeyDown={e => {
            if (e.altKey && e.key.toLowerCase() === menu.altKey) e.preventDefault();
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
