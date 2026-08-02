// js/parsers.js
//
// Converts an uploaded file into plain text, regardless of its format.
// Relies on mammoth.js and pdf.js, both loaded as global scripts from
// index.html (from a CDN, so this needs an internet connection).

export async function extractText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return extractFromDocx(file);
  if (name.endsWith('.pdf')) return extractFromPdf(file);
  if (name.endsWith('.txt')) return file.text();
  throw new Error('Unsupported file type. Use .docx, .pdf, or .txt.');
}

async function extractFromDocx(file) {
  if (!window.mammoth) throw new Error('Document reader is not loaded (no internet on first use?).');
  const arrayBuffer = await file.arrayBuffer();
  const result = await window.mammoth.extractRawText({ arrayBuffer });
  return result.value || '';
}

async function extractFromPdf(file) {
  if (!window.pdfjsLib) throw new Error('PDF reader is not loaded (no internet on first use?).');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text;
}
