import { useEffect, useState } from "react";
import { api } from "./api.js";

let cache = null;
let inflight = null;

export function usePublicStats() {
  const [state, setState] = useState({ data: cache, loading: !cache });
  useEffect(() => {
    if (cache) return;
    inflight = inflight || api.stats().then((d) => (cache = d)).catch(() => (cache = { total: null, byState: {}, extraLgas: {}, site: {} }));
    inflight.then((d) => setState({ data: d, loading: false }));
  }, []);
  return state;
}
