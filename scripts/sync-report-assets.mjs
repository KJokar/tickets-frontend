import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

// Keep the API-hosted dashboard on the same PDF/calendar implementation as Next.js.
const root = resolve(import.meta.dirname, '..');
const target = resolve(root, '../ticketing/TicketingApi/wwwroot/lib/report-export');
await readFile(resolve(target, '../../../TicketingApi.csproj'));
const temporary = await mkdtemp(join(tmpdir(), 'ticketing-report-assets-'));
try {
  execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), 'src/lib/report-pdf.ts',
    '--target', 'ES2022', '--module', 'ES2022', '--moduleResolution', 'node', '--skipLibCheck', '--esModuleInterop', '--outDir', temporary], { cwd: root, stdio: 'inherit' });
  await mkdir(target, { recursive: true });
  const renderer = (await readFile(join(temporary, 'report-pdf.js'), 'utf8')).replace('import("pdf-lib")', 'import("./pdf-lib.esm.min.js")');
  await writeFile(join(target, 'report-pdf.js'), renderer);
  await copyFile(join(temporary, 'persian-date.js'), join(target, 'persian-date.js'));
  await copyFile(join(root, 'node_modules/pdf-lib/dist/pdf-lib.esm.min.js'), join(target, 'pdf-lib.esm.min.js'));
  await copyFile(join(root, 'node_modules/pdf-lib/LICENSE.md'), join(target, 'PDF-LIB-LICENSE.md'));
  console.log('Shared PDF and Persian date assets updated.');
} finally {
  if (dirname(resolve(temporary)) === resolve(tmpdir()) && basename(temporary).startsWith('ticketing-report-assets-'))
    await rm(temporary, { recursive: true, force: true });
}
