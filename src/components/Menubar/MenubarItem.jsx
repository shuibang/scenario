import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import MenubarSeparator from './MenubarSeparator';

function MenubarSubMenu({ item, onAction, checkedItems = {} }) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="menubar-item menubar-subtrigger" disabled={item.disabled}>
        <span>{item.label}</span>
        <span className="menubar-item-right">▶</span>
      </DropdownMenu.SubTrigger>
      <DropdownMenu.Portal>
        <DropdownMenu.SubContent className="menubar-content" sideOffset={4} alignOffset={-4}>
          {item.submenu.length === 0 ? (
            <DropdownMenu.Item className="menubar-item" disabled>
              <span style={{ color: 'var(--c-text5)' }}>없음</span>
            </DropdownMenu.Item>
          ) : (
            item.submenu.map((sub, i) =>
              sub === 'separator' ? (
                <MenubarSeparator key={i} />
              ) : sub.hasSubmenu ? (
                <MenubarSubMenu key={sub.id} item={sub} onAction={onAction} checkedItems={checkedItems} />
              ) : (
                <MenubarItem
                  key={sub.id}
                  item={sub}
                  onAction={onAction}
                  checked={checkedItems[sub.id]}
                  checkedItems={checkedItems}
                />
              )
            )
          )}
        </DropdownMenu.SubContent>
      </DropdownMenu.Portal>
    </DropdownMenu.Sub>
  );
}

export default function MenubarItem({ item, onAction, checked, checkedItems = {} }) {
  if (item.hasSubmenu) return <MenubarSubMenu item={item} onAction={onAction} checkedItems={checkedItems} />;

  // 섹션 헤더 — 클릭 불가, 굵은 라벨
  if (item.type === 'header') {
    return (
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--c-text5)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 12px 2px', userSelect: 'none' }}>
        {item.label}
      </div>
    );
  }

  // 단축키 참고 항목 — 클릭 불가, label + shortcut 표시
  if (item.type === 'shortcutInfo') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '3px 12px', userSelect: 'none', cursor: 'default' }}>
        <span style={{ flex: 1, fontSize: 12, color: 'var(--c-text3)' }}>{item.label}</span>
        {item.shortcut && (
          <span style={{ fontSize: 10, color: 'var(--c-text5)', fontFamily: 'monospace', marginLeft: 16 }}>{item.shortcut}</span>
        )}
      </div>
    );
  }

  const isDisabled = item.disabled === true;

  return (
    <DropdownMenu.Item
      className={`menubar-item${isDisabled ? ' menubar-item-disabled' : ''}`}
      disabled={isDisabled}
      onSelect={isDisabled ? undefined : () => onAction?.(item.action, item)}
    >
      {item.checkable && (
        <span className="menubar-item-check">{checked ? '✓' : ''}</span>
      )}
      <span className="menubar-item-label">{item.label}</span>
      {isDisabled && item.disabledLabel ? (
        <span className="menubar-item-disabled-label">{item.disabledLabel}</span>
      ) : item.shortcut ? (
        <span className="menubar-item-shortcut">{item.shortcut}</span>
      ) : null}
    </DropdownMenu.Item>
  );
}
