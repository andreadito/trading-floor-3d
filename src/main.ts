// Entry point: decide whether this device can run the demo before loading it.
// The 3D app (three + AG Grid + ECharts, ~2.7 MB) is the only dynamic import, so it
// is fetched only when the device can run it; everyone else gets the small
// fallback page bundled here. ?force=1 skips the check.

import { renderFallback } from './fallback';
import { unsupportedReason } from './support';

const force = new URLSearchParams(location.search).has('force');
const reason = force ? null : unsupportedReason();

if (reason) renderFallback(reason);
else import('./app');
