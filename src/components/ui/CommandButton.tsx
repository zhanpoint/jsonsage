import type { PaletteCommand } from '../CommandPalette';
import { shortcutLabel } from '../../lib/shortcuts';
export function CommandButton({ command }: { command: PaletteCommand }) {
  return <button className="tool-button" data-tone={command.tone} disabled={command.disabled} onClick={command.run} aria-label={command.label} data-tooltip={`${command.label} · ${shortcutLabel(command.binding)}`}><command.icon size={17} aria-hidden="true" /></button>;
}
