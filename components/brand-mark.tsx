export function BrandMark({ small = false }: { small?: boolean }) {
  return <svg className={`brand-mark${small ? " small" : ""}`} viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    <rect x="3" y="19" width="6" height="10" rx="2" />
    <rect x="13" y="11" width="6" height="18" rx="2" />
    <rect x="23" y="3" width="6" height="26" rx="2" />
  </svg>;
}
