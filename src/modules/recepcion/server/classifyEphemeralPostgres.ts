import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { Client } from 'pg';

const POSTGRES_BIN = 'C:\\BioTime\\pgsql\\bin';
const INITDB = join(POSTGRES_BIN, 'initdb.exe');
const PG_CTL = join(POSTGRES_BIN, 'pg_ctl.exe');

export type EphemeralPg = {
  client: Client;
  port: number;
  dataDir: string;
  stop: () => void;
};

function run(command: string, args: string[], detachedServer = false) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    stdio: detachedServer ? 'ignore' : 'pipe',
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed (${result.status})\n${result.stdout}\n${result.stderr}`
    );
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate an ephemeral PostgreSQL port'));
        return;
      }
      const selected = address.port;
      server.close((error) => (error ? reject(error) : resolve(selected)));
    });
  });
}

export async function startEphemeralPostgres(prefix = 'C:\\tmp\\tc-erp-classify-'): Promise<EphemeralPg> {
  const dataDir = mkdtempSync(prefix);
  const port = await freePort();
  run(INITDB, ['-D', dataDir, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
  run(
    PG_CTL,
    ['-D', dataDir, '-l', join(dataDir, 'postgres.log'), '-o', `-F -p ${port} -h 127.0.0.1`, '-w', 'start'],
    true
  );
  const client = new Client({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres' });
  await client.connect();
  return {
    client,
    port,
    dataDir,
    stop: () => {
      void client.end();
      spawnSync(PG_CTL, ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      try {
        rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } catch {
        // En Windows el proceso de Postgres o el indexador puede demorar unos ms en soltar el lock; no debe fallar el test.
      }
    },
  };
}
