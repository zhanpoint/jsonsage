import type { PaletteCommand } from '../CommandPalette';
import { shortcutLabel } from '../../lib/shortcuts';
import { HelpTooltip } from './HelpTooltip';
export function CommandButton({ command }: { command: PaletteCommand }) {
  return <HelpTooltip label={`${command.label} · ${shortcutLabel(command.binding)}`}><button type="button" className="tool-button" data-tone={command.tone} disabled={command.disabled} onClick={command.run} aria-label={command.label}><command.icon size={17} aria-hidden="true" /></button></HelpTooltip>;
}
