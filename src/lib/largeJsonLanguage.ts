import { StateEffect, StateField } from '@codemirror/state';
import { foldService, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { json } from '@codemirror/legacy-modes/mode/javascript';
import { foldOnLine } from './json/foldIndex';

export const LARGE_DOCUMENT = 2_000_000;
export const setFoldIndex = StateEffect.define<Uint32Array>();
export const foldIndex = StateField.define<Uint32Array | null>({
  create: () => null,
  update(value, transaction) {
    if (transaction.docChanged) value = null;
    for (const effect of transaction.effects) if (effect.is(setFoldIndex)) value = effect.value;
    return value;
  },
});
// CM6's stream parser skips distant offscreen ranges instead of parsing the whole prefix.
export const largeJsonLanguage = [StreamLanguage.define({ ...json, tokenTable: { property: tags.propertyName, atom: tags.bool } }), foldIndex, foldService.of((state, start, end) => {
  const ranges = state.field(foldIndex);
  return ranges ? foldOnLine(ranges, start, end) : null;
})];
