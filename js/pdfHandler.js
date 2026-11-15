/**
 * Extração de texto de PDFs enviados pelo usuário.
 * Não envia o arquivo para servidor — processamento 100% client-side,
 * o que reforça a conformidade com LGPD (minimização).
 */
export async function extractPdfText(file) {
    if (!(file instanceof File)) throw new Error('Arquivo inválido.');
    if (file.type !== 'application/pdf') throw new Error('Apenas PDF é permitido.');
    if (file.size > 5 * 1024 * 1024) throw new Error('PDF maior que 5MB.');

    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let out = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {   // limite
        const page = await pdf.getPage(i);
        const txt = await page.getTextContent();
        out += txt.items.map(it => it.str).join(' ') + '\n';
    }
    // Nunca renderizar este texto via innerHTML
    return out.slice(0, 5000);
}