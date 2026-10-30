// The private key that lets this phone reopen the hub of the woman who registered on it.
const KEY = "tod_hub_key";
export const saveHubKey = (k) => { try { localStorage.setItem(KEY, k); } catch { /* storage blocked */ } };
export const getHubKey = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const clearHubKey = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
