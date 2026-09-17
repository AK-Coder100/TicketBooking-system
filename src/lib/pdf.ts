import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

export async function generateTicketPdf({ ticket, order, event, tier, tenant }: any): Promise<Buffer> {
  return new Promise(async (resolve, reject) => {
    try {
      const qrBuffer = await QRCode.toBuffer(ticket.qr_secret_token, {
        errorCorrectionLevel: 'H',
        margin: 2,
        width: 260,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      });

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Ticket - ${ticket.id} - ${event.title}`,
          Author: tenant.name,
          Subject: 'Official Event E-Ticket'
        }
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });

      const primaryColor = '#4f46e5';
      const darkColor = '#0f172a';
      const textMuted = '#64748b';
      const borderCardColor = '#e2e8f0';

      const cardX = 40;
      const cardY = 50;
      const cardW = 515;
      const cardH = 680;

      // Outer Frame
      doc.roundedRect(cardX, cardY, cardW, cardH, 16)
         .lineWidth(2)
         .strokeColor(borderCardColor)
         .fillColor('#ffffff')
         .fillAndStroke();

      // Header Banner
      doc.save();
      doc.roundedRect(cardX, cardY, cardW, 110, 16).clip();
      doc.rect(cardX, cardY, cardW, 110).fillColor(primaryColor).fill();
      doc.restore();

      doc.fillColor('#ffffff')
         .fontSize(12)
         .font('Helvetica-Bold')
         .text(tenant.name.toUpperCase(), cardX + 24, cardY + 20, { characterSpacing: 1.5 });

      doc.fillColor('#ffffff')
         .fontSize(20)
         .font('Helvetica-Bold')
         .text(event.title, cardX + 24, cardY + 44, { width: cardW - 48, ellipsis: true });

      // Venue bar
      doc.rect(cardX, cardY + 110, cardW, 45).fillColor('#f8fafc').fill();

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('VENUE / LOCATION', cardX + 24, cardY + 120);
      doc.fillColor(darkColor).fontSize(11).font('Helvetica-Bold').text(event.location, cardX + 24, cardY + 132, { width: 280, ellipsis: true });

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('EVENT DATE', cardX + 330, cardY + 120);
      const eventDateStr = (tier.valid_date && tier.valid_date !== 'ALL_DAYS')
        ? tier.valid_date
        : new Date(event.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      doc.fillColor(primaryColor).fontSize(11).font('Helvetica-Bold').text(eventDateStr, cardX + 330, cardY + 132);

      // Attendee details
      const infoY = cardY + 175;
      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('ATTENDEE NAME', cardX + 24, infoY);
      doc.fillColor(darkColor).fontSize(16).font('Helvetica-Bold').text(ticket.attendee_name, cardX + 24, infoY + 14);

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('TICKET TIER', cardX + 24, infoY + 50);
      doc.fillColor(primaryColor).fontSize(13).font('Helvetica-Bold').text(tier.name, cardX + 24, infoY + 64);

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('AGE', cardX + 24, infoY + 95);
      doc.fillColor(darkColor).fontSize(12).font('Helvetica').text(`${ticket.attendee_age} years`, cardX + 24, infoY + 107);

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('TICKET ID', cardX + 130, infoY + 95);
      doc.fillColor(darkColor).fontSize(11).font('Helvetica-Bold').text(ticket.id, cardX + 130, infoY + 107);

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('BOOKING ORDER', cardX + 24, infoY + 135);
      doc.fillColor(darkColor).fontSize(10).font('Helvetica').text(order.id, cardX + 24, infoY + 147);

      doc.fillColor(textMuted).fontSize(9).font('Helvetica-Bold').text('PHONE (GUEST AUTH)', cardX + 130, infoY + 135);
      doc.fillColor(darkColor).fontSize(10).font('Helvetica').text(order.customer_phone, cardX + 130, infoY + 147);

      // Embedded QR Code
      const qrBoxX = cardX + 275;
      const qrBoxY = infoY - 5;
      const qrBoxSize = 205;

      doc.roundedRect(qrBoxX, qrBoxY, qrBoxSize, qrBoxSize + 35, 12)
         .lineWidth(1)
         .strokeColor('#cbd5e1')
         .fillColor('#ffffff')
         .fillAndStroke();

      doc.image(qrBuffer, qrBoxX + 10, qrBoxY + 10, { width: 185, height: 185 });

      doc.fillColor(primaryColor)
         .fontSize(8)
         .font('Helvetica-Bold')
         .text('SCAN AT ENTRY GATE', qrBoxX, qrBoxY + 205, { width: qrBoxSize, align: 'center' });

      doc.fillColor(textMuted)
         .fontSize(7)
         .font('Helvetica')
         .text('Cryptographically HMAC Signed', qrBoxX, qrBoxY + 218, { width: qrBoxSize, align: 'center' });

      // Perforated line
      const dividerY = cardY + 435;
      doc.save();
      doc.strokeColor('#cbd5e1')
         .lineWidth(1)
         .dash(4, { space: 4 })
         .moveTo(cardX + 10, dividerY)
         .lineTo(cardX + cardW - 10, dividerY)
         .stroke();
      doc.restore();

      // Policy instructions
      const bottomY = dividerY + 20;
      doc.fillColor(darkColor).fontSize(10).font('Helvetica-Bold').text('OFFICIAL ENTRY PASS & GATE POLICY', cardX + 24, bottomY);
      doc.fillColor(textMuted).fontSize(8).font('Helvetica');
      doc.text('1. Present this digital e-ticket or printed PDF at the designated entry scanner gate.', cardX + 24, bottomY + 18);
      doc.text('2. This ticket carries a high-entropy tamper-evident cryptographic signature.', cardX + 24, bottomY + 32);
      doc.text('3. Re-entry requires explicit organizer clearance via Gate Operations Scanner.', cardX + 24, bottomY + 46);

      // Footer
      doc.rect(cardX, cardY + cardH - 50, cardW, 50).fillColor('#0f172a').fill();
      doc.fillColor('#94a3b8')
         .fontSize(8)
         .font('Helvetica')
         .text(`ISSUED: ${new Date(ticket.created_at).toLocaleString('en-IN')} | GATEWAY: ${order.gateway_type}`, cardX + 24, cardY + cardH - 34);

      doc.fillColor('#38bdf8')
         .fontSize(8)
         .font('Helvetica-Bold')
         .text('POWERED BY MULTI-TENANT TICKETING PLATFORM', cardX + 24, cardY + cardH - 20);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
