// Local comparison only. Prevent every trial from uploading ranking/telemetry.
if (new URLSearchParams(location.search).has('cameraTrial')) {
  const ordinaryFetch = window.fetch.bind(window);
  window.fetch = (input, options) => {
    if (String(input?.url || input).includes('gunrun-runs.jirisuke0121.workers.dev')) {
      return Promise.resolve(new Response('{"top":[],"total":0,"recordProtocol":2}',
        { headers: { 'content-type': 'application/json' } }));
    }
    return ordinaryFetch(input, options);
  };
}
