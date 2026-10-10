// Route each uploaded file to the right parser.
import { Dataset } from '../model.js';
import { parseCsvFile } from './csv.js';
import { parseGpx } from './gpx.js';
import { parseFit } from './fit.js';
import { parseGarminZip } from './garmin-zip.js';

const readText = (f) => (f.text ? f.text() : new Response(f).text());
const readBuf = (f) => (f.arrayBuffer ? f.arrayBuffer() : new Response(f).arrayBuffer());

// files: File objects or {name, text} objects (demo data)
export async function parseFiles(files, log = () => {}, opts = {}) {
  const ds = new Dataset();
  ds.unitPref = opts.units || 'auto';
  for (const f of files) {
    const name = f.name; const lower = name.toLowerCase();
    log(`Reading ${name}…`);
    try {
      let r;
      if (typeof f.text === 'string') r = parseCsvFile(f.text, name, ds);
      else if (lower.endsWith('.zip')) { const z = await parseGarminZip(await readBuf(f), name, ds, log); r = { kind: 'ZIP archive', rows: z.used, note: `${z.entries} files inside, ${z.used} used` }; if (!z.used) r.skipped = 'No supported Garmin files found inside'; }
      else if (lower.endsWith('.csv')) r = parseCsvFile(await readText(f), name, ds);
      else if (lower.endsWith('.gpx')) r = parseGpx(await readText(f), name, ds);
      else if (lower.endsWith('.fit')) r = await parseFit(await readBuf(f), name, ds);
      else if (lower.endsWith('.json')) { // a single JSON file from an unzipped export
        const zipLike = new window.JSZip(); zipLike.file(name, await readText(f));
        const z = await parseGarminZip(await zipLike.generateAsync({ type: 'arraybuffer' }), name, ds, log);
        r = { kind: 'Garmin export JSON', rows: z.used }; if (!z.used) r.skipped = 'No recognised fields';
      } else r = { kind: 'Unknown', skipped: 'Unsupported file type' };
      ds.files.push({ name, ...r });
    } catch (e) {
      ds.files.push({ name, kind: 'Error', skipped: e.message });
    }
  }
  if (ds.relativeDays && ds.datedDays) ds.warnings.push('Some files use relative day numbers (sample format) and others use calendar dates; they cannot be lined up, so results may mix periods.');
  return ds;
}
