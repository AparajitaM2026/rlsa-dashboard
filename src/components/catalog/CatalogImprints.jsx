import { Building2, ArrowRightLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/royalty';

export default function CatalogImprints({ imprints, reassigning, onReassign, t }) {
  if (!imprints || imprints.length === 0) return null;
  return (
    <Card className="overflow-hidden mb-6">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <Building2 className="w-4 h-4 text-amber-600" />
        <h2 className="font-semibold">{t('ca.imprints')}</h2>
        <span className="text-sm text-muted-foreground ml-auto">{imprints.length} {t('ca.imprints_label')}</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ca.imprint')}</TableHead>
            <TableHead className="text-right">{t('ca.rows')}</TableHead>
            <TableHead className="text-right">{t('ca.units')}</TableHead>
            <TableHead className="text-right">{t('ca.gross')}</TableHead>
            <TableHead className="text-right">{t('ca.action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {imprints.map((imp) => (
            <TableRow key={imp.key}>
              <TableCell className="font-medium">{imp.key}</TableCell>
              <TableCell className="text-right">{formatNumber(imp.rows)}</TableCell>
              <TableCell className="text-right">{formatNumber(imp.units)}</TableCell>
              <TableCell className="text-right">{formatCurrency(imp.gross)}</TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="outline" disabled={reassigning} onClick={() => onReassign(imp)}>
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                  {t('ca.reassign')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}