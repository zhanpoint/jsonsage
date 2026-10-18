import { foldIndex } from './largeJsonLanguage';
import { EditorState } from '@codemirror/state';
import { Decoration, ViewPlugin, WidgetType, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { codeFolding, foldable, foldEffect, foldedRanges, foldState, syntaxTree, unfoldEffect } from '@codemirror/language';

class FoldToggle extends WidgetType {
  constructor(readonly from: number, readonly to: number, readonly folded: boolean, readonly label: string) { super(); }
  eq(other: FoldToggle) { return this.from === other.from && this.to === other.to && this.folded === other.folded && this.label === other.label; }
  toDOM(view: EditorView) {
    const holder = document.createElement('span');
    holder.className = 'cm-inlineFold';
    const button = holder.appendChild(document.createElement('button'));
    button.type = 'button';
    button.className = 'cm-foldToggle';
    button.title = this.label;
    button.setAttribute('aria-label', button.title);
    button.setAttribute('aria-expanded', String(!this.folded));
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => view.dispatch({
      effects: (this.folded ? unfoldEffect : foldEffect).of({ from: this.from, to: this.to }),
    }));
    return holder;
  }
}

function toggles(view: EditorView): DecorationSet {
  const decorations = [];
  const folded = foldedRanges(view.state);
  for (const block of view.viewportLineBlocks) {
    let range: { from: number; to: number } | null = null;
    folded.between(block.from, block.to, (from, to) => { range ??= { from, to }; });
    const isFolded = range !== null;
    range ??= foldable(view.state, block.from, block.to);
    if (range) {
      let position = block.from;
      for (const chunk of view.state.doc.iterRange(block.from, block.to)) {
        const offset = chunk.search(/\S/);
        if (offset >= 0) { position += offset; break; }
        position += chunk.length;
      }
      const label = view.state.phrase(isFolded ? 'Unfold line' : 'Fold line');
      decorations.push(Decoration.widget({ widget: new FoldToggle(range.from, range.to, isFolded, label), side: -1 }).range(position));
    }
  }
  return Decoration.set(decorations, true);
}

/** Keep fold controls in the virtualized text flow; folding itself stays native to CM6. */
export const inlineFolding = [codeFolding(), ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = toggles(view); }
  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged ||
      update.startState.field(foldIndex, false) !== update.state.field(foldIndex, false) ||
      update.startState.field(foldState) !== update.state.field(foldState) ||
      syntaxTree(update.startState) !== syntaxTree(update.state) ||
      update.startState.facet(EditorState.phrases) !== update.state.facet(EditorState.phrases)) {
      this.decorations = toggles(update.view);
    }
  }
}, { decorations: plugin => plugin.decorations })];
