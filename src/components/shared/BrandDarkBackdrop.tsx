/**
 * Ambient background for the public, pre-login pages (bienvenida, login,
 * registro): a soft brand glow plus a faint dot grid. Render inside a
 * `relative overflow-hidden` ancestor with a dark background.
 */
export function BrandDarkBackdrop() {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(60rem 36rem at 15% -10%, hsl(var(--primary) / 0.22), transparent 60%), radial-gradient(44rem 30rem at 100% 100%, hsl(199 89% 55% / 0.14), transparent 55%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.25]"
        style={{
          backgroundImage: 'radial-gradient(hsl(var(--sidebar-border)) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: 'linear-gradient(to bottom, black, transparent 85%)',
        }}
      />
    </>
  )
}
