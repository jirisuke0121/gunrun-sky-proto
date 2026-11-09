// Explicit comparisons do not upload ranking/telemetry. Published fixed-camera
// URLs remain ordinary play; old saved fixed preferences migrate separately.
const trialParam = new URLSearchParams(location.search).get('cameraTrial');
const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
if (['hybrid', 'follow', 'follow-legacy', 'follow-turn'].includes(trialParam) || (trialParam !== null && localHost)) {
  const ordinaryFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    if (String(input?.url || input).includes('gunrun-runs.jirisuke0121.workers.dev')) {
      return Promise.resolve(new Response('{"top":[],"total":0,"recordProtocol":2}',
        { headers: { 'content-type': 'application/json' } }));
    }
    return ordinaryFetch(input, options);
  };
}
