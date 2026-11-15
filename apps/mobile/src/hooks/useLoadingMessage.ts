import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { messages } from '../i18n';

/** Honi's chatter while data is on its way (`loading.lines`); each line is shown for a few seconds, then the next. */

const ROTATE_MS = 2600;

/** The line Honi says now. Rotates only while `active` and the screen is in view, and starts from the top each time. */
export function useLoadingMessage(active: boolean): string {
  const focused = useIsFocused();
  const [index, setIndex] = useState(0);
  const running = active && focused;

  useEffect(() => {
    if (!running) {
      setIndex(0);
      return;
    }
    const id = setInterval(() => setIndex((i) => (i + 1) % messages().loading.lines.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [running]);

  return messages().loading.lines[index];
}
