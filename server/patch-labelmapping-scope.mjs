import fs from 'fs';

const file = 'D:/projects/ottmconnect-local-backend/src/pages/admin/LabelMapping.jsx';
let content = fs.readFileSync(file, 'utf8');

// Ensure isPartyAdmin is imported from roles
if (!content.includes('isPartyAdmin')) {
  content = content.replace(
    "import { getPartyId } from '@/lib/roles';",
    "import { getPartyId, isPartyAdmin } from '@/lib/roles';"
  );
}

// Update load function to scope mappings and clients for Party Admin
const oldLoadRegex = /const load = \(\) => \{[\s\S]*?\}\);\s*\};/;
const newLoadCode = `const load = () => {
    setLoading(true);
    const partyAdminUser = isPartyAdmin(user);

    Promise.all([
      base44.entities.LabelMapping.list('-created_date', 500),
      base44.entities.ClientAccount.list('-created_date', 500)
    ])
      .then(([m, c]) => {
        // If Party Admin, restrict client accounts to caller's party
        const visibleClients = partyAdminUser && partyId
          ? c.filter((row) => row.party_id === partyId)
          : c;

        const visibleClientIds = new Set(visibleClients.map((row) => row.id));

        // Deduplicate and filter mappings
        const seen = new Set();
        const deduped = m.filter((row) => {
          const key = (row.raw_imprint || '').trim().toLowerCase();
          if (!key || seen.has(key)) return false;

          // Party Admin only sees mappings for their own party / their party's client accounts
          if (partyAdminUser) {
            const matchesParty = row.party_id === partyId;
            const matchesClient = row.client_account_id && visibleClientIds.has(row.client_account_id);
            if (!matchesParty && !matchesClient) return false;
          }

          seen.add(key);
          return true;
        });

        setMappings(deduped);
        setClients(visibleClients);
      })
      .finally(() => setLoading(false));
  };`;

if (oldLoadRegex.test(content)) {
  content = content.replace(oldLoadRegex, newLoadCode);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully updated LabelMapping.jsx with party-scoping');
} else {
  console.log('Regex did not match old load function');
}
