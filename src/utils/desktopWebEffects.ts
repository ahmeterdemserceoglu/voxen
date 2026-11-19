/**
 * Desktop (Electron + react-native-web) deneyimini iyileştiren global web ayarları.
 *
 * - Tıklanabilir öğelere imleç + hover parlama efekti (RN-web TouchableOpacity,
 *   div[tabindex="0"] olarak render edildiği için CSS ile yakalanır).
 * - İnce, koyu temalı kaydırma çubukları (RN-web'in `scrollbar-width: none`
 *   kuralını geçersiz kılar).
 * - Klavye odak halkaları, metin seçim rengi, uygulama dışı metin seçiminin kapatılması.
 * - Fare tekerleğiyle yatay bölümlerin kaydırılması (RN-web yatay ScrollView'lar
 *   dikey tekerlek girdisini yok sayar).
 *
 * Yalnızca masaüstü derlemede (EXPO_PUBLIC_VOXEN_DESKTOP=1) etkinleştirilir.
 */

const STYLE_ID = 'voxen-desktop-web-effects';
const WHEEL_FLAG = '__voxenWheelRedirectInstalled';

const CSS = `
  /* Tıklanabilir her şeyde el imleci + hover parlama */
  [tabindex="0"]:not([aria-disabled="true"]),
  [role="button"]:not([aria-disabled="true"]),
  [role="slider"],
  [role="adjustable"],
  [role="option"] {
    cursor: pointer;
  }
  [tabindex="0"]:not([aria-disabled="true"]):hover,
  [role="button"]:not([aria-disabled="true"]):hover {
    filter: brightness(1.14);
  }
  [tabindex="0"], [role="button"], [role="slider"], [role="adjustable"] {
    transition-property: filter, opacity !important;
    transition-duration: 130ms !important;
    transition-timing-function: ease !important;
  }

  /* İnce, şık kaydırma çubukları */
  * {
    scrollbar-width: thin !important;
    scrollbar-color: rgba(255, 255, 255, 0.18) transparent !important;
  }

  /* Klavye odak halkaları; fare tıklamasında görünmez */
  :focus { outline: none; }
  :focus-visible {
    outline: 2px solid rgba(255, 59, 48, 0.6);
    outline-offset: 2px;
  }

  /* Marka renginde metin seçimi; arayüz metni seçilemez (uygulama hissi) */
  ::selection { background: rgba(255, 59, 48, 0.45); color: #fff; }
  #root {
    -webkit-user-select: none;
    user-select: none;
  }
  input, textarea, [contenteditable="true"], [data-selectable="true"] {
    -webkit-user-select: text;
    user-select: text;
  }

  /* Daha yumuşak yazı render'ı */
  body {
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
`;

function isScrollableHorizontally(node: HTMLElement): boolean {
  const style = window.getComputedStyle(node);
  const scrollsX = (style.overflowX === 'auto' || style.overflowX === 'scroll');
  return scrollsX && node.scrollWidth > node.clientWidth + 1;
}

/** İmlecin altındaki en yakın yatay kaydırma bölgesini bulur. */
function findHorizontalScroller(start: EventTarget | null): HTMLElement | null {
  let node = start instanceof HTMLElement ? start : null;
  while (node && node !== document.body) {
    if (isScrollableHorizontally(node)) {
      const style = window.getComputedStyle(node);
      // Dikey de kayabilen kapsayıcılar normal dikey kaydırmaya kalsın.
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') return node;
      return null;
    }
    // Dikey kaydırmacıya ulaşıldıysa tekerlek normal davransın.
    const style = window.getComputedStyle(node);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return null;
    }
    node = node.parentElement;
  }
  return null;
}

function installWheelRedirect() {
  const w = window as unknown as Record<string, unknown>;
  if (w[WHEEL_FLAG]) return;
  w[WHEEL_FLAG] = true;

  window.addEventListener(
    'wheel',
    (event) => {
      if (!(event instanceof WheelEvent) || event.defaultPrevented || event.ctrlKey) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; // yatay dokunma pad'i doğal akışta
      const scroller = findHorizontalScroller(event.target);
      if (!scroller) return;
      scroller.scrollLeft += event.deltaY;
      event.preventDefault();
    },
    { passive: false, capture: true },
  );
}

/** Masaüstü web efektlerini kurar. App.tsx içinde IS_DESKTOP iken bir kez çağrılır. */
export function installDesktopWebEffects() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
    document.documentElement.style.colorScheme = 'dark';
  }
  installWheelRedirect();
}
