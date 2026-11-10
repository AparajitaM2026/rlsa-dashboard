import { useState, useEffect } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function BrandLogo({ logoUrl, brandName = 'RLSA Records Group', canEdit, onClick, variant = 'dark', className }) {
  const isDark = variant === 'dark';
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [logoUrl]);

  const cleanName = (brandName || 'RLSA Records Group').trim();
  const spaceIdx = cleanName.indexOf(' ');
  const firstWord = spaceIdx > 0 ? cleanName.substring(0, spaceIdx) : cleanName;
  const restWord = spaceIdx > 0 ? cleanName.substring(spaceIdx + 1) : '';

  return (
    <div className={cn('flex items-center gap-3 min-w-0', className)}>
      <a 
        href="#" 
        className="flex items-center gap-3 group transition-transform hover:scale-[1.02]"
        title={`Visit ${cleanName}`}
      >
        <img
          src={(!imgError && logoUrl) ? logoUrl : "/rlsa-logo.jpg"}
          alt={`${cleanName} Logo`}
          onError={() => setImgError(true)}
          className="h-10 w-10 object-contain shrink-0 rounded-xl drop-shadow-md border border-white/10 p-0.5 bg-black/30"
        />
        <div className="flex flex-col min-w-0">
          <span className="font-display font-extrabold text-base tracking-tight leading-none bg-gradient-to-r from-amber-400 via-amber-200 to-yellow-500 bg-clip-text text-transparent truncate max-w-[130px] uppercase">
            {firstWord}
          </span>
          {restWord && (
            <span className="text-[0.62rem] font-bold tracking-[0.25em] uppercase leading-none mt-1 text-amber-400/90 truncate max-w-[130px]">
              {restWord}
            </span>
          )}
        </div>
      </a>

      {canEdit && (
        <button
          type="button"
          onClick={onClick}
          title="Change logo & brand name"
          aria-label="Change logo & brand name"
          className={cn(
            'shrink-0 rounded-md p-1.5 border transition ms-1',
            isDark
              ? 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-primary/50'
          )}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
