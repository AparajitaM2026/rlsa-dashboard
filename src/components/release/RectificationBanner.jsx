import { AlertTriangle } from 'lucide-react';

export default function RectificationBanner({ notice }) {
  if (!notice) return null;
  return (
    <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1.5">
        <AlertTriangle className="w-4 h-4" /> Rectification Notice from Admin
      </div>
      <p className="text-sm text-red-800 whitespace-pre-wrap">{notice}</p>
      <p className="text-xs text-red-600 mt-2">Make the requested corrections below, then resubmit for approval.</p>
    </div>
  );
}