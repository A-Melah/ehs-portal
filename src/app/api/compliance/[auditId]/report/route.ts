import { NextRequest, NextResponse } from 'next/server';
import { createClient }      from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { jsPDF }             from 'jspdf';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ auditId: string }> }
) {
  const { auditId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: audit } = await admin
    .from('compliance_audits')
    .select('*, auditor:profiles(full_name)')
    .eq('id', auditId)
    .single();

  if (!audit) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  const { data: lineItems } = await admin
    .from('audit_line_items')
    .select('*')
    .eq('audit_id', auditId)
    .order('area')
    .order('legal_document');

  const items = (lineItems ?? []) as any[];

  // ── Score from line items directly ────────────────────────────────────────
  const total       = items.filter(li => li.status !== 'not_applicable').length;
  const compliantCt = items.filter(li => li.status === 'compliant').length;
  const nonCompCt   = items.filter(li => li.status === 'non_compliant').length;
  const notAssessed = items.filter(li => li.status === 'not_assessed').length;
  const score       = total > 0 ? Math.round((compliantCt / total) * 100) : 0;

  // Group by area → legal_document
  const grouped: Record<string, Record<string, any[]>> = {};
  items.forEach(li => {
    const area = li.area ?? li.section ?? 'General';
    const doc  = li.legal_document ?? 'General';
    if (!grouped[area])       grouped[area]      = {};
    if (!grouped[area][doc])  grouped[area][doc]  = [];
    grouped[area][doc].push(li);
  });

  // ── PDF setup ──────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W   = 297;
  const H   = 210;
  const ML  = 10;
  const MR  = 10;
  const CW  = W - ML - MR;
  let   y   = 15;

  const brand = [21, 179, 110]  as [number,number,number];
  const red   = [239, 68, 68]   as [number,number,number];
  const amber = [245, 158, 11]  as [number,number,number];
  const muted = [107, 127, 118] as [number,number,number];
  const dark  = [15, 31, 24]    as [number,number,number];
  const light = [248, 250, 249] as [number,number,number];
  const white = [255, 255, 255] as [number,number,number];

  function newPage() { doc.addPage(); y = 15; }
  function checkY(n: number) { if (y + n > H - 15) newPage(); }

  // ── Cover header ──────────────────────────────────────────────────────────
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 38, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LEGAL COMPLIANCE AUDIT REPORT', ML, 13);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(audit.title, ML, 21);
  doc.text(
    `${audit.period ? audit.period + ' · ' : ''}Generated: ${new Date().toLocaleDateString('en-NG')}`,
    ML, 27
  );

  const industryLabel = [audit.industry_name, audit.sub_sector_name].filter(Boolean).join(' — ');
  doc.text(
    `Auditor: ${(audit.auditor as any)?.full_name ?? '—'}${industryLabel ? ' · ' + industryLabel : ''}`,
    ML, 33
  );

  // Score badge
  const scoreColor = score >= 80 ? brand : score >= 60 ? amber : red;
  doc.setFillColor(...white);
  doc.roundedRect(W - MR - 42, 5, 42, 28, 3, 3, 'F');
  doc.setTextColor(...scoreColor);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text(`${score}%`, W - MR - 21, 20, { align: 'center' });
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);
  doc.text('OVERALL COMPLIANCE', W - MR - 21, 27, { align: 'center' });
  doc.text(`${compliantCt}/${total} requirements`, W - MR - 21, 31, { align: 'center' });

  y = 42;

  // Not-assessed warning
  if (notAssessed > 0) {
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(ML, y, CW, 8, 1, 1, 'F');
    doc.setTextColor(...amber);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `⚠  ${notAssessed} requirement${notAssessed > 1 ? 's' : ''} not assessed — counted as non-compliant`,
      ML + 3, y + 5.5
    );
    y += 11;
  }

  // ── Summary bar ───────────────────────────────────────────────────────────
  doc.setFillColor(...light);
  doc.roundedRect(ML, y, CW, 18, 2, 2, 'F');

  const summaryItems = [
    { label: 'Total Requirements', value: String(total),       color: dark  },
    { label: 'Compliant',          value: String(compliantCt), color: brand },
    { label: 'Non-Compliant',      value: String(nonCompCt),   color: nonCompCt > 0 ? red : dark },
    { label: 'Not Assessed',       value: String(notAssessed), color: notAssessed > 0 ? amber : muted },
    { label: 'Compliance Score',   value: `${score}%`,         color: scoreColor },
  ];

  summaryItems.forEach(({ label, value, color }, i) => {
    const x = ML + 4 + i * (CW / 5);
    doc.setTextColor(...muted);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y + 6);
    doc.setTextColor(...(color as [number,number,number]));
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x, y + 14);
  });

  y += 22;

  // ── Column widths ─────────────────────────────────────────────────────────
  const C = {
    num:        6,
    area:       8,
    ref:       40,
    req:       52,
    measure:   52,
    validation:24,
    owner:     24,
    freq:      20,
    due:       26,
    status:    25,
  };

  function drawHeader() {
    doc.setFillColor(...brand);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    let x = ML + 1.5;
    const headers: [string, number][] = [
      ['#',                  C.num],
      ['A',                  C.area],
      ['Legal Reference',    C.ref],
      ['Requirement',        C.req],
      ['Compliance Measure', C.measure],
      ['Validation',         C.validation],
      ['Owner',              C.owner],
      ['Frequency',          C.freq],
      ['Due Date',           C.due],
      ['Status',             C.status],
    ];
    headers.forEach(([lbl, w]) => { doc.text(lbl, x, y + 5); x += w; });
    y += 8;
  }

  drawHeader();

  // ── Rows ──────────────────────────────────────────────────────────────────
  let rowNum = 0;

  for (const [area, docGroups] of Object.entries(grouped)) {
    // Area header
    checkY(10);
    doc.setFillColor(222, 237, 228);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setTextColor(...dark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`AREA: ${area.toUpperCase()}`, ML + 3, y + 5);
    y += 8;

    for (const [docTitle, reqs] of Object.entries(docGroups)) {
      for (const li of reqs) {
        rowNum++;
        const st      = li.status ?? 'not_assessed';
        const measure = li.ai_measures ?? li.compliance_measures ?? '';
        const answer  = li.inspector_answer ?? null;

        // Dynamic row height
        doc.setFontSize(6);
        const reqLines  = doc.splitTextToSize(li.specific_requirement ?? '', C.req - 3);
        const measLines = doc.splitTextToSize(measure, C.measure - 3);
        const refLines  = doc.splitTextToSize(`${docTitle}\n${li.source_section ?? ''}`, C.ref - 3);
        const maxLines  = Math.max(reqLines.length, measLines.length, refLines.length, 2);
        const rowH      = Math.max(maxLines * 3.8 + 4, 12);

        checkY(rowH + 1);
        if (y === 15) drawHeader();

        // Row background
        const rowBg: [number,number,number] =
          st === 'non_compliant' ? [255, 242, 242] :
          st === 'compliant'     ? [240, 253, 247] :
          rowNum % 2 === 0       ? [250, 252, 251] : [255, 255, 255];
        doc.setFillColor(...rowBg);
        doc.rect(ML, y, CW, rowH, 'F');

        const top = y + 3;
        let x = ML + 1.5;

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');

        // # number
        doc.setTextColor(...muted);
        doc.text(String(rowNum), x, top);
        x += C.num;

        // Area badge
        const areaClr: [number,number,number] =
          area === 'Safety'      ? [180, 50,  50]  :
          area === 'Health'      ? [30,  100, 200] :
          area === 'Environment' ? [21,  130, 80]  :
          area === 'HR'   ? [120, 50,  180] : [100, 100, 100];
        const areaBg: [number,number,number] =
          area === 'Safety'      ? [255, 235, 235] :
          area === 'Health'      ? [225, 235, 255] :
          area === 'Environment' ? [220, 245, 232] :
          area === 'HR'   ? [240, 225, 255] : [230, 230, 230];
        doc.setFillColor(...areaBg);
        doc.roundedRect(x, y + (rowH - 6) / 2, C.area - 1, 6, 1, 1, 'F');
        doc.setTextColor(...areaClr);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text(area[0], x + (C.area - 1) / 2, y + (rowH - 6) / 2 + 4.5, { align: 'center' });
        x += C.area;

        // Legal ref
        doc.setTextColor(...dark);
        doc.setFont('helvetica', 'normal');
        doc.text(refLines, x, top);
        x += C.ref;

        // Requirement
        doc.text(reqLines, x, top);
        x += C.req;

        // Compliance measure
        doc.setFont('helvetica', 'bold');
        doc.text(measLines, x, top);
        x += C.measure;

        // Validation
        const valText =
          answer === 'yes'     ? 'YES - Implemented' :
          answer === 'partial' ? 'PARTIAL'           :
          answer === 'no'      ? 'NO - Not impl.'    : 'Pending';
        const valClr: [number,number,number] =
          answer === 'yes'     ? brand :
          answer === 'partial' ? amber :
          answer === 'no'      ? red   : muted;
        doc.setTextColor(...valClr);
        doc.setFontSize(5.5);
        doc.setFont('helvetica', answer ? 'bold' : 'normal');
        doc.text(doc.splitTextToSize(valText, C.validation - 3), x, top);
        x += C.validation;

        // Owner
        doc.setTextColor(...dark);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text(doc.splitTextToSize(li.responsible_person ?? '—', C.owner - 3), x, top);
        x += C.owner;

        // Frequency
        doc.setTextColor(...muted);
        doc.text(doc.splitTextToSize(li.frequency ?? '—', C.freq - 3), x, top);
        x += C.freq;

        // Due date
        doc.setTextColor(...dark);
        doc.text(doc.splitTextToSize(li.due_date ?? 'Continuous', C.due - 3), x, top);
        x += C.due;

        // Status pill
        const stClr: [number,number,number] =
          st === 'compliant'     ? brand :
          st === 'non_compliant' ? red   : muted;
        const stLabel =
          st === 'compliant'     ? 'COMPLIANT'  :
          st === 'non_compliant' ? 'NON-COMP.'  :
          st === 'not_applicable'? 'N/A'        : 'PENDING';
        doc.setFillColor(...stClr);
        doc.roundedRect(x, y + (rowH - 7) / 2, C.status - 2, 7, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.text(stLabel, x + (C.status - 2) / 2, y + (rowH - 7) / 2 + 5, { align: 'center' });

        y += rowH;

        // Row separator
        doc.setDrawColor(220, 232, 225);
        doc.setLineWidth(0.15);
        doc.line(ML, y, ML + CW, y);
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setTextColor(...muted);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `EHS Compliance Portal · ${audit.title} · Audit ID: ${audit.id}`,
      ML, H - 6
    );
    doc.text(`Page ${p} of ${pageCount}`, W - MR, H - 6, { align: 'right' });
    doc.setDrawColor(...brand);
    doc.setLineWidth(0.5);
    doc.line(ML, H - 9, W - MR, H - 9);
  }

  const buffer  = Buffer.from(doc.output('arraybuffer'));
  const dateStr = new Date().toISOString().split('T')[0];

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="Compliance-Report-${dateStr}.pdf"`,
    },
  });
}