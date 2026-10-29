import { EditorView, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view';
import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, replaceAll, replaceNext, SearchQuery, setSearchQuery } from '@codemirror/search';
import { LARGE_DOCUMENT } from './largeJsonLanguage';
import type { SearchRequest, SearchResult } from './searchMatches';
import replaceSvg from '../assets/codicons/replace.svg?raw';
import replaceAllSvg from '../assets/codicons/replace-all.svg?raw';

const panels = new WeakMap<EditorView, FindPanel>();

/** Keep CodeMirror's query, navigation, replacements and undo history as the source of truth. */
export function createSearchPanel(view: EditorView): Panel {
  return new FindPanel(view);
}

export function openReplacePanel(view: EditorView) {
  openSearchPanel(view);
  panels.get(view)?.expand();
  return true;
}

class FindPanel implements Panel {
  readonly dom = document.createElement('div');
  readonly top = true;
  private readonly searchField = this.input('search', 'Find');
  private readonly replaceField = this.input('replace', 'Replace');
  private readonly status = document.createElement('span');
  private readonly replaceRow = document.createElement('div');
  private readonly toggle: HTMLButtonElement;
  private readonly previous: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly replace: HTMLButtonElement;
  private readonly replaceAll: HTMLButtonElement;
  private readonly options: { button: HTMLButtonElement; key: 'caseSensitive' | 'wholeWord' | 'regexp' }[] = [];
  private matchCount = 0;
  private truncated = false;
  private counting = false;
  private inputTimer: ReturnType<typeof setTimeout> | undefined;
  private worker: Worker | null = null;
  private request = 0;
  private countFailed = false;
  private expanded = false;

  constructor(private readonly view: EditorView) {
    panels.set(view, this);
    this.dom.className = 'cm-find';
    this.dom.setAttribute('role', 'search');
    this.toggle = this.button('Toggle replace', '›', () => this.expand(!this.expanded));
    this.toggle.classList.add('cm-find-toggle');
    this.searchField.setAttribute('main-field', 'true');
    const field = document.createElement('div');
    field.className = 'cm-find-field';
    field.append(this.searchField);
    for (const [key, label, text] of [
      ['caseSensitive', 'match case', 'Aa'], ['wholeWord', 'by word', 'ab'], ['regexp', 'regexp', '.*'],
    ] as const) {
      const button = this.button(label, text, () => {
        button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
        this.commit(true);
      });
      button.classList.add('cm-find-option');
      if (key === 'wholeWord') button.classList.add('cm-find-word');
      field.append(button);
      this.options.push({ button, key });
    }
    this.status.className = 'cm-find-count';
    this.status.setAttribute('role', 'status');
    this.previous = this.button('previous', '↑', () => { this.commit(); findPrevious(view); });
    this.next = this.button('next', '↓', () => { this.commit(); findNext(view); });
    const row = document.createElement('div');
    row.className = 'cm-find-row';
    row.append(field, this.status, this.previous, this.next, this.button('close', '×', () => closeSearchPanel(view)));
    this.replaceRow.className = 'cm-find-row cm-find-replace';
    this.replace = this.button('replace', icon(replaceSvg), () => { this.commit(); replaceNext(view); this.replaceField.focus(); });
    this.replaceAll = this.button('replace all', icon(replaceAllSvg), () => { this.commit(); replaceAll(view); this.replaceField.focus(); });
    this.replaceRow.append(this.replaceField, this.replace, this.replaceAll);
    this.dom.append(this.toggle, row, this.replaceRow);
    this.dom.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter' || event.key === 'F3') this.commit();
      if (runScopeHandlers(view, event, 'search-panel')) {
        event.preventDefault();
        event.stopPropagation();
      } else if (event.key === 'Enter' && (event.target === this.searchField || event.target === this.replaceField)) {
        event.preventDefault();
        if (event.target === this.searchField) (event.shiftKey ? findPrevious : findNext)(view);
        else (event.ctrlKey || event.metaKey ? replaceAll : replaceNext)(view);
      }
    });
    this.sync();
    this.count();
  }

  private input(name: string, phrase: string) {
    const input = document.createElement('input');
    input.name = name;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.dataset.phrase = phrase;
    input.addEventListener('input', event => {
      if ((event as InputEvent).isComposing) return;
      clearTimeout(this.inputTimer);
      if (name === 'search' && this.view.state.doc.length > LARGE_DOCUMENT) this.inputTimer = setTimeout(() => this.commit(true), 120);
      else this.commit(name === 'search');
    });
    input.addEventListener('compositionend', () => this.commit(name === 'search'));
    return input;
  }

  private button(phrase: string, content: string | Element, run: () => unknown) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.phrase = phrase;
    button.append(content);
    button.addEventListener('click', run);
    return button;
  }

  private commit(navigate = false) {
    clearTimeout(this.inputTimer);
    const current = getSearchQuery(this.view.state);
    const flags = Object.fromEntries(this.options.map(({ key, button }) => [key, button.getAttribute('aria-pressed') === 'true']));
    const query = new SearchQuery({ ...current, ...flags, search: this.searchField.value, replace: this.replaceField.value });
    if (!query.eq(current)) {
      this.view.dispatch({ effects: setSearchQuery.of(query) });
      if (navigate && query.valid && this.view.state.doc.length <= LARGE_DOCUMENT) {
        // CM's navigation selects the query field; live search must preserve the user's caret.
        const { selectionStart, selectionEnd, selectionDirection } = this.searchField;
        findNext(this.view);
        this.searchField.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
      }
    }
  }

  expand(expanded = true) {
    this.expanded = expanded && !this.view.state.readOnly;
    this.replaceRow.hidden = !this.expanded;
    this.toggle.setAttribute('aria-expanded', String(this.expanded));
    if (this.expanded) this.replaceField.focus();
    else if (this.replaceRow.contains(this.view.root.activeElement)) this.searchField.focus();
    this.view.requestMeasure();
  }

  private sync() {
    const query = getSearchQuery(this.view.state);
    this.searchField.value = query.search;
    this.replaceField.value = query.replace;
    for (const { key, button } of this.options) button.setAttribute('aria-pressed', String(query[key]));
    for (const element of this.dom.querySelectorAll<HTMLElement>('[data-phrase]')) {
      const label = this.view.state.phrase(element.dataset.phrase!);
      element.setAttribute('aria-label', label);
      if (element instanceof HTMLInputElement) element.placeholder = label;
      else element.title = label;
    }
    this.dom.setAttribute('aria-label', this.view.state.phrase('Find and replace'));
    this.toggle.hidden = this.view.state.readOnly;
    if (this.view.state.readOnly) this.expanded = false;
    this.replaceRow.hidden = !this.expanded;
    this.toggle.setAttribute('aria-expanded', String(this.expanded));
  }

  private post(message: SearchRequest) { this.worker!.postMessage(message); }

  /** Full-document scans stay off the UI thread. Stale query results are ignored. */
  private count() {
    const id = ++this.request;
    this.matchCount = 0;
    this.truncated = false;
    this.countFailed = false;
    const query = getSearchQuery(this.view.state);
    this.counting = query.valid;
    this.showStatus();
    if (!query.valid) { if (this.worker) this.post({ kind: 'cancel' }); return; }
    if (!this.worker) {
      this.worker = new Worker(new URL('../workers/search.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }: MessageEvent<SearchResult>) => {
        if (data.id !== this.request) return;
        this.matchCount = data.count;
        this.truncated = data.truncated;
        this.counting = false;
        this.showStatus();
      };
      this.worker.onerror = () => {
        this.worker?.terminate(); this.worker = null;
        this.counting = false; this.countFailed = true;
        this.showStatus();
      };
      this.post({ kind: 'init', source: this.view.state.doc.toString() });
    }
    this.post({ kind: 'count', id, query: { search: query.search, caseSensitive: query.caseSensitive, wholeWord: query.wholeWord, regexp: query.regexp, literal: query.literal } });
  }

  private showStatus() {
    const query = getSearchQuery(this.view.state);
    this.status.textContent = !query.search ? '' : !query.valid ? this.view.state.phrase('Invalid regular expression')
      : this.countFailed ? this.view.state.phrase('Count unavailable') : this.counting ? '…' : !this.matchCount ? this.view.state.phrase('No results')
      : `${this.matchCount.toLocaleString()}${this.truncated ? '+' : ''} ${this.view.state.phrase('matches')}`;
    const empty = !this.counting && !this.countFailed && !this.matchCount;
    this.searchField.setAttribute('aria-invalid', String(!!query.search && (!query.valid || empty)));
    for (const button of [this.previous, this.next]) button.disabled = !query.valid || empty;
    for (const button of [this.replace, this.replaceAll]) button.disabled = this.view.state.readOnly || this.previous.disabled;
  }

  mount() { this.searchField.select(); }

  update(update: ViewUpdate) {
    if (update.docChanged && this.worker) this.post({ kind: 'change', changes: update.changes.toJSON() });
    const before = getSearchQuery(update.startState), after = getSearchQuery(update.state);
    if (!before.eq(after) || update.startState.phrase('Find') !== update.state.phrase('Find') || update.startState.readOnly !== update.state.readOnly) this.sync();
    if (update.docChanged || before.search !== after.search || before.regexp !== after.regexp
      || before.caseSensitive !== after.caseSensitive || before.wholeWord !== after.wholeWord || before.literal !== after.literal) this.count();
    else this.showStatus();
  }

  destroy() {
    clearTimeout(this.inputTimer);
    this.worker?.terminate();
    panels.delete(this.view);
  }
}

/** Parse only bundled, trusted SVG assets; no icon font or runtime dependency. */
function icon(source: string) {
  const svg = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
  svg.setAttribute('aria-hidden', 'true');
  return svg;
}
