import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DiffHighlight } from './json/analysis';

export const setDiffHighlights = StateEffect.define<DiffHighlight[]>();
export const diffHighlights = StateField.define({
  create: () => Decoration.none,
  update(value, transaction) {
    if (transaction.docChanged) value = Decoration.none;
    for (const effect of transaction.effects) if (effect.is(setDiffHighlights)) {
      value = Decoration.set(effect.value.map(mark => Decoration.mark({ class: `diff-${mark.kind.toLowerCase()}` }).range(mark.from, mark.to)), true);
    }
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
