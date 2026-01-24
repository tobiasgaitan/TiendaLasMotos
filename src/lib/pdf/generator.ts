import { Moto } from "@/types";
import { QuoteResult } from "@/lib/utils/calculator";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getNextQuoteNumber } from "@/lib/actions/quotation";

interface QuoteData {
    moto: Moto;
    quoteResult: QuoteResult;
    customerName: string;
    customerPhone: string;
    isCredit: boolean;
    months: number;
    downPayment: number;
    discount?: number; // Only for Cash mode
}

export async function generateQuotationPDF(data: QuoteData) {
    const { moto, quoteResult: quote, customerName, customerPhone, isCredit, months, downPayment, discount } = data;

    // 1. Get Consecutive ID
    let quoteId = "COT-PENDING";
    try {
        quoteId = await getNextQuoteNumber();
    } catch (e) {
        console.error("Failed to get quote ID", e);
        quoteId = `COT-${new Date().getFullYear()}-XXXX`;
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;

    // --- HEADER ---
    // Logos (Placeholders if images not available)
    doc.setFontSize(22);
    doc.setTextColor(0, 56, 147); // Brand Blue
    doc.text("Tienda Las Motos", marginX, 20);

    doc.setFontSize(16);
    doc.setTextColor(100);
    doc.text("AUTECO", pageWidth - 40, 20, { align: 'right' });

    // Quote Info
    doc.setFontSize(10);
    doc.setTextColor(50);
    doc.text(`Cotización #${quoteId}`, marginX, 30);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, marginX, 35);

    // Line separator
    doc.setLineWidth(0.5);
    doc.setDrawColor(200);
    doc.line(marginX, 38, pageWidth - marginX, 38);

    // --- CUSTOMER & PRODUCT INFO ---
    let yPos = 45;

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DEL CLIENTE", marginX, yPos);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nombre: ${customerName}`, marginX, yPos + 6);
    doc.text(`Contacto: ${customerPhone}`, marginX, yPos + 12);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("VEHÍCULO", pageWidth / 2, yPos);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Marca: ${moto.marca.toUpperCase()}`, pageWidth / 2, yPos + 6);
    doc.text(`Referencia: ${moto.referencia.toUpperCase()}`, pageWidth / 2, yPos + 12);
    doc.text(`Cilindraje: ${moto.displacement || 'N/A'} CC`, pageWidth / 2, yPos + 18);

    // Image (if available)
    if (moto.imagen_url) {
        try {
            // Provide visual box if image loading fails or as placeholder area logic
            // Ideally we fetch the image. For PDF generation in browser, we need base64 or ensuring CORS.
            // Leaving out complex image fetching for this step to ensure robustness, 
            // can be added if 'imagen_url' is guaranteed to be CORS-friendly.
        } catch (e) {
            console.warn("Could not add image to PDF", e);
        }
    }

    // --- FINANCIAL DETAILS TABLE ---
    yPos = 70;

    const tableBody: any[] = [];

    // Common Rows
    tableBody.push(["Precio de Lista", `$ ${moto.precio.toLocaleString()}`]);

    if (!isCredit && discount && discount > 0) {
        tableBody.push([{ content: "Descuento Especial", styles: { textColor: [220, 0, 0] } }, `-$ ${discount.toLocaleString()}`]);
    }

    // Trámites
    const docsLabel = isCredit ? "Matrícula + SOAT + Trámites (Crédito)" : "Matrícula + SOAT + Trámites (Contado)";
    // Ensure we use the correct logic for value. In Cash mode, use the calculated value.
    // NOTE: QuoteResult usually comes from calculator which might have used Credit logic.
    // If Cash mode, we expect `quote.registrationPrice` to reflect Cash column IF the calculator was called correctly.
    // In SmartQuotaSlider, we will ensure we pass the correct params.
    tableBody.push([docsLabel, `$ ${(quote.registrationPrice + (quote.documentationFee || 0)).toLocaleString()}`]);

    if (isCredit) {
        if ((quote.fngCost || 0) > 0) {
            tableBody.push(["Fondo Nacional de Garantías (FNG)", `$ ${(quote.fngCost || 0).toLocaleString()}`]);
        }
        if ((quote.vCobertura || 0) > 0) {
            tableBody.push(["Cobertura / Otros", `$ ${(quote.vCobertura || 0).toLocaleString()}`]);
        }
    }

    // TOTALS ROW
    tableBody.push([
        { content: isCredit ? "VALOR TOTAL A FINANCIAR (Capital)" : "TOTAL A PAGAR", styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
        { content: `$ ${isCredit ? quote.loanAmount.toLocaleString() : quote.total.toLocaleString()}`, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    ]);

    // Financing Specifics
    if (isCredit) {
        tableBody.push(
            ["", ""], // Spacer
            [{ content: "DETALLES DE FINANCIACIÓN", colSpan: 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [200, 220, 255] } }],
            ["Entidad Financierra", quote.financialEntity || "N/A"],
            ["Cuota Inicial", `$ ${downPayment.toLocaleString()}`],
            ["Plazo", `${months} Meses`],
            ["Tasa Mensual (Aprox)", `${quote.interestRate}%`],
            ["Seguro de Vida (Mensual)", `$ ${(quote.lifeInsuranceValue || 0).toLocaleString()}`]
        );

        if ((quote.unemploymentInsuranceCost || 0) > 0) {
            tableBody.push(["Seguro Desempleo (Mensual)", `$ ${(quote.unemploymentInsuranceCost || 0).toLocaleString()}`]);
        }

        const daily = Math.round((quote.monthlyPayment || 0) / 30);

        tableBody.push(
            [{ content: "CUOTA MENSUAL ESTIMADA", styles: { fontStyle: 'bold', textColor: [0, 56, 147] } },
            { content: `$ ${quote.monthlyPayment?.toLocaleString()}`, styles: { fontStyle: 'bold', fontSize: 12 } }],

            [{ content: "CUOTA DIARIA APROX.", styles: { fontStyle: 'italic' } },
            `$ ${daily.toLocaleString()}`]
        );
    }

    autoTable(doc, {
        startY: yPos,
        head: [['Concepto', 'Valor']],
        body: tableBody,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [0, 56, 147] },
        columnStyles: {
            0: { cellWidth: 120 },
            1: { cellWidth: 'auto', halign: 'right' }
        }
    });

    // --- FOOTER ---
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(100);
    const disclaimer = "Precios y promociones sujetos a cambios sin previo aviso según políticas de AUTECO y disponibilidad de SOAT. Esta cotización tiene una validez de 3 días calendario.";

    // Split text to fit
    const splitDisclaimer = doc.splitTextToSize(disclaimer, pageWidth - (marginX * 2));
    doc.text(splitDisclaimer, marginX, pageHeight - 20);

    // Marketing
    doc.setTextColor(0, 56, 147);
    doc.setFont("helvetica", "bold");
    doc.text("www.tiendalasmotos.com", pageWidth - marginX, pageHeight - 10, { align: 'right' });

    // Save
    doc.save(`Cotizacion_${quoteId}.pdf`);
}
