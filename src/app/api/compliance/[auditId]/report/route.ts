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
    admin.from('legal_requirements').select('*').eq('active', true).overlaps('applies_to_sections', audit.sections),
    admin.from('audit_line_items').select('*').eq('audit_id', audit.id),
  ]);

  const reqs  = requirements ?? [];
  const items = lineItems ?? [];
  const itemMap: Record<string, any> = {};
  items.forEach((li: any) => { itemMap[`${li.requirement_id}::${li.section}`] = li; });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const applicable   = items.filter((i: any) => i.status !== 'not_applicable');
  const compliantCt  = applicable.filter((i: any) => i.status === 'compliant').length;
  const nonCompCt    = applicable.filter((i: any) => i.status === 'non_compliant').length;
  const score        = applicable.length > 0 ? Math.round((compliantCt / applicable.length) * 100) : 100;
  const sections     = audit.sections as string[];

  // ── PDF setup ─────────────────────────────────────────────────────────────
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W   = 297; // A4 landscape width
  const H   = 210;
  const ML  = 12;
  const MR  = 12;
  const CW  = W - ML - MR;
  let   y   = 15;

  const brand = [21, 179, 110]  as [number, number, number];
  const red   = [239, 68, 68]   as [number, number, number];
  const amber = [245, 158, 11]  as [number, number, number];
  const muted = [107, 127, 118] as [number, number, number];
  const dark  = [15, 31, 24]    as [number, number, number];
  const light = [248, 250, 249] as [number, number, number];

  function newPage() { doc.addPage(); y = 15; }
  function checkY(n = 8) { if (y + n > H - 15) newPage(); }

  // ── Cover ─────────────────────────────────────────────────────────────────
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 36, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('LEGAL COMPLIANCE AUDIT REPORT', ML, 14);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(audit.title, ML, 21);
  doc.text(
    `${audit.period ? audit.period + ' · ' : ''}Ibadan, Nigeria · Generated: ${new Date().toLocaleDateString('en-NG')}`,
    ML, 27
  );
  doc.text(`Auditor: ${(audit.auditor as any)?.full_name ?? '—'} · Sections: ${sections.join(', ')}`, ML, 33);

  // Score badge
  const scoreColor = score >= 80 ? brand : score >= 60 ? amber : red;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - MR - 40, 6, 40, 25, 3, 3, 'F');
  doc.setTextColor(...scoreColor);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text(`${score}%`, W - MR - 20, 20, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('OVERALL COMPLIANCE', W - MR - 20, 27, { align: 'center' });

  y = 44;

  // ── Summary row ───────────────────────────────────────────────────────────
  doc.setFillColor(...light);
  doc.roundedRect(ML, y, CW, 18, 2, 2, 'F');

  const summaryItems = [
    { label: 'Total Requirements', value: String(reqs.length) },
    { label: 'Compliant',          value: String(compliantCt),   color: brand },
    { label: 'Non-Compliant',      value: String(nonCompCt),     color: nonCompCt > 0 ? red : dark },
    { label: 'Not Applicable',     value: String(items.filter((i: any) => i.status === 'not_applicable').length) },
    { label: 'Not Assessed',       value: String(items.filter((i: any) => i.status === 'not_assessed').length) },
  ];

  summaryItems.forEach(({ label, value, color }, i) => {
    const x = ML + 5 + i * (CW / 5);
    doc.setTextColor(...(color ?? muted));
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y + 6);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(value, x, y + 14);
  });

  y += 24;

  // ── Master list table ─────────────────────────────────────────────────────
  // Column widths (landscape A4, CW = 273)
  const cols = {
    num:     8,
    area:    16,
    doc:     38,
    req:     62,
    measure: 50,
    finding: 42,
    verdict: 42,
    status:  15,
  };

  function drawTableHeader() {
    doc.setFillColor(...brand);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');

    let x = ML + 2;
    const headers = [
      ['#', cols.num], ['Area', cols.area], ['Legal Document / Section', cols.doc],
      ['Specific Requirement', cols.req], ['Compliance Measures', cols.measure],
      ['Inspector Finding', cols.finding], ['AI Verdict', cols.verdict], ['Status', cols.status],
    ];
    headers.forEach(([label, w]) => {
      doc.text(String(label), x, y + 5);
      x += Number(w);
    });
    y += 8;
  }

  drawTableHeader();

  let rowNum = 0;
  let prevArea = '';

  // Process all sections × areas × requirements
  sections.forEach(section => {
    // Section header
    checkY(10);
    doc.setFillColor(230, 240, 235);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setTextColor(...dark);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`SECTION: ${section.toUpperCase()}`, ML + 3, y + 5);
    y += 8;

    (['Safety', 'Health', 'Environment'] as const).forEach(area => {
      const areaReqs = reqs.filter((r: any) => r.area === area && r.applies_to_sections.includes(section));
      if (!areaReqs.length) return;

      areaReqs.forEach((req: any, i: number) => {
        rowNum++;
        const li  = itemMap[`${req.id}::${section}`];
        const st  = li?.status ?? 'not_assessed';

        // Row height based on content
        const rowH = 14;
        checkY(rowH + 2);
        if (y === 15) drawTableHeader(); // redraw after page break

        // Row background
        const rowBg: [number,number,number] = st === 'non_compliant' ? [255, 242, 242] :
                      st === 'compliant'     ? [240, 253, 247] :
                      rowNum % 2 === 0       ? [250, 252, 251] : [255, 255, 255];
        doc.setFillColor(...rowBg);
        doc.rect(ML, y, CW, rowH, 'F');

        doc.setTextColor(...dark);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');

        let x = ML + 2;

        // # 
        doc.text(String(rowNum), x, y + 5);
        x += cols.num;

        // Area badge
        const areaColor: [number,number,number] = area === 'Safety' ? [180,50,50] : area === 'Health' ? [30,100,200] : [21,130,80];
        doc.setTextColor(...areaColor);
        doc.setFont('helvetica', 'bold');
        doc.text(area, x, y + 5);
        x += cols.area;

        doc.setTextColor(...dark);
        doc.setFont('helvetica', 'normal');

        // Legal doc
        const docLines = doc.splitTextToSize(`${req.legal_document}\n${req.source_section}`, cols.doc - 2);
        doc.text(docLines.slice(0, 2), x, y + 4);
        x += cols.doc;

        // Requirement
        const reqLines = doc.splitTextToSize(req.specific_requirement, cols.req - 2);
        doc.text(reqLines.slice(0, 2), x, y + 4);
        x += cols.req;

        // Measures
        const measLines = doc.splitTextToSize(req.compliance_measures, cols.measure - 2);
        doc.text(measLines.slice(0, 2), x, y + 4);
        x += cols.measure;

        // Finding
        const findText = li?.inspector_notes ?? '—';
        const findLines = doc.splitTextToSize(findText, cols.finding - 2);
        doc.setTextColor(...muted);
        doc.setFont('helvetica', 'italic');
        doc.text(findLines.slice(0, 2), x, y + 4);
        x += cols.finding;

        // Verdict
        doc.setFont('helvetica', 'normal');
        const verdictText = li?.ai_verdict ?? '—';
        const verdLines   = doc.splitTextToSize(verdictText, cols.verdict - 2);
        doc.setTextColor(...dark);
        doc.text(verdLines.slice(0, 2), x, y + 4);
        x += cols.verdict;

        // Status pill
        const stColor: [number,number,number] = st === 'compliant' ? brand : st === 'non_compliant' ? red : muted;
        const stLabel = st === 'compliant' ? 'COMPLIANT' : st === 'non_compliant' ? 'NON-COMP.' : st === 'not_applicable' ? 'N/A' : 'PENDING';
        doc.setFillColor(...stColor);
        doc.roundedRect(x, y + 2, cols.status - 1, 8, 1, 1, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.text(stLabel, x + (cols.status - 1) / 2, y + 7, { align: 'center' });

        y += rowH;

        // Separator line
        doc.setDrawColor(230, 235, 232);
        doc.setLineWidth(0.2);
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
    doc.text(`EHS Compliance Portal · Legal Requirements Master List · Audit ID: ${audit.id}`, ML, H - 6);
    doc.text(`Page ${p} of ${pageCount}`, W - MR, H - 6, { align: 'right' });
    doc.setDrawColor(...brand);
    doc.setLineWidth(0.5);
    doc.line(ML, H - 9, W - MR, H - 9);
  }

  const buffer = Buffer.from(doc.output('arraybuffer'));
  const dateStr = new Date().toISOString().split('T')[0];

  return new NextResponse(buffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="Compliance-Report-${dateStr}.pdf"`,
    },
  });
}