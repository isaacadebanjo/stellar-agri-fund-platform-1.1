import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

/**
 * Generate investor statement PDF
 * @param {Object} investor - Investor document
 * @param {Object} wallet - Wallet document
 * @param {Array} investmentTxs - Investment transactions
 * @param {Array} distributions - Distributions for this investor
 * @param {Array} projects - Projects the investor is in
 * @returns {Promise<Buffer>} PDF buffer
 */
export async function generateInvestorStatementPDF({
  investor,
  wallet,
  investmentTxs = [],
  distributions = [],
  projects = []
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        bufferPages: true
      });

      // Collect PDF data in buffer
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ===== HEADER SECTION =====
      const headerY = doc.y;
      
      // Title
      doc.fontSize(24).font('Helvetica-Bold').text('Agri Funds Tracker', 50, headerY);
      doc.fontSize(10).font('Helvetica').text('Investor Statement', 50, headerY + 30);
      
      // Generated timestamp
      const now = new Date();
      doc.fontSize(9).text(
        `Generated: ${now.toLocaleString()}`,
        50,
        headerY + 50,
        { align: 'right', width: 500 }
      );

      doc.moveTo(50, headerY + 70).lineTo(550, headerY + 70).stroke();
      doc.moveDown(1);

      // ===== INVESTOR PROFILE SECTION =====
      doc.fontSize(12).font('Helvetica-Bold').text('Investor Profile', { underline: false });
      doc.fontSize(10).font('Helvetica');

      const profileData = [
        { label: 'Name', value: investor.name || 'N/A' },
        { label: 'Email', value: investor.email || 'N/A' },
        { label: 'Investor ID', value: investor._id?.toString()?.slice(0, 12) + '...' || 'N/A' },
        { label: 'Member Since', value: investor.createdAt ? new Date(investor.createdAt).toLocaleDateString() : 'N/A' }
      ];

      let currentY = doc.y + 5;
      profileData.forEach(item => {
        doc.fontSize(9).text(`${item.label}:`, 60, currentY);
        doc.fontSize(9).text(item.value, 180, currentY);
        currentY += 16;
      });

      doc.moveDown(0.5);

      // ===== WALLET SECTION =====
      doc.fontSize(12).font('Helvetica-Bold').text('Wallet Information');
      doc.fontSize(10).font('Helvetica');

      const walletData = [
        { label: 'Wallet Address', value: wallet?.publicKey ? wallet.publicKey.slice(0, 20) + '...' : 'N/A' },
        { label: 'Current Balance', value: `${wallet?.balance || 0} XLM` },
        { label: 'Wallet Type', value: wallet?.type || 'N/A' }
      ];

      currentY = doc.y + 5;
      walletData.forEach(item => {
        doc.fontSize(9).text(`${item.label}:`, 60, currentY);
        doc.fontSize(9).text(item.value, 180, currentY);
        currentY += 16;
      });

      doc.moveDown(0.5);

      // ===== PORTFOLIO SUMMARY =====
      const totalInvested = investmentTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const totalReturns = distributions.reduce((sum, d) => sum + (d.amount || 0), 0);
      const paidReturns = distributions.filter(d => d.status === 'paid').reduce((sum, d) => sum + d.amount, 0);
      const pendingReturns = totalReturns - paidReturns;
      const roi = totalInvested > 0 ? ((totalReturns / totalInvested) * 100).toFixed(2) : 0;

      doc.fontSize(12).font('Helvetica-Bold').text('Portfolio Summary');
      doc.fontSize(9).font('Helvetica');

      // Summary cards in 2x2 grid
      const cardWidth = 200;
      const cardHeight = 50;
      const cardX1 = 60;
      const cardX2 = 280;
      const cardY = doc.y + 10;

      const summaryCards = [
        { label: 'Total Invested', value: `${totalInvested.toFixed(2)} XLM`, x: cardX1, y: cardY },
        { label: 'Total Returns', value: `${totalReturns.toFixed(2)} XLM`, x: cardX2, y: cardY },
        { label: 'Paid Out', value: `${paidReturns.toFixed(2)} XLM`, x: cardX1, y: cardY + 60 },
        { label: 'Pending', value: `${pendingReturns.toFixed(2)} XLM`, x: cardX2, y: cardY + 60 },
        { label: 'ROI', value: `${roi}%`, x: cardX1, y: cardY + 120 },
        { label: 'Active Projects', value: `${projects.length}`, x: cardX2, y: cardY + 120 }
      ];

      summaryCards.forEach(card => {
        doc.rect(card.x, card.y, cardWidth, cardHeight).stroke();
        doc.fontSize(8).text(card.label, card.x + 8, card.y + 8, { width: cardWidth - 16 });
        doc.fontSize(11).font('Helvetica-Bold').text(card.value, card.x + 8, card.y + 20, { width: cardWidth - 16 });
        doc.font('Helvetica');
      });

      doc.moveDown(11);

      // ===== ACTIVE PROJECTS =====
      if (projects.length > 0) {
        doc.fontSize(12).font('Helvetica-Bold').text('Active Projects');
        doc.fontSize(9).font('Helvetica');

        const projectLines = projects.slice(0, 5).map(p => ({
          name: p.name || 'N/A',
          status: p.status || 'active',
          invested: distributions.filter(d => d.projectId?.toString() === p._id?.toString()).reduce((s, d) => s + d.amount, 0)
        }));

        projectLines.forEach((proj, idx) => {
          currentY = doc.y + (idx * 16);
          doc.text(`• ${proj.name}`, 60, currentY);
          doc.text(`(${proj.status})`, 200, currentY);
          doc.text(`${proj.invested.toFixed(2)} XLM`, 320, currentY);
        });

        doc.moveDown(Math.max(1, projectLines.length * 0.8));
      }

      // ===== INVESTMENT HISTORY =====
      if (investmentTxs.length > 0) {
        doc.addPage();
        doc.fontSize(12).font('Helvetica-Bold').text('Investment History');
        doc.fontSize(9).font('Helvetica');

        // Table header
        currentY = doc.y + 8;
        doc.rect(50, currentY - 3, 500, 18).fill('#f0f0f0');
        doc.fillColor('black');
        
        doc.text('Date', 60, currentY);
        doc.text('Amount', 180, currentY);
        doc.text('Status', 280, currentY);
        doc.text('Tx Hash', 360, currentY);

        currentY += 20;
        doc.moveTo(50, currentY - 2).lineTo(550, currentY - 2).stroke();

        // Table rows
        const maxRows = 15; // Prevent overflow
        const rows = investmentTxs.slice(0, maxRows);
        
        rows.forEach(tx => {
          const txDate = tx.timestamp ? new Date(tx.timestamp).toLocaleDateString() : 'N/A';
          const txHash = tx.txHash ? tx.txHash.slice(0, 8) + '...' : 'internal';
          
          doc.fontSize(8).text(txDate, 60, currentY);
          doc.text(`${tx.amount || 0} XLM`, 180, currentY);
          doc.text(tx.status || 'pending', 280, currentY);
          doc.text(txHash, 360, currentY);
          
          currentY += 16;
          
          // Paginate if needed
          if (currentY > 700) {
            doc.addPage();
            currentY = 60;
            doc.rect(50, currentY - 3, 500, 18).fill('#f0f0f0');
            doc.fillColor('black');
            doc.text('Date', 60, currentY);
            doc.text('Amount', 180, currentY);
            doc.text('Status', 280, currentY);
            doc.text('Tx Hash', 360, currentY);
            currentY += 20;
            doc.moveTo(50, currentY - 2).lineTo(550, currentY - 2).stroke();
          }
        });

        if (investmentTxs.length > maxRows) {
          doc.fontSize(8).text(`... and ${investmentTxs.length - maxRows} more transactions`, 60, currentY + 10);
        }
      }

      // ===== DISTRIBUTIONS HISTORY =====
      if (distributions.length > 0) {
        doc.addPage();
        doc.fontSize(12).font('Helvetica-Bold').text('Distributions Received');
        doc.fontSize(9).font('Helvetica');

        // Table header
        currentY = doc.y + 8;
        doc.rect(50, currentY - 3, 500, 18).fill('#f0f0f0');
        doc.fillColor('black');
        
        doc.text('Date', 60, currentY);
        doc.text('Amount', 150, currentY);
        doc.text('Project', 230, currentY);
        doc.text('Status', 400, currentY);

        currentY += 20;
        doc.moveTo(50, currentY - 2).lineTo(550, currentY - 2).stroke();

        // Table rows
        const distRows = distributions.slice(0, 20); // Limit to 20 distributions
        
        distRows.forEach(dist => {
          const distDate = dist.timestamp ? new Date(dist.timestamp).toLocaleDateString() : 'N/A';
          const projName = projects.find(p => p._id?.toString() === dist.projectId?.toString())?.name || 'Unknown';
          
          doc.fontSize(8).text(distDate, 60, currentY);
          doc.text(`${dist.amount || 0} XLM`, 150, currentY);
          doc.text(projName.slice(0, 20), 230, currentY);
          doc.text(dist.status || 'pending', 400, currentY);
          
          currentY += 16;
          
          // Paginate if needed
          if (currentY > 700) {
            doc.addPage();
            currentY = 60;
            doc.rect(50, currentY - 3, 500, 18).fill('#f0f0f0');
            doc.fillColor('black');
            doc.text('Date', 60, currentY);
            doc.text('Amount', 150, currentY);
            doc.text('Project', 230, currentY);
            doc.text('Status', 400, currentY);
            currentY += 20;
            doc.moveTo(50, currentY - 2).lineTo(550, currentY - 2).stroke();
          }
        });

        if (distributions.length > 20) {
          doc.fontSize(8).text(`... and ${distributions.length - 20} more distributions`, 60, currentY + 10);
        }
      }

      // ===== FOOTER ON ALL PAGES =====
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pageCount} | Agri Funds Tracker | ${investor.name} | Statement generated ${now.toLocaleString()}`,
          50,
          750,
          { align: 'center', width: 500 }
        );
      }

      // Finalize PDF
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
