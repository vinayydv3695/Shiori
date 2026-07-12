import { useEffect, useRef } from 'react';
import { isAndroid } from '@/lib/tauri';

/**
 * Pushes a dummy state to window.history to intercept the Android back button.
 * When the back button is pressed, popstate is fired, and we call the callback.
 * 
 * @param isOpen Whether the modal/view is currently open
 * @param onClose Callback to close the modal/view
 */
export function useBackButton(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isAndroid || !isOpen) return;

    const id = Math.random().toString(36).substring(2, 9);
    const hash = `#view-${id}`;
    
    // Push the state
    window.history.pushState(null, '', window.location.pathname + window.location.search + hash);

    const handlePopState = () => {
      // If the hash is gone or different, it means the user pressed back
      if (window.location.hash !== hash) {
        onCloseRef.current();
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // If we're cleaning up but the hash is still ours, it means the view was closed 
      // programmatically (e.g. by a close button), not by the back button.
      // We must pop it to keep history clean.
      if (window.location.hash === hash) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
