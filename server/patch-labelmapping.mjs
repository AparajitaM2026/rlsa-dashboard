import fs from 'fs';

const file = 'D:/projects/ottmconnect-local-backend/src/pages/admin/LabelMapping.jsx';
let content = fs.readFileSync(file, 'utf8');

const targetRegex = /const remove = async \(m\) => \{[\s\S]*?load\(\);\s*\};/;
const replacement = `const remove = async (m) => {
    if (!confirm(t('lm.delete_confirm', { name: m.raw_imprint }))) return;
    try {
      await base44.entities.LabelMapping.delete(m.id);
      try {
        await logActivity({
          action: 'label_mapping_deleted',
          description: \`Deleted mapping for "\${m.raw_imprint}"\`,
          entity_type: 'LabelMapping',
          entity_id: m.id
        });
      } catch (_) {}
      await load();
    } catch (err) {
      alert('Delete failed: ' + (err.message || 'Unknown error'));
    }
  };`;

if (targetRegex.test(content)) {
  content = content.replace(targetRegex, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated LabelMapping.jsx');
} else {
  console.log('Regex did not match');
}
