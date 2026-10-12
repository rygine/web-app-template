import { useDebouncedCallback } from "@mantine/hooks";
import { useRef, useState } from "react";

import { reportFailure } from "@/app/client/utils/toast";

export const AUTOSAVE_DELAY = 400;

// There is no Save button: a change is queued, coalesced with anything else
// queued behind it, and written after a pause.
//
// A failed write puts its patch back on the queue, so the edit is never lost
// and the next flush retries it. `dirty` stays true until a write succeeds,
// which is what navigation blocking keys off.
export const useAutosave = <T extends object>(
  save: (patch: Partial<T>) => Promise<unknown>,
  message: string,
) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const queued = useRef<Partial<T>>({});
  const writing = useRef(Promise.resolve(true));

  const write = async (): Promise<boolean> => {
    const patch = queued.current;
    if (Object.keys(patch).length === 0) {
      return true;
    }
    queued.current = {};

    setPending(true);
    setError(null);
    try {
      await save(patch);
      setDirty(Object.keys(queued.current).length > 0);
      return true;
    } catch (caught) {
      // Newer edits win over the ones being retried.
      queued.current = { ...patch, ...queued.current };
      setError(reportFailure(message, caught));
      return false;
    } finally {
      setPending(false);
    }
  };

  // Resolves after every earlier write lands; false only when a write failed.
  const flush = () => {
    writing.current = writing.current.then(write, write);
    return writing.current;
  };

  const schedule = useDebouncedCallback(() => void flush(), AUTOSAVE_DELAY);

  const queue = (patch: Partial<T>) => {
    queued.current = { ...queued.current, ...patch };
    setDirty(true);
    setError(null);
  };

  // Typing: coalesced and written after a pause.
  const commit = (patch: Partial<T>) => {
    queue(patch);
    schedule();
  };

  // Picking: there is no more input coming, so waiting for a pause only widens
  // the window in which a reload would lose the change.
  const commitNow = (patch: Partial<T>) => {
    queue(patch);
    void flush();
  };

  return { commit, commitNow, flush, pending, error, dirty };
};
