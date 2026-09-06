import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { shell } from 'electron';

const HOST = '127.0.0.1';
const PORT = 47831;
export const OAUTH_CALLBACK_URL = `http://${HOST}:${PORT}/oauth/callback`;

export async function runImplicitOAuth(clientId: string): Promise<string> {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) throw new Error('Client IDを入力してください。');

  const state = randomBytes(24).toString('hex');
  let timeout: NodeJS.Timeout | undefined;

  return new Promise<string>((resolve, reject) => {
    let settled = false;

    const finish = (error?: Error, token?: string) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      server.close();
      if (error) reject(error);
      else if (token) resolve(token);
      else reject(new Error('OAuthからアクセストークンが返りませんでした。'));
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', OAUTH_CALLBACK_URL);

      if (req.method === 'GET' && url.pathname === '/oauth/callback') {
        const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src http://${HOST}:${PORT};">
<title>CASPULSE OAuth</title>
<style>
body{font-family:ui-sans-serif,system-ui;background:#f6f2ff;color:#211e33;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:white;border:2px solid #211e33;border-radius:24px;padding:32px;box-shadow:9px 9px 0 #bff4f8;max-width:520px}h1{margin:0 0 12px}.muted{color:#77718a}
</style>
</head>
<body><main><h1>CASPULSE</h1><p id="status">TwitCasting認証をCASPULSEへ渡しています…</p><p class="muted">完了後、このタブを閉じてアプリへ戻ってください。</p></main>
<script>
(async()=>{
  const params=new URLSearchParams(location.hash.slice(1));
  const payload={token:params.get('access_token'),state:params.get('state'),denied:params.get('result')==='denied'};
  const status=document.getElementById('status');
  try{
    const response=await fetch('/oauth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    status.textContent=response.ok?'連携完了。CASPULSEへ戻ってください。':'認証情報を確認できませんでした。';
  }catch{status.textContent='CASPULSEへ認証情報を渡せませんでした。';}
})();
</script></body></html>`;
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(html);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/oauth/token') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
              token?: string | null;
              state?: string | null;
              denied?: boolean;
            };
            if (body.denied) {
              res.writeHead(200).end('ok');
              finish(new Error('TwitCasting連携がキャンセルされました。'));
              return;
            }
            if (!body.token || body.state !== state) {
              res.writeHead(400).end('invalid oauth response');
              finish(new Error('OAuth state検証に失敗しました。'));
              return;
            }
            res.writeHead(200).end('ok');
            finish(undefined, body.token);
          } catch (error) {
            res.writeHead(400).end('invalid body');
            finish(error instanceof Error ? error : new Error('Invalid OAuth response.'));
          }
        });
        return;
      }

      res.writeHead(404).end('not found');
    });

    server.once('error', (error) => finish(error));
    server.listen(PORT, HOST, async () => {
      const authUrl = new URL('https://apiv2.twitcasting.tv/oauth2/authorize');
      authUrl.searchParams.set('client_id', trimmedClientId);
      authUrl.searchParams.set('response_type', 'token');
      authUrl.searchParams.set('state', state);
      try {
        await shell.openExternal(authUrl.toString());
      } catch (error) {
        finish(error instanceof Error ? error : new Error('ブラウザを開けませんでした。'));
      }
    });

    timeout = setTimeout(() => {
      finish(new Error(`OAuthがタイムアウトしました。Callback URL: ${OAUTH_CALLBACK_URL}`));
    }, 180_000);
  });
}
