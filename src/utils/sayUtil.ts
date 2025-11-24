import Twilio from 'twilio';
import {config} from '../config/config.ts'
const accountSid = config.twilio.accountSid;
const authToken = config.twilio.authToken;

if (!accountSid || !authToken) {
  throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set in env');
}

const twilio = Twilio(accountSid, authToken);

export interface SayOptions {
  to: string; // E.164
  from?: string; // E.164 (defaults to TWILIO_PHONE_NUMBER)
  text: string;
  voice?: string; // e.g. 'alice'
  language?: string; // e.g. 'en-US'
  timeout?: number; // seconds
}

/**
 * Escape XML entities to avoid TwiML injection
 */
function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate TwiML string that says the provided text.
 */
export function twimlForSay(text: string, voice = 'alice', language = 'en-US'): string {
  return `<Response><Say voice="${escapeXml(voice)}" language="${escapeXml(language)}">${escapeXml(text)}</Say></Response>`;
}

/**
 * Place an outbound call and supply inline TwiML to speak the given text.
 */
export async function sayViaOutboundCall(opts: SayOptions) {
  const { to, from = process.env.TWILIO_PHONE_NUMBER as string, text, voice = 'alice', language = 'en-US', timeout = 30 } = opts;

  if (!to) throw new Error('`to` is required.');
  if (!text) throw new Error('`text` is required.');
  if (!from) throw new Error('`from` is required (TWILIO_PHONE_NUMBER or opts.from)');

  const twiml = twimlForSay(text, voice, language);

  const call = await twilio.calls.create({
    to,
    from,
    twiml,
    timeout,
  });

  return call;
}
