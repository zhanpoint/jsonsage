// These exported package subpaths omit NodeIO and remote schema fetching entirely.
import { quicktype } from 'quicktype-core/dist/esm/Run.js';
import { InputData, jsonInputForTargetLanguage } from 'quicktype-core/dist/esm/input/Inputs.js';
export async function generateTypes(source: string, target: 'typescript' | 'python' | 'go' | 'rust', indentation: string) {
  const input = jsonInputForTargetLanguage(target);
  await input.addSource({ name: 'Root', samples: [source] });
  const inputData = new InputData(); inputData.addInput(input);
  const result = await quicktype({ inputData, lang: target, indentation, rendererOptions: target === 'typescript' ? { 'just-types': 'true' } : {} });
  return result.lines;
}
