import { lazy as reactLazy } from "react";

// If a page's code fails to load (usually an old tab after a new deploy), reload once to fetch fresh files.
export function lazy(load) {
  return reactLazy(() =>
    load().catch((err) => {
      const key = "tod_chunk_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
        return new Promise(() => {});
      }
      throw err;
    }).then((m) => {
      sessionStorage.removeItem("tod_chunk_reload");
      return m;
    }),
  );
}

