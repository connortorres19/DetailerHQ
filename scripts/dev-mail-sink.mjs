#!/usr/bin/env node
// Dev-only stand-in for Mailpit, for machines that can't pull the Mailpit image.
// Accepts SMTP on :2525 (no auth checks, no TLS, nothing is relayed) and keeps messages in memory.
// Read them with:  GET http://127.0.0.1:54330/messages      DELETE clears them.
//
// To use it, point Supabase at it in a local, uncommitted config:
//   [local_smtp] enabled = false
//   [auth.email.smtp] enabled = true, host = "<docker gateway IP>", port = 2525, user/pass = anything
import net from 'node:net';
import http from 'node:http';

const SMTP_PORT = Number(process.env.SINK_SMTP_PORT ?? 2525);
const HTTP_PORT = Number(process.env.SINK_HTTP_PORT ?? 54330);
const messages = [];

function decodeQuotedPrintable(text) {
  return text
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function parse(raw, envelope) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  let body = rest.join('\n\n');
  const header = (name) => head.match(new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, 'im'))?.[1]?.replace(/\r?\n[ \t]/g, ' ').trim() ?? '';
  if (/quoted-printable/i.test(raw)) body = decodeQuotedPrintable(body);
  if (/Content-Transfer-Encoding:\s*base64/i.test(raw)) {
    body = body.replace(/^--.*$/gm, '').split(/\r?\n\r?\n/).map((p) => {
      const b = p.replace(/[^A-Za-z0-9+/=]/g, '');
      return b.length > 40 ? Buffer.from(b, 'base64').toString('utf8') : p;
    }).join('\n');
  }
  return { from: envelope.from, to: envelope.to, subject: header('Subject'), html: body, receivedAt: new Date().toISOString() };
}

net.createServer((socket) => {
  let envelope = { from: '', to: [] };
  let data = null;
  const reply = (line) => socket.write(`${line}\r\n`);
  reply('220 dev-mail-sink ready');
  let buffer = '';
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index;
    while (true) {
      if (data !== null) {
        index = buffer.indexOf('\r\n.\r\n');
        if (index === -1) return;
        data += buffer.slice(0, index);
        buffer = buffer.slice(index + 5);
        messages.push(parse(data, envelope));
        data = null;
        envelope = { from: '', to: [] };
        reply('250 OK: queued');
        continue;
      }
      index = buffer.indexOf('\r\n');
      if (index === -1) return;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === 'EHLO') reply('250 dev-mail-sink'); // no AUTH advertised, so clients skip it
      else if (cmd === 'HELO') reply('250 dev-mail-sink');
      else if (cmd === 'AUTH') reply('235 Authentication successful');
      else if (cmd === 'MAIL') { envelope.from = line.replace(/^MAIL FROM:\s*/i, '').replace(/[<>]/g, ''); reply('250 OK'); }
      else if (cmd === 'RCPT') { envelope.to.push(line.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, '')); reply('250 OK'); }
      else if (cmd === 'DATA') { data = ''; buffer = '\r\n' + buffer; reply('354 End data with <CR><LF>.<CR><LF>'); }
      else if (cmd === 'QUIT') { reply('221 Bye'); socket.end(); }
      else reply('250 OK');
    }
  });
  socket.on('error', () => {});
}).listen(SMTP_PORT, '0.0.0.0');

http.createServer((req, res) => {
  if (req.method === 'DELETE') messages.length = 0;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(messages));
}).listen(HTTP_PORT, '127.0.0.1');

console.log(`dev-mail-sink: SMTP :${SMTP_PORT}, HTTP http://127.0.0.1:${HTTP_PORT}/messages`);
