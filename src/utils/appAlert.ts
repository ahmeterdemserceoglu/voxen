import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

/** React Native Web leaves Alert.alert empty, so desktop actions need a dialog. */
export function appAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  const actions: AlertButton[] = buttons?.length ? buttons : [{ text: 'Tamam' }];
  const previousFocus = document.activeElement as HTMLElement | null;
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box';
  const panel = document.createElement('div');
  panel.setAttribute('role', 'alertdialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', title);
  panel.style.cssText = 'width:min(100%,440px);background:#1b1b1f;border:1px solid rgba(255,255,255,.13);border-radius:20px;padding:25px;box-shadow:0 24px 70px rgba(0,0,0,.55);color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'font-size:19px;font-weight:750;line-height:1.3';
  panel.appendChild(heading);
  if (message) {
    const description = document.createElement('div');
    description.textContent = message;
    description.style.cssText = 'font-size:14px;line-height:1.5;color:#b7b7bf;margin-top:10px;white-space:pre-wrap';
    panel.appendChild(description);
  }
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:flex-end;gap:9px;margin-top:25px';
  const close = () => {
    document.removeEventListener('keydown', onKeyDown, true);
    backdrop.remove();
    previousFocus?.focus?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && options?.cancelable !== false) {
      event.stopPropagation();
      event.preventDefault();
      close();
      options?.onDismiss?.();
    } else if (event.key === 'Tab') {
      const buttons = Array.from(buttonRow.querySelectorAll('button'));
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (!buttons.length) return;
      event.preventDefault();
      buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
    }
  };
  document.addEventListener('keydown', onKeyDown, true);
  actions.forEach((action) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.text || 'Tamam';
    const destructive = action.style === 'destructive';
    const cancel = action.style === 'cancel';
    button.style.cssText = `border:1px solid ${destructive ? 'rgba(229,9,20,.45)' : 'rgba(255,255,255,.11)'};background:${destructive ? '#b30d1c' : cancel ? 'transparent' : '#303037'};color:${cancel ? '#bbb' : '#fff'};padding:10px 15px;border-radius:10px;font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;cursor:pointer;min-height:40px`;
    button.onclick = () => { close(); action.onPress?.(); };
    buttonRow.appendChild(button);
  });
  panel.appendChild(buttonRow);
  backdrop.appendChild(panel);
  backdrop.onclick = (event) => {
    if (event.target === backdrop && options?.cancelable !== false) { close(); options?.onDismiss?.(); }
  };
  document.body.appendChild(backdrop);
  (buttonRow.querySelector('button') as HTMLButtonElement | null)?.focus();
}
