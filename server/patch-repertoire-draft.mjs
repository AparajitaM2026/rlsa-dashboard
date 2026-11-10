import fs from 'fs';

const file = 'D:/projects/ottmconnect-local-backend/src/pages/client/Repertoire.jsx';
let content = fs.readFileSync(file, 'utf8');

const target = `const RELEASE_STATUS = {
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  rejected: { label: 'Action Needed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' }
};`;

const replacement = `const RELEASE_STATUS = {
  draft: { label: 'Draft', icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100' },
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  rejected: { label: 'Action Needed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' }
};`;

if (content.replace(/\r\n/g, '\n').includes(target)) {
  content = content.replace(/\r\n/g, '\n').replace(target, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated Repertoire.jsx');
} else {
  console.log('Target not matched');
}
