import { useLayoutEffect, useRef } from 'react';

/** 永遠拿到最新的值，但 ref 本身不變（讓 useEffect 不必因為 callback 改變而重跑） */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
