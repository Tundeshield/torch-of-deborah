import { useEffect, useRef, useState, useCallback } from "react";
import { onSnapshot, getDocs } from "firebase/firestore";

// Live Firestore query. Pass null to skip.
export function useLiveQuery(makeQuery, deps) {
  const [state, setState] = useState({ data: [], loading: true, error: null });
  useEffect(() => {
    const q = makeQuery();
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }),
      (error) => {
        console.error(error);
        setState({ data: [], loading: false, error });
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useLiveDoc(makeRef, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  useEffect(() => {
    const r = makeRef();
    if (!r) return setState({ data: null, loading: false, error: null });
    return onSnapshot(
      r,
      (s) => setState({ data: s.exists() ? { id: s.id, ...s.data() } : null, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export function useOnce(makeQuery, deps) {
  const [state, setState] = useState({ data: [], loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const q = makeQuery();
    if (!q) return setState({ data: [], loading: false, error: null });
    setState((s) => ({ ...s, loading: true }));
    getDocs(q)
      .then((snap) => live && setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, error: null }))
      .catch((error) => {
        console.error(error);
        live && setState({ data: [], loading: false, error });
      });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const ref = useRef(0);
  const run = useCallback(() => {
    const id = ++ref.current;
    setState((s) => ({ ...s, loading: true }));
    Promise.resolve()
      .then(fn)
      .then((data) => id === ref.current && setState({ data, loading: false, error: null }))
      .catch((error) => id === ref.current && setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    run();
  }, [run]);
  return { ...state, reload: run };
}
