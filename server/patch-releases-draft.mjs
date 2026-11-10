import fs from 'fs';

const file = 'D:/projects/ottmconnect-local-backend/src/pages/admin/Releases.jsx';
let content = fs.readFileSync(file, 'utf8');

const target = `const STATUS_CONFIG = {
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100', badge: 'secondary' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', badge: 'default' },
  rejected: { label: 'Action Needed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', badge: 'destructive' }
};`;

const replacement = `const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100', badge: 'outline' },
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100', badge: 'secondary' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', badge: 'default' },
  rejected: { label: 'Action Needed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', badge: 'destructive' }
};`;

if (content.replace(/\r\n/g, '\n').includes(target)) {
  content = content.replace(/\r\n/g, '\n').replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated Releases.jsx');
} else {
  console.log('Target not matched in Releases.jsx');
}
