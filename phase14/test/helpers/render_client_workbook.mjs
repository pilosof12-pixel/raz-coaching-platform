// Render the real client workbook the way the browser does, then read it back.
// A source-grep test proves a string is in the file; this proves a cell has a
// value, a fill and a hyperlink.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function renderParityWorkbook(program, intake, cwd = ROOT, logoPath = null) {
  let raw = null;
  const sandbox = { console, setTimeout, clearTimeout, Buffer, process, TextEncoder, TextDecoder };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  // JSZip feature-detects Blob by checking that a 0-byte blob has size 0, so the
  // stub needs a real size rather than being an empty shell.
  sandbox.Blob = class {
    constructor(parts, opts = {}) {
      this.parts = parts; this.type = opts.type || '';
      this.size = parts.reduce((n, p) => n + (p.byteLength ?? p.length ?? 0), 0);
      if (parts.length) raw = parts[0];
    }
  };
  sandbox.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  sandbox.document = {
    createElement: () => ({ click() {}, remove() {}, style: {}, setAttribute() {} }),
    body: { appendChild() {} },
  };
  sandbox.btoa = (b) => Buffer.from(b, 'binary').toString('base64');
  sandbox.fetch = async (url) => {
    if (String(url).includes('brand-logo.png') && logoPath && fs.existsSync(logoPath)) {
      const buf = fs.readFileSync(logoPath);
      return { ok: true, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    }
    return { ok: false };
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(`${cwd}/public/exceljs.lib.js`, 'utf8'), sandbox, { filename: 'exceljs.lib.js' });
  vm.runInContext(fs.readFileSync(`${cwd}/public/spreadsheet-parity.js`, 'utf8'), sandbox, { filename: 'spreadsheet-parity.js' });
  const rows = await sandbox.window.buildStrengthSpreadsheet(program, intake);
  // Re-open in the same realm: a Buffer made outside it fails JSZip's type check.
  const reopen = vm.runInContext(
    '(async (data) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(data); return wb; })',
    sandbox,
  );
  return { wb: await reopen(raw), rows };
}

export const cellText = (c) => {
  const v = c && c.value;
  if (v == null) return '';
  if (typeof v === 'object') return v.richText ? v.richText.map((t) => t.text).join('') : String(v.text || '');
  return String(v);
};
