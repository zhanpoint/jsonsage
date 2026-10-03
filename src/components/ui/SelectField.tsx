import { useRef } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronDown } from 'lucide-react';

/** Base UI owns focus, typeahead and keyboard selection; palette tokens style every part. */
export function SelectField<T extends string>({ label, value, items, onChange }: {
  label: string; value: T; items: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const container = useRef<HTMLElement | null>(null);
  return <div className="select-field"><span>{label}</span><Select.Root value={value} items={items} onValueChange={next => { if (next !== null) onChange(next); }}>
    <Select.Trigger ref={node => { container.current = node?.closest<HTMLElement>('.app-shell') ?? null; }} className="select-trigger" aria-label={label}><Select.Value /><Select.Icon><ChevronDown size={14} /></Select.Icon></Select.Trigger>
    <Select.Portal container={container}><Select.Positioner className="select-positioner" sideOffset={6} align="start" alignItemWithTrigger={false}>
      <Select.Popup className="select-popup"><Select.List>{items.map(item => <Select.Item className="select-option" key={item.value} value={item.value}>
        <Select.ItemText>{item.label}</Select.ItemText><Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
      </Select.Item>)}</Select.List></Select.Popup>
    </Select.Positioner></Select.Portal>
  </Select.Root></div>;
}
