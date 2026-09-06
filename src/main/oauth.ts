import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { shell } from 'electron';

const HOST = '127.0.0.1';
const PORT = 47831;
export const OAUTH_CALLBACK_URL = `http://${HOST}:${PORT}/oauth/callback`;

export async function runImplicitOAuth(clientId: string): Promise<string> {
  const trimmedClientId = clientId.trim();
  if (!trimmedClientId) throw new Error('CASPULSEのOAuth設定を取得できませんでした。');

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
      else reject(new Error('アクセストークンを受け取れませんでした。'));
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
<title>CASPULSE</title>
<style>
body{font-family:ui-sans-serif,system-ui;background:#0d1230;color:#f7fbff;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#17204a;border:1px solid #6adff2;border-radius:20px;padding:28px;box-shadow:0 24px 80px rgba(0,0,0,.45);max-width:520px}
h1{margin:0 0 10px}.muted{color:#9fb0d0;font-size:14px;line-height:1.6}
</style>
</head>
<body><main><h1>CASPULSE</h1><p id="status">ツイキャス連携を確認しています…</p><p class="muted">完了したら、このタブを閉じてCASPULSEへ戻ってください。</p></main>
<script>
(async()=>{
  const params=new URLSearchParams(location.hash.slice(1));
  const payload={token:params.get('access_token'),state:params.get('state'),denied:params.get('result')==='denied'};
  const status=document.getElementById('status');
  try{
    const response=await fetch('/oauth/token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    status.textContent=response.ok?'連携しました。CASPULSEへ戻ってください。':'認証情報を確認できませんでした。';
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
              finish(new Error('ツイキャス連携をキャンセルしました。'));
              return;
            }
            if (!body.token || body.state !== state) {
              res.writeHead(400).end('invalid oauth response');
              finish(new Error('OAuth stateの確認に失敗しました。'));
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
      finish(new Error(`ツイキャス連携がタイムアウトしました。Callback URL: ${OAUTH_CALLBACK_URL}`));
    }, 180_000);
  });
}
