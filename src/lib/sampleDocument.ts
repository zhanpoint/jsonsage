import { newHistoryDraft } from './historySession';

/** The initial document for a workspace with no saved tabs. */
export const sampleDocument = () => newHistoryDraft({
  fileName: 'sample.json',
  jsonc: false,
  source: `{
  "name": "JsonSage",
  "version": "1.0.0",
  "description": "A calmer way to work with JSON",
  "features": ["validate", "format", "inspect"],
  "active": true
}`,
});
