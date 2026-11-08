// Local comparison only. Prevent review trials from uploading ranking/telemetry.
// The fixed camera is also the saved choice of players who finished the intro (cameraTrial=fixed is
// restored on every visit), so on the published site only the hybrid review trial is cut off.
const trialParam = new URLSearchParams(location.search).get('cameraTrial');
const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
if (trialParam === 'hybrid' || (trialParam !== null && localHost)) {
  const ordinaryFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    if (String(input?.url || input).includes('gunrun-runs.jirisuke0121.workers.dev')) {
      return Promise.resolve(new Response('{"top":[],"total":0,"recordProtocol":2}',
        { headers: { 'content-type': 'application/json' } }));
    }
    return ordinaryFetch(input, options);
  };
}
