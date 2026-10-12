import { useRef, type ReactElement } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';

export function HelpTooltip({ label, children, side = 'top' }: { label: string; children: ReactElement; side?: 'top' | 'bottom' }) {
  const container = useRef<HTMLElement | null>(null);
  return <Tooltip.Root>
    <Tooltip.Trigger render={children} delay={350} ref={(node: HTMLElement | null) => { container.current = node?.closest<HTMLElement>('dialog, .app-shell') ?? null; }} />
    <Tooltip.Portal container={container}><Tooltip.Positioner positionMethod="fixed" side={side} sideOffset={8} collisionPadding={12} className="tooltip-positioner">
      <Tooltip.Popup className="help-tooltip">{label}</Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
