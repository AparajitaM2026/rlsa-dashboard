import fs from 'fs';

const file = 'D:/projects/ottmconnect-local-backend/src/pages/client/RepertoireUpload.jsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add savingDraft state if not present
if (!content.includes('savingDraft')) {
  content = content.replace(
    "const [submitting, setSubmitting] = useState(false);",
    "const [submitting, setSubmitting] = useState(false);\n  const [savingDraft, setSavingDraft] = useState(false);"
  );
}

// 2. Add handleSaveDraft function
const draftFunction = `
  const handleSaveDraft = async () => {
    if (!form.release_title.trim()) {
      alert('Please enter at least a Release Title to save as draft.');
      return;
    }
    setSavingDraft(true);
    try {
      const subLabel = subLabels.find((s) => s.id === form.sub_label_id);
      const targetAccount = isPartyAdminView
        ? partyAccounts.find((a) => a.id === uploadAsId) || ownAccount || partyAccounts[0]
        : clientAccount;
      if (!targetAccount) {
        alert('Please select an account to save under.');
        setSavingDraft(false);
        return;
      }
      const payload = {
        ...form,
        sub_label_id: isPartyAdminView ? '' : form.sub_label_id,
        sub_label_name: isPartyAdminView ? '' : (subLabel?.name || ''),
        client_account_id: targetAccount.id,
        client_name: targetAccount.client_name,
        tracks,
        is_draft: true
      };
      const res = await base44.functions.invoke('submitRelease', payload);
      if (res.data?.ok) {
        await logActivity({
          action: 'release_draft_saved',
          description: \`Release "\${form.release_title}" saved as draft\`,
          entity_type: 'Release',
          entity_id: res.data.release?.id || ''
        });
        alert('Release saved as draft! You can view it under My Releases in Repertoire.');
        navigate('/repertoire');
      } else {
        alert('Failed to save draft: ' + (res.data?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to save draft: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingDraft(false);
    }
  };
`;

if (!content.includes('handleSaveDraft')) {
  content = content.replace("const handleSubmit = async () => {", draftFunction + "\n  const handleSubmit = async () => {");
}

// 3. Update the buttons in Step 3
const oldButtons = `<div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4" /> Back</Button>
            <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : <>Submit for Review <Check className="w-4 h-4" /></>}
            </Button>
          </div>`;

const newButtons = `<div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4" /> Back</Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={savingDraft || submitting || !form.release_title.trim()}
              >
                {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Saving Draft...</> : 'Save as Draft'}
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting || savingDraft}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting...</> : <>Submit for Review <Check className="w-4 h-4 ml-1" /></>}
              </Button>
            </div>
          </div>`;

if (content.replace(/\r\n/g, '\n').includes(oldButtons.replace(/\r\n/g, '\n'))) {
  content = content.replace(/\r\n/g, '\n').replace(oldButtons.replace(/\r\n/g, '\n'), newButtons);
}

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully updated RepertoireUpload.jsx');
