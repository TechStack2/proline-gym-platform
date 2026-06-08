// ============================================================
// D5: WhatsApp Cloud API Client
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================
// Sends template messages via WhatsApp Cloud API.
// Webhook handler is in supabase/functions/whatsapp-webhook/
// ============================================================

import type {
  WhatsAppLanguage,
  WhatsAppTemplatePayload,
  WhatsAppSendResponse,
} from '@/lib/whatsapp/types';

// ─── Configuration ───────────────────────────────────────────────────

const WHATSAPP_API_VERSION = 'v22.0';
const WHATSAPP_API_BASE = 'https://graph.facebook.com';

function getConfig() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error(
      'WhatsApp Cloud API not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in .env.local',
    );
  }

  return { phoneNumberId, accessToken };
}

// ─── Send Template Message ───────────────────────────────────────────

/**
 * Send a pre-approved WhatsApp template message.
 * Templates must be registered in Meta Business Manager.
 */
export async function sendTemplateMessage(
  payload: WhatsAppTemplatePayload,
): Promise<WhatsAppSendResponse> {
  const { phoneNumberId, accessToken } = getConfig();
  const { to, template_name, language, parameters } = payload;

  // Build template components with parameter substitution
  const bodyParams = parameters.map((value, i) => ({
    type: 'text' as const,
    text: String(value),
  }));

  const url = `${WHATSAPP_API_BASE}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: template_name,
          language: { code: language },
          components: [
            {
              type: 'body',
              parameters: bodyParams,
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `WhatsApp API error ${response.status}: ${JSON.stringify(errorBody)}`,
      );
    }

    return response.json();
  } catch (err: any) {
    // Log to message_logs table if Supabase client is available
    console.error('[WhatsApp] Send template failed:', err?.message);
    throw err;
  }
}

// ─── Send Text Message (non-template) ────────────────────────────────

/**
 * Send a free-form text message (requires opt-in from recipient).
 */
export async function sendTextMessage(
  to: string,
  text: string,
): Promise<WhatsAppSendResponse> {
  const { phoneNumberId, accessToken } = getConfig();

  const url = `${WHATSAPP_API_BASE}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(
        `WhatsApp API error ${response.status}: ${JSON.stringify(errorBody)}`,
      );
    }

    return response.json();
  } catch (err: any) {
    console.error('[WhatsApp] Send text failed:', err?.message);
    throw err;
  }
}

// ─── Convenience Send Functions ──────────────────────────────────────

export interface SendReminderParams {
  to: string;
  name: string;
  amount: string;
  dueDate: string;
  language?: WhatsAppLanguage;
}

export async function sendPaymentReminder(
  params: SendReminderParams,
): Promise<WhatsAppSendResponse> {
  return sendTemplateMessage({
    to: params.to,
    template_name: 'payment_reminder',
    language: params.language || 'ar',
    parameters: [params.name, params.amount, params.dueDate],
  });
}

export interface SendClassReminderParams {
  to: string;
  name: string;
  className: string;
  classTime: string;
  language?: WhatsAppLanguage;
}

export async function sendClassReminder(
  params: SendClassReminderParams,
): Promise<WhatsAppSendResponse> {
  return sendTemplateMessage({
    to: params.to,
    template_name: 'class_reminder',
    language: params.language || 'ar',
    parameters: [params.name, params.className, params.classTime],
  });
}

export interface SendTrialConfirmationParams {
  to: string;
  name: string;
  discipline: string;
  date: string;
  time: string;
  language?: WhatsAppLanguage;
}

export async function sendTrialConfirmation(
  params: SendTrialConfirmationParams,
): Promise<WhatsAppSendResponse> {
  return sendTemplateMessage({
    to: params.to,
    template_name: 'trial_confirmation',
    language: params.language || 'ar',
    parameters: [params.name, params.discipline, params.date, params.time],
  });
}

export interface SendCampRegistrationParams {
  to: string;
  name: string;
  childName: string;
  campName: string;
  startDate: string;
  endDate: string;
  itemsToBring: string;
  language?: WhatsAppLanguage;
}

export async function sendCampRegistrationConfirmation(
  params: SendCampRegistrationParams,
): Promise<WhatsAppSendResponse> {
  return sendTemplateMessage({
    to: params.to,
    template_name: 'camp_registration',
    language: params.language || 'ar',
    parameters: [
      params.name,
      params.childName,
      params.campName,
      params.startDate,
      params.endDate,
      params.itemsToBring,
    ],
  });
}

// ─── Validate Webhook ────────────────────────────────────────────────

/**
 * Verify webhook signature from WhatsApp.
 * Used in the edge function handler to authenticate requests.
 */
export function verifyWebhookSignature(
  signature: string,
  body: string,
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn('[WhatsApp] App secret not configured, skipping signature verification');
    return true; // Allow in dev without secret
  }

  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

// ─── Health Check ────────────────────────────────────────────────────

export async function checkWhatsAppConnection(): Promise<{
  configured: boolean;
  phoneNumberId?: string;
}> {
  try {
    const config = getConfig();
    return {
      configured: true,
      phoneNumberId: config.phoneNumberId,
    };
  } catch {
    return { configured: false };
  }
}
