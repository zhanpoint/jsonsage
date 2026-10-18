import { useRef } from 'react';
import { Menu } from '@base-ui/react/menu';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export type MenuAction = { label: string; icon: LucideIcon; run: () => void; danger?: boolean };
export function ActionMenu({ label, actions, disabled }: { label: string; actions: MenuAction[]; disabled?: boolean }) {
  const container = useRef<HTMLElement | null>(null);
  return <Menu.Root>
    <Menu.Trigger ref={(node: HTMLElement | null) => { container.current = node?.closest<HTMLElement>('.app-shell') ?? null; }} className="record-icon record-more" aria-label={label} disabled={disabled}><MoreHorizontal size={15} /></Menu.Trigger>
    <Menu.Portal container={container}><Menu.Positioner className="record-menu-positioner" sideOffset={5} align="end" collisionPadding={10}><Menu.Popup className="record-menu">
      {actions.map(action => <Menu.Item key={action.label} className="record-menu-item" data-danger={action.danger || undefined} onClick={action.run}><action.icon size={14} /><span>{action.label}</span></Menu.Item>)}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
