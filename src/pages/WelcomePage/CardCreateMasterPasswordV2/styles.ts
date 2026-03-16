// Colors extracted from Figma design tokens
const C = {
  surfacePrimary: '#15180e',
  surfaceHover: '#212814',
  surfaceElevated: '#212814',
  surfaceDisabled: '#212814',
  borderPrimary: '#212814',
  borderSecondary: '#2c3618',
  borderAccent: '#b0d944',
  textPrimary: 'white',
  textSecondary: '#bdc3ac',
  textAccent: '#b0d944',
  textDisabled: '#435123',
  textOnAccent: '#08090c',
  accentPrimary: '#b0d944',
  semanticWarning: '#d7d245',
  semanticSuccess: '#b0d944',
  white: '#f6f6f6',
  touLink: '#bade5b'
}

export const styles = {
  // Outer card — fullscreen, replaces CardVaultActions
  card: {
    background: C.surfacePrimary,
    border: `1px solid ${C.borderPrimary}`,
    borderRadius: '8px 8px 20px 20px',
    paddingTop: '55px',
    paddingBottom: '55px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '35px',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    boxSizing: 'border-box' as const
  },

  // Inner form content — max-width 500px
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    alignItems: 'flex-start',
    justifyContent: 'center',
    width: '100%',
    maxWidth: '500px',
    borderRadius: '8px'
  },

  // Header
  header: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    width: '100%'
  },
  title: {
    fontFamily: "'Humble Nostalgia', sans-serif",
    fontSize: '28px',
    fontWeight: 400,
    color: C.white,
    margin: 0,
    lineHeight: 'normal'
  },
  subtitle: {
    color: C.textPrimary,
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: 'normal',
    margin: 0
  },
  subtitleLink: {
    color: C.textAccent,
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationStyle: 'solid' as const
  },

  // Fields section
  fieldsWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    width: '100%'
  },

  // Password wrapper (input + optional toast)
  passwordWrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderRadius: '8px',
    width: '100%',
    isolation: 'isolate' as const
  },

  // Custom input field — default state
  inputField: {
    background: C.surfacePrimary,
    border: `1px solid ${C.borderPrimary}`,
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    width: '100%',
    boxSizing: 'border-box' as const,
    position: 'relative' as const,
    zIndex: 2
  },

  // Custom input field — focused state
  inputFieldFocused: {
    background: C.surfaceHover,
    border: `1px solid ${C.borderAccent}`,
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    cursor: 'pointer',
    overflow: 'hidden',
    width: '100%',
    boxSizing: 'border-box' as const,
    boxShadow: '0px 0px 0px 2px rgba(176,217,68,0.35)',
    position: 'relative' as const,
    zIndex: 2
  },

  // Left side of input
  inputContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  inputLabel: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    color: C.textPrimary,
    lineHeight: 'normal',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const
  },
  inputValue: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: C.textPrimary,
    lineHeight: 'normal',
    background: 'none',
    border: 'none',
    outline: 'none',
    padding: 0,
    width: '100%'
  },
  inputPlaceholder: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    color: C.textSecondary,
    lineHeight: 'normal',
    background: 'none',
    border: 'none',
    outline: 'none',
    padding: 0,
    width: '100%'
  },

  // Right slot (indicator + divider + eye)
  rightSlot: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    flexShrink: 0
  },

  // Password indicator
  indicator: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
    flexShrink: 0
  },
  indicatorText: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: 'normal',
    whiteSpace: 'nowrap' as const
  },
  indicatorIcon: {
    width: '12px',
    height: '12px',
    flexShrink: 0
  },

  // Divider between indicator and eye
  divider: {
    width: '1px',
    height: '12px',
    backgroundColor: C.borderSecondary,
    flexShrink: 0
  },

  // Eye toggle button
  eyeButton: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    background: 'none',
    border: 'none',
    padding: 0,
    color: C.textSecondary,
    flexShrink: 0
  },

  // Toast (info hint below password field)
  toast: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: C.surfaceElevated,
    border: `1px solid ${C.borderSecondary}`,
    borderTop: 'none',
    borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px',
    width: '100%',
    boxSizing: 'border-box' as const,
    zIndex: 1
  },
  toastIcon: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    color: C.white
  },
  toastText: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    color: C.white,
    lineHeight: 'normal',
    flex: 1
  },

  // Alert message
  alertWrapper: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: C.surfaceElevated,
    borderRadius: '8px',
    height: '54px',
    width: '100%',
    boxSizing: 'border-box' as const
  },
  alertIcon: {
    flexShrink: 0,
    width: '16px',
    height: '16px'
  },
  alertText: {
    flex: 1,
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    color: C.white,
    lineHeight: 'normal'
  },

  // Footer row
  footerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%'
  },
  touText: {
    fontFamily: "'Inter', sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    color: C.textSecondary,
    lineHeight: 'normal',
    maxWidth: '302px',
    padding: '5px 0'
  },
  touLink: {
    color: C.touLink,
    textDecoration: 'underline',
    textDecorationStyle: 'solid' as const
  },

  // Continue button (disabled state override)
  buttonDisabled: {
    backgroundColor: C.surfaceDisabled,
    color: C.textDisabled
  }
}

export { C as colors }
