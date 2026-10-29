import { EditorState } from '@codemirror/state';

export const MAX_IMPORT_BYTES = 128 * 1024 * 1024;
// CodeMirror measures text in UTF-16 code units, independently of file encoding.
export const MAX_DOCUMENT_CHARACTERS = 128 * 1024 * 1024;

export function exceedsDocumentLimit(current: number, next: number, limit = MAX_DOCUMENT_CHARACTERS) {
  return next > limit && next > current;
}

/** Reject the transaction before editor listeners, undo history or workers see it. */
export function documentSizeLimit(onLimit: () => void, limit = MAX_DOCUMENT_CHARACTERS) {
  return EditorState.transactionFilter.of(transaction => {
    if (transaction.docChanged && exceedsDocumentLimit(transaction.startState.doc.length, transaction.changes.newLength, limit)) {
      onLimit();
      return [];
    }
    return transaction;
  });
}
