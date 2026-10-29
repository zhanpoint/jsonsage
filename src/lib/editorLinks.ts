import { Decoration, MatchDecorator, ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';

/** Validate navigation targets with the browser's URL parser. */
export function httpLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

const matcher = new MatchDecorator({
  regexp: /\bhttps?:\/\/[^\s<>"'`\\]+/gi,
  boundary: /[\s<>"'`\\]/,
  decoration(match, view) {
    const href = httpLink(match[0]);
    return href ? Decoration.mark({
      tagName: 'a', class: 'cm-httpLink',
      attributes: { href, target: '_blank', rel: 'noopener noreferrer', tabindex: '-1', title: view.state.phrase('Open link in new tab') },
    }) : null;
  },
});

// Match only drawn content and update changed ranges instead of scanning the document on each edit.
export const editorLinks = ViewPlugin.fromClass(class {
  decorations;
  constructor(view: EditorView) { this.decorations = matcher.createDeco(view); }
  update(update: ViewUpdate) { this.decorations = matcher.updateDeco(update, this.decorations); }
}, {
  decorations: plugin => plugin.decorations,
  eventHandlers: {
    click(event, view) {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a.cm-httpLink') : null;
      if (!link || event.button !== 0) return false;
      event.preventDefault();
      // Dragging or extending a selection must not navigate away from the editor.
      if (event.detail === 1 && !event.shiftKey && view.state.selection.main.empty) {
        view.dom.ownerDocument.defaultView?.open(link.href, '_blank', 'noopener,noreferrer');
      }
      return true;
    },
  },
});
