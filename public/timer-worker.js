/* Background-safe timer worker */
let intervalId = null;
let onceTimeoutId = null;

function startTicks() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    postMessage({ type: 'tick', now: Date.now() });
  }, 1000);
}

function stopTicks() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function scheduleOnce(ts) {
  try {
    if (onceTimeoutId) clearTimeout(onceTimeoutId);
  } catch {}
  const delay = Math.max(0, ts - Date.now());
  onceTimeoutId = setTimeout(() => {
    postMessage({ type: 'boundary', at: Date.now() });
    onceTimeoutId = null;
  }, delay);
}

self.onmessage = (e) => {
  const { type, payload } = e.data || {};
  switch (type) {
    case 'start':
      startTicks();
      break;
    case 'stop':
      stopTicks();
      break;
    case 'scheduleOnce':
      scheduleOnce(payload?.timestamp);
      break;
  }
};

startTicks();
