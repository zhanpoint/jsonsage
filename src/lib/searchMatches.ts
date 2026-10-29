import { ChangeSet, EditorState } from '@codemirror/state';
import { SearchQuery } from '@codemirror/search';

export const MATCH_LIMIT = 10_000;
export type SearchSpec = Pick<SearchQuery, 'search' | 'caseSensitive' | 'wholeWord' | 'regexp' | 'literal'>;
export type SearchRequest = { kind: 'init'; source: string } | { kind: 'cancel' }
  | { kind: 'change'; changes: ReturnType<ChangeSet['toJSON']> }
  | { kind: 'count'; id: number; query: SearchSpec };
export type SearchResult = { id: number; count: number; truncated: boolean };

/** Mirror CM's persistent document and apply only incremental edits after initialization. */
export class SearchDocument {
  private state = EditorState.create();

  reset(source: string) { this.state = EditorState.create({ doc: source }); }
  change(changes: ReturnType<ChangeSet['toJSON']>) {
    this.state = this.state.update({ changes: ChangeSet.fromJSON(changes) }).state;
  }
  cursor(query: SearchSpec) { return new SearchQuery(query).getCursor(this.state); }
}
