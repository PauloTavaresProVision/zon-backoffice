export function ZonLogo({ className = "" }: { className?: string }) {
  return (
    <svg className={`zon-logo ${className}`} viewBox="0 0 366 142" role="img" aria-label="ZON">
      <path className="gold" d="M27,51 L106,51 L106,28 L52,28 Q28,28 27,51 M27,102 L78,51 L106,51 L106,68 L72,102 L105,102 L105,126 L27,126 Z M222,28 L247,28 L301,85 L301,57 L325,57 L325,125 L301,125 L247,70 L247,125 L222,125 Z" />
      <path className="ring" fillRule="evenodd" d="M162,27 C231,27 232,127 164,127 C96,127 96,27 162,27 M163,47 C123,47 124,107 164,107 C204,107 203,47 163,47" />
      <path className="shade" d="M113,59 L133,60 C117,86 135,108 151,112 L142,125 C115,117 102,89 113,59" />
      <path className="gold" d="M302,37h8v8h-8z M316,32h8v13h-8z M309,49h8v8h-8z M297,27h5v6h-5z M108,104h6v6h-6z M115,112h7v7h-7z M107,120h6v6h-6z M99,115h5v5h-5z" />
      <path className="dots" d="M126,28h4v4h-4z M135,33h5v5h-5z M121,36h4v4h-4z M130,41h4v4h-4z M140,26h5v5h-5z" />
    </svg>
  );
}
