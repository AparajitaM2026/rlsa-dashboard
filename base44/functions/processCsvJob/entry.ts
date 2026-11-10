import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { routeRevenueCsv, routeRevenueCsvChunk } from '../../shared/revenueRouting.ts';
import { detectArchive, extractCompressedCsvToStorage } from '../../shared/zipExtract.ts';

// Background worker invoked by the "Process CSV Upload" workflow. The workflow
// loops, calling this function once per step:
//  - Compressed (.gz/.zip) uploads are extracted ONCE into ~10MB plain-CSV
//    fragment files (memory-bounded streaming), then each fragment is routed
//    in a single pass — no re-decompression per chunk.
//  - Plain CSVs are processed in resumable 12MB byte-range chunks.
// Each call returns { done: true/false }; the workflow loops until done.
// Runs as the service role (no user session).
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { job_id } = await req.json().catch(() => ({}));
    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.CsvUploadJob.get(job_id);
    if (!job) return Response.json({ error: 'job not found' }, { status: 404 });

    // Already finished — tell the workflow loop to stop (idempotent).
    if (job.status === 'completed') return Response.json({ done: true, total: job.total });
    if (job.status === 'failed') return Response.json({ done: true, error: job.error });

    // Mark in progress (the workflow loop drives iteration, not status changes).
    await base44.asServiceRole.entities.CsvUploadJob.update(job_id, { status: 'processing' });

    try {
      // Additive ingestion: new uploads APPEND to existing RevenueRow data —
      // no TRUNCATE or DELETE is performed on existing rows. Idempotency is
      // handled at the row level via `row_hash` in the routing functions
      // (duplicate rows are skipped during bulk insert). Here we only reset
      // the MonthlyAggregate cache so the post-processing aggregation
      // rebuilds with the newly appended rows.
      // Guarded by `dedup_cleared` so a mid-job resume only resets once.
      if (!job.dedup_cleared) {
        if (job.multi_month) {
          // Multi-month (PDL cumulative): reset ALL MonthlyAggregate caches —
          // a multi-month file can affect any period.
          const allAggs = await base44.asServiceRole.entities.MonthlyAggregate.list('-created_date', 500);
          for (const agg of allAggs) {
            await base44.asServiceRole.entities.MonthlyAggregate.update(agg.id, {
              scan_complete: false, scan_skip: 0, computed_at: null,
            });
          }
        } else {
          // Single-month: reset only this period's MonthlyAggregate cache.
          const existingAggs = await base44.asServiceRole.entities.MonthlyAggregate.filter({ report_month: job.report_month }, '-created_date', 1);
          if (existingAggs.length > 0) {
            await base44.asServiceRole.entities.MonthlyAggregate.update(existingAggs[0].id, {
              scan_complete: false, scan_skip: 0, computed_at: null,
            });
          }
        }
        await base44.asServiceRole.entities.CsvUploadJob.update(job_id, { dedup_cleared: true });
      }

      const archive = detectArchive(job.file_url);
      const fragments: string[] = (job.fragments as string[]) || [];

      // Phase 1 — extract a compressed archive into plain-CSV fragment files
      // (once). Each fragment is a standalone CSV with the header, so later
      // steps route it instantly without re-decompressing.
      if (archive && fragments.length === 0) {
        const { file_urls } = await extractCompressedCsvToStorage(base44, job.file_url);
        if (file_urls.length === 0) {
          await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
            status: 'completed', total: 0, house: 0, client: 0, unmapped: 0,
            rows_processed: 0, bytes_total: 0, bytes_processed: 0,
          });
          return Response.json({ done: true, total: 0 });
        }
        await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
          fragments: file_urls,
          fragment_index: 0,
          bytes_total: file_urls.length,
          bytes_processed: 0,
          rows_processed: 0,
          total: 0, house: 0, client: 0, unmapped: 0,
          csv_header: null,
          unmapped_imprints: [],
        });
        return Response.json({ done: false, phase: 'extracted', fragments: file_urls.length });
      }

      // Phase 2 — route extracted fragments (compressed uploads). Process
      // multiple fragments per call up to a time budget, persisting progress
      // after each so it's resumable; the bounded workflow loop re-invokes.
      if (fragments.length > 0) {
        let idx = (job.fragment_index as number) || 0;
        if (idx >= fragments.length) {
          await base44.asServiceRole.entities.CsvUploadJob.update(job_id, { status: 'completed' });
          return Response.json({ done: true, total: job.total });
        }
        const start = Date.now();
        let runningTotal = job.total || 0;
        let runningHouse = job.house || 0;
        let runningClient = job.client || 0;
        let runningUnmapped = job.unmapped || 0;
        const imprints = new Set<string>(((job.unmapped_imprints as string[]) || []));
        let doneFrags = false;
        while (idx < fragments.length) {
          const baseTotal = runningTotal;
          const fragRes = await routeRevenueCsv(base44, fragments[idx], job.report_month, job.vendor_name || 'Orchard', async (p: any) => {
            await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
              rows_processed: baseTotal + p.rows,
            });
          });
          runningTotal += fragRes.total;
          runningHouse += fragRes.house;
          runningClient += fragRes.client;
          runningUnmapped += fragRes.unmapped;
          for (const im of fragRes.unmapped_imprints) imprints.add(im);
          idx++;
          doneFrags = idx >= fragments.length;
          await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
            total: runningTotal,
            house: runningHouse,
            client: runningClient,
            unmapped: runningUnmapped,
            unmapped_imprints: Array.from(imprints),
            fragment_index: idx,
            bytes_processed: idx,
            rows_processed: runningTotal,
            status: doneFrags ? 'completed' : 'processing',
          });
          if (doneFrags) break;
          // Conservative 90s budget: even if the NEXT fragment is slow (~200s),
          // the call finishes in ≤ ~290s, safely under the 300s step limit.
          if (Date.now() - start > 90000) break; // time budget — let the workflow re-invoke
        }
        return Response.json({ done: doneFrags, total: runningTotal });
      }

      // Phase 3 — plain CSV: resumable byte-range chunking.
      const result = await routeRevenueCsvChunk(base44, {
        file_url: job.file_url,
        report_month: job.report_month,
        vendor_name: job.vendor_name || 'Orchard',
        offset: job.bytes_processed || 0,
        totalBytesKnown: job.bytes_total || 0,
        header: job.csv_header || null,
        acc: { total: job.total || 0, house: job.house || 0, client: job.client || 0, unmapped: job.unmapped || 0 },
        unmappedImprints: job.unmapped_imprints || [],
      }, async (p: any) => {
        await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
          rows_processed: p.rows, bytes_total: p.totalBytes, bytes_processed: p.bytes,
          total: p.total, house: p.house, client: p.client, unmapped: p.unmapped,
          csv_header: p.header, unmapped_imprints: p.unmapped_imprints,
        });
      });
      if (result.done) {
        await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
          status: 'completed', total: result.total, house: result.house, client: result.client,
          unmapped: result.unmapped, unmapped_imprints: result.unmapped_imprints,
          rows_processed: result.total, bytes_processed: result.bytes,
        });
        return Response.json({ done: true, ...result });
      }
      return Response.json({ done: false, ...result });
    } catch (err) {
      await base44.asServiceRole.entities.CsvUploadJob.update(job_id, {
        status: 'failed', error: err.message,
      });
      // done:true stops the workflow loop on error (no infinite retry).
      return Response.json({ done: true, error: err.message });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});