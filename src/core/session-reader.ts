import * as fs from 'fs';

export async function readSessionText(session: string): Promise<string> {
  if (session === '-') {
    return readStdin();
  }
  if (fs.existsSync(session)) {
    return fs.readFileSync(session, 'utf-8');
  }
  return session;
}

function readStdin(timeoutMs: number = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    const timeoutId = setTimeout(() => {
      reject(new Error('Stdin read timeout after 30 seconds'));
    }, timeoutMs);

    process.stdin.on('data', (chunk: Buffer | string) => {
      data += typeof chunk === 'string' ? chunk : chunk.toString();
    });
    process.stdin.on('end', () => {
      clearTimeout(timeoutId);
      resolve(data);
    });
    process.stdin.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}
