# RLSA Records Group — Artist & Admin Royalty Dashboard

Dedicated distribution and royalty management dashboard for **RLSA Records Group**.

## Capabilities
- **Catalog Management**: House imprints, audio tracks, ISRCs, UPCs, and multi-format audio masters.
- **Bulk CSV Ingestion**: Multi-store royalty statements (Spotify, Apple Music, YouTube, Amazon, TikTok, etc.) with automatic revenue calculation.
- **Analytics & Reporting**: Real-time breakdowns across DSP stores, global territories, track-level performance, and sub-labels.
- **Payout System**: Automated balance settlement, statement generation, and payment export.
- **Multi-Tenant Isolation**: Scoped strictly to RLSA Records Group party data (`party_rlsa_records`).

## Architecture
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide icons, Recharts
- **Backend**: Node.js / Express on port 5006
- **Database**: Independent Neon PostgreSQL pooler over universal HTTPS (port 443)

## Running Locally
```bash
# Run both Backend API (port 5006) and Frontend UI (port 5176)
npm start
```
