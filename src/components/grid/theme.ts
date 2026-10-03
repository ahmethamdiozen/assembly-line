import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community'

// AG Grid modülleri burada kaydedilir; böylece grid yalnızca tablo kullanan sayfalarla yüklenir.
ModuleRegistry.registerModules([AllCommunityModule])

/** AG Grid teması: renkler CSS değişkenlerinden gelir. */
export const gridTheme = themeQuartz.withParams({
  browserColorScheme: 'inherit',
  backgroundColor: 'var(--card)',
  foregroundColor: 'var(--fg)',
  headerBackgroundColor: 'var(--card)',
  headerTextColor: 'var(--fg-2)',
  borderColor: 'var(--border)',
  rowHoverColor: 'var(--wash)',
  accentColor: 'var(--accent)',
  chromeBackgroundColor: 'var(--card)',
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 600,
  wrapperBorderRadius: 12,
  inputBackgroundColor: 'var(--card)',
  menuBackgroundColor: 'var(--card)',
})

export { AG_GRID_LOCALE_TR as gridLocale } from '@ag-grid-community/locale'
