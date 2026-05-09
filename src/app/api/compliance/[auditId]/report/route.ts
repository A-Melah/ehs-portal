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

  const [{ data: requirements }, { data: lineItems }] = await Promise.all([
    admin.from('legal_requirements').select('*').eq('active', true)
      .overlaps('applies_to_sections', audit.sections)
      .order('area').order('legal_document'),
    admin.from('audit_line_items').select('*').eq('audit_id', audit.id),
  ]);

  const reqs     = requirements ?? [];
  const items    = lineItems   ?? [];
  const sections = audit.sections as string[];

  const itemMap: Record<string, any> = {};
  items.forEach((li: any) => { itemMap[`${li.requirement_id}::${li.section}`] = li; });

  // ── Score: compliant ÷ (all req×section combinations) ─────────────────────
  let totalCombinations = 0;
  let compliantCt       = 0;
  let nonCompCt         = 0;
  let notAssessedCt     = 0;

  reqs.forEach((req: any) => {
    sections.forEach(section => {
      if (!req.applies_to_sections.includes(section)) return;
      totalCombinations++;
      const li = itemMap[`${req.id}::${section}`];
      const st = li?.status ?? 'not_assessed';
      if (st === 'compliant')     compliantCt++;
      else if (st === 'non_compliant') nonCompCt++;
      else if (st !== 'not_applicable') notAssessedCt++;
    });
  });

  const score = totalCombinations > 0
    ? Math.round((compliantCt / totalCombinations) * 100)
    : 0;

  // ── PDF setup ─────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W   = 297;
  const H   = 210;
  const ML  = 10;
  const MR  = 10;
  const CW  = W - ML - MR;
  let   y   = 15;

  const brand = [21, 179, 110]   as [number,number,number];
  const red   = [239, 68, 68]    as [number,number,number];
  const amber = [245, 158, 11]   as [number,number,number];
  const muted = [107, 127, 118]  as [number,number,number];
  const dark  = [15, 31, 24]     as [number,number,number];
  const light = [248, 250, 249]  as [number,number,number];
  const white = [255, 255, 255]  as [number,number,number];

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
  doc.text(
    `Auditor: ${(audit.auditor as any)?.full_name ?? '—'} · Sections: ${sections.join(', ')}`,
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
  doc.text('OVERALL COMPLIANCE', W - MR - 21, 27, { align: 'center' });
  doc.text(`${compliantCt}/${totalCombinations} requirements`, W - MR - 21, 31, { align: 'center' });

  y = 42;

  // Incomplete warning
  if (notAssessedCt > 0) {
    doc.setFillColor(255, 251, 235);
    doc.roundedRect(ML, y, CW, 8, 1, 1, 'F');
    doc.setTextColor(...amber);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `⚠  ${notAssessedCt} requirement${notAssessedCt > 1 ? 's' : ''} not assessed across selected sections — counted as non-compliant in the score`,
      ML + 3, y + 5.5
    );
    y += 11;
  }

  // ── Summary bar ───────────────────────────────────────────────────────────
  doc.setFillColor(...light);
  doc.roundedRect(ML, y, CW, 18, 2, 2, 'F');

  const summaryItems: { label: string; value: string; color: [number,number,number] }[] = [
    { label: 'Total (req × section)', value: String(totalCombinations),  color: dark  },
    { label: 'Compliant',             value: String(compliantCt),         color: brand },
    { label: 'Non-Compliant',         value: String(nonCompCt),           color: nonCompCt > 0 ? red : dark },
    { label: 'Not Assessed',          value: String(notAssessedCt),       color: notAssessedCt > 0 ? amber : muted },
    { label: 'Compliance Score',      value: `${score}%`,                 color: scoreColor },
  ];

  summaryItems.forEach(({ label, value, color }, i) => {
    const x = ML + 4 + i * (CW / 5);
    doc.setTextColor(...muted);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y + 6);
    doc.setTextColor(...color);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x, y + 14);
  });

  y += 22;

  // ── Column definitions (total = CW = 277mm) ───────────────────────────────
  const C = {
    num:        6,   //   6
    area:       8,   //  14  — just a coloured pill letter (S/H/E)
    ref:       44,   //  58  — wider for long doc names
    req:       50,   // 108
    measure:   50,   // 158
    validation:24,   // 182
    owner:     24,   // 206
    freq:      20,   // 226
    due:       26,   // 252
    status:    25,   // 277
  };

  // ── Table header ──────────────────────────────────────────────────────────
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
    headers.forEach(([lbl, w]) => {
      doc.text(lbl, x, y + 5);
      x += w;
    });
    y += 8;
  }

  drawHeader();

  // ── Helper: measure wrapped text height ──────────────────────────────────
  function textH(text: string, w: number, fontSize = 6, lineHeight = 3.8): number {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text || '—', w - 3);
    return lines.length * lineHeight;
  }

  // ── Rows ──────────────────────────────────────────────────────────────────
  let rowNum = 0;

  sections.forEach(section => {
    checkY(12);
    doc.setFillColor(222, 237, 228);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setTextColor(...dark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`SECTION: ${section.toUpperCase()}`, ML + 3, y + 5);
    y += 8;

    (['Safety', 'Health', 'Environment'] as const).forEach(area => {
      const areaReqs = reqs.filter((r: any) =>
        r.area === area && r.applies_to_sections.includes(section)
      );
      if (!areaReqs.length) return;

      areaReqs.forEach((req: any) => {
        rowNum++;
        const li      = itemMap[`${req.id}::${section}`];
        const st      = li?.status ?? 'not_assessed';
        const measure = li?.ai_measures ?? req.compliance_measures ?? '';
        const answer  = li?.inspector_answer ?? null;

        // Measure dynamic row height from the two main text columns
        doc.setFontSize(6);
        const reqLines  = doc.splitTextToSize(req.specific_requirement || '', C.req - 3);
        const measLines = doc.splitTextToSize(measure, C.measure - 3);
        const refLines  = doc.splitTextToSize(
          `${req.legal_document}\n${req.source_section}`, C.ref - 3
        );
        const ownerLines2 = doc.splitTextToSize(
          li?.responsible_person ?? req.owner ?? '', C.owner - 3
        );
        const maxLines  = Math.max(reqLines.length, measLines.length, refLines.length, ownerLines2.length, 2);
        const LH        = 3.8;
        const rowH      = Math.max(maxLines * LH + 4, 12);

        checkY(rowH + 1);
        if (y === 15) drawHeader();

        // Row background
        const rowBg: [number,number,number] =
          st === 'non_compliant' ? [255, 242, 242] :
          st === 'compliant'     ? [240, 253, 247] :
          rowNum % 2 === 0       ? [250, 252, 251] : [255, 255, 255];
        doc.setFillColor(...rowBg);
        doc.rect(ML, y, CW, rowH, 'F');

        const top = y + 3; // text start y
        let x = ML + 1.5;

        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');

        // # row number
        doc.setTextColor(...muted);
        doc.text(String(rowNum), x, top);
        x += C.num;

        // Area — coloured initial badge (S / H / E)
        const areaClr: [number,number,number] =
          area === 'Safety'      ? [180, 50,  50] :
          area === 'Health'      ? [30,  100, 200] :
                                   [21,  130, 80];
        const areaBg: [number,number,number] =
          area === 'Safety'      ? [255, 235, 235] :
          area === 'Health'      ? [225, 235, 255] :
                                   [220, 245, 232];
        doc.setFillColor(...areaBg);
        doc.roundedRect(x, y + (rowH - 6) / 2, C.area - 1, 6, 1, 1, 'F');
        doc.setTextColor(...areaClr);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        doc.text(area[0], x + (C.area - 1) / 2, y + (rowH - 6) / 2 + 4.5, { align: 'center' });
        x += C.area;

        // Legal Reference
        doc.setTextColor(...dark);
        doc.setFont('helvetica', 'normal');
        doc.text(refLines, x, top);
        x += C.ref;

        // Requirement ← FIRST
        doc.setTextColor(...dark);
        doc.text(reqLines, x, top);
        x += C.req;

        // Compliance Measure ← SECOND
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
        const valLines = doc.splitTextToSize(valText, C.validation - 3);
        doc.text(valLines, x, top);
        doc.setFontSize(6);
        x += C.validation;

        // Owner
        doc.setTextColor(...dark);
        doc.setFont('helvetica', 'normal');
        const ownerLines = doc.splitTextToSize(
          li?.responsible_person ?? req.owner ?? '—', C.owner - 3
        );
        doc.text(ownerLines, x, top);
        x += C.owner;

        // Frequency
        doc.setTextColor(...muted);
        const freqLines2 = doc.splitTextToSize(
          li?.frequency ?? req.default_frequency ?? '—', C.freq - 3
        );
        doc.text(freqLines2, x, top);
        x += C.freq;

        // Due date
        doc.setTextColor(...dark);
        const dueLines = doc.splitTextToSize(
          li?.due_date ?? req.suggested_due_date ?? 'Continuous', C.due - 3
        );
        doc.text(dueLines, x, top);
        x += C.due;

        // Status pill
        const stClr: [number,number,number] =
          st === 'compliant'      ? brand :
          st === 'non_compliant'  ? red   : muted;
        const stLabel =
          st === 'compliant'      ? 'COMPLIANT'  :
          st === 'non_compliant'  ? 'NON-COMP.'  :
          st === 'not_applicable' ? 'N/A'        : 'PENDING';

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
      });
    });
  });

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setTextColor(...muted);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `EHS Compliance Portal · Legal Requirements Master List · Audit ID: ${audit.id}`,
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