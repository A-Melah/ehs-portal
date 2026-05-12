import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import jsPDF from 'jspdf';

// Fetch image from URL and convert to base64 for jsPDF
async function fetchImageAsBase64(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const bytes  = Buffer.from(buffer);
    const b64    = bytes.toString('base64');
    const ct     = res.headers.get('content-type') ?? 'image/jpeg';
    const format = ct.includes('png') ? 'PNG' : 'JPEG';
    return { data: b64, format };
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ inspectionId: string }> }
) {
  const { inspectionId } = await params;
  const supabase = await createClient();

  // Auth check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch full inspection data
  const { data: inspection, error } = await supabase
    .from('inspections')
    .select(`
      *,
      asset:assets(name, tag_number, type, location),
      inspector:profiles(full_name, email),
      responses(
        *,
        question:checklist_templates(question_text, category, is_critical)
      )
    `)
    .eq('id', inspectionId)
    .single();

  if (error || !inspection) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }

  // ── Build PDF ───────────────────────────────────────────────────────────────
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W    = 210; // A4 width mm
  const ML   = 20; // margin left
  const MR   = 20; // margin right
  const CW   = W - ML - MR; // content width
  let   y    = 20;

  const brand   = [21, 179, 110] as [number, number, number];
  const danger  = [239, 68, 68]  as [number, number, number];
  const warn    = [245, 158, 11] as [number, number, number];
  const muted   = [107, 127, 118] as [number, number, number];
  const dark    = [15, 31, 24]  as [number, number, number];
  const light   = [248, 250, 249] as [number, number, number];

  function newPage() {
    doc.addPage();
    y = 20;
  }

  function checkY(needed = 10) {
    if (y + needed > 275) newPage();
  }

  // ── Cover header ────────────────────────────────────────────────────────────
  doc.setFillColor(...brand);
  doc.rect(0, 0, W, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('EHS COMPLIANCE AUDIT REPORT', ML, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('AI-Powered Environment, Health & Safety Portal', ML, 26);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`, ML, 33);

  // Score badge top-right
  const score      = Math.round(inspection.compliance_score ?? 0);
  const scoreColor = score >= 80 ? brand : score >= 60 ? warn : danger;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(W - ML - 30, 8, 30, 24, 3, 3, 'F');
  doc.setTextColor(...scoreColor);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${score}%`, W - ML - 15, 22, { align: 'center' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('COMPLIANCE', W - ML - 15, 28, { align: 'center' });

  y = 50;

  // ── Asset info card ──────────────────────────────────────────────────────────
  doc.setFillColor(...light);
  doc.roundedRect(ML, y, CW, 36, 3, 3, 'F');
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.5);
  doc.roundedRect(ML, y, CW, 36, 3, 3, 'S');

  doc.setTextColor(...dark);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text((inspection.asset as any)?.name ?? 'Unknown Asset', ML + 5, y + 9);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...muted);

  const infoItems = [
    ['Asset Type',   (inspection.asset as any)?.type ?? '—'],
    ['Tag Number',   (inspection.asset as any)?.tag_number ?? '—'],
    ['Location',     (inspection.asset as any)?.location ?? '—'],
    ['Inspector',    (inspection.inspector as any)?.full_name ?? '—'],
    ['Date',         new Date(inspection.created_at).toLocaleDateString('en-NG')],
    ['Status',       inspection.status.toUpperCase()],
  ];

  infoItems.forEach(([label, value], i) => {
    const col = i < 3 ? ML + 5 : ML + CW / 2;
    const row = y + 16 + (i % 3) * 7;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...muted);
    doc.text(`${label}:`, col, row);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...dark);
    doc.text(value, col + 22, row);
  });

  y += 44;

  // ── Responses ────────────────────────────────────────────────────────────────
  doc.setTextColor(...dark);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('INSPECTION RESPONSES', ML, y);
  y += 6;
  doc.setDrawColor(...brand);
  doc.setLineWidth(0.8);
  doc.line(ML, y, ML + CW, y);
  y += 6;

  const responses = (inspection.responses as any[]) ?? [];

  for (let idx = 0; idx < responses.length; idx++) {
    const resp     = responses[idx];
    const passed   = resp.value;
    const question = resp.question?.question_text ?? '—';
    const category = resp.question?.category ?? '';
    const critical = resp.question?.is_critical;
    const mediaUrl = resp.media_url;

    // Fetch image if present
    let imgData: { data: string; format: string } | null = null;
    if (mediaUrl) {
      imgData = await fetchImageAsBase64(mediaUrl);
    }

    const imgH  = imgData ? 42 : 0;
    const rowH  = 14 + imgH;
    checkY(rowH + 4);

    // Row background
    doc.setFillColor(passed ? 240 : 254, passed ? 253 : 242, passed ? 244 : 242);
    doc.roundedRect(ML, y, CW, rowH, 2, 2, 'F');

    // Pass/fail pill
    doc.setFillColor(...(passed ? brand : danger));
    doc.roundedRect(ML + CW - 18, y + (rowH - 7) / 2, 16, 7, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text(passed ? 'YES' : 'NO', ML + CW - 10, y + (rowH - 7) / 2 + 5, { align: 'center' });

    // Index
    doc.setTextColor(...muted);
    doc.setFontSize(8);
    doc.text(`${idx + 1}`, ML + 4, y + 6);

    // Question text
    doc.setTextColor(...dark);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const wrapped = doc.splitTextToSize(question, CW - 40);
    doc.text(wrapped[0], ML + 10, y + 6);

    // Critical indicator only
    if (critical) {
      doc.setTextColor(...danger);
      doc.setFontSize(7);
      doc.text('Critical', ML + 10, y + 11);
    }

    // Evidence image
    if (imgData) {
      try {
        doc.addImage(imgData.data, imgData.format, ML + 10, y + 15, 40, 36);
      } catch { /* skip if image fails */ }
    }

    y += rowH + 2;
  }

  // ── Summary footer ──────────────────────────────────────────────────────────
  checkY(30);
  y += 6;

  const passed   = responses.filter(r => r.value).length;
  const failed   = responses.length - passed;
  const critical = responses.filter(r => r.ai_breach_level === 'critical').length;

  doc.setFillColor(...light);
  doc.roundedRect(ML, y, CW, 24, 3, 3, 'F');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...dark);
  doc.text('SUMMARY', ML + 5, y + 8);

  const summaryItems = [
    { label: 'Total Checks', value: String(responses.length), color: dark },
    { label: 'Yes',       value: String(passed),           color: brand },
    { label: 'No',       value: String(failed),           color: danger },
    { label: 'Critical Breaches', value: String(critical),   color: danger },
    { label: 'Compliance Score',  value: `${score}%`,         color: scoreColor },
  ];

  summaryItems.forEach(({ label, value, color }, i) => {
    const x = ML + 5 + i * (CW / 5);
    doc.setTextColor(...muted);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(label, x, y + 16);
    doc.setTextColor(...color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(value, x, y + 22);
  });

  y += 32;

  // ── Footer ──────────────────────────────────────────────────────────────────
  doc.setTextColor(...muted);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(`EHS Compliance Portal · Report ID: ${inspection.id}`, ML, 287);
  doc.text('This report was generated automatically by the AI-Powered EHS Compliance system.', ML, 291);

  // ── Return PDF ───────────────────────────────────────────────────────────────
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
  const assetName = (inspection.asset as any)?.tag_number ?? 'report';
  const dateStr   = new Date().toISOString().split('T')[0];

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="EHS-Audit-${assetName}-${dateStr}.pdf"`,
    },
  });
}