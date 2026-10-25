import { createScanner } from 'jsonc-parser';
import { findPathOffset } from './json/branches';
import type { JsonPath } from './json/views';
import { isRecordStream } from './json/document';

/** Decode exactly one JSON string, without parsing an object graph or unescaping twice. */
export function readPreviewText(source: string, path: JsonPath): string | null {
  if (!path.length && isRecordStream(source)) return null;
  const scanner = createScanner(source, true);
  scanner.setPosition(findPathOffset(source, path));
  // jsonc-parser 3.x const enums cannot be imported with isolatedModules.
  if (scanner.scan() !== 10 /* StringLiteral */ || scanner.getTokenError() !== 0 /* None */) return null;
  return scanner.getTokenValue();
}
