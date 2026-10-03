import { analyze, type AnalysisRequest } from '../lib/json/analysis';

self.onmessage = async (event: MessageEvent<AnalysisRequest>) => {
  try {
    const request = event.data;
    const result = request.kind === 'jq' || request.kind === 'types' ? await (await import('../lib/json/advanced')).advanced(request) : analyze(request);
    self.postMessage({ result });
  }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'ANALYSIS_FAILED' }); }
};
