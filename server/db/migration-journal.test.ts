import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readMigrationFiles } from 'drizzle-orm/migrator';

it('registers every incremental SQL file in the production migration journal', () => {
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8')) as { entries: {idx:number;when:number;tag:string}[] };
  const files=readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort();
  expect(journal.entries.map(entry=>`${entry.tag}.sql`).sort()).toEqual(files);
  expect(new Set(journal.entries.map(entry=>entry.tag)).size).toBe(files.length);
  journal.entries.forEach((entry,index)=>{
    expect(entry.idx).toBe(index);
    if(index) expect(entry.when).toBeGreaterThan(journal.entries[index-1].when);
  });
  expect(readMigrationFiles({migrationsFolder:'drizzle'})).toHaveLength(files.length);
});
