import { Search, Loader2, Building2, Music2, Users, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

export default function CatalogSourceBar({
  source, setSource, clients, query, setQuery, searching, onSearch, t, scopeParty
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-4">
      <div className="w-56 space-y-1">
        <Label>{t('ca.source')}</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {!scopeParty && (
              <SelectItem value="house">
                <span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" /> {t('ca.source_house')}</span>
              </SelectItem>
            )}
            {!scopeParty && (
              <SelectItem value="all">
                <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> {t('ca.source_all')}</span>
              </SelectItem>
            )}
            {clients.length > 0 && !scopeParty && (
              <div className="px-2 py-1 text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-3 h-3" /> {t('ca.source_clients')}
              </div>
            )}
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <form onSubmit={onSearch} className="flex gap-2 flex-1 min-w-[240px]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            className="pl-9"
            placeholder={t('ca.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
          {t('ca.search')}
        </Button>
      </form>
    </div>
  );
}