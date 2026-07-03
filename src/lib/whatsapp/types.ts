// ============================================================
// D5: WhatsApp Cloud API — Types & Template Management
// PRO LINE Gym Platform — Phase D Offline Sync & PWA
// ============================================================

// ─── WhatsApp Cloud API Types ────────────────────────────────────────

export type WhatsAppLanguage = 'ar' | 'en' | 'fr';

export type WhatsAppMessageType = 'template' | 'text' | 'image' | 'document';

export type WhatsAppTemplateStatus = 'active' | 'pending' | 'rejected' | 'paused';

// Template parameter format: {{1}}, {{2}}, etc.
export interface WhatsAppTemplate {
  id: string;
  name: string; // unique template name (e.g., "payment_reminder")
  category: 'marketing' | 'utility' | 'authentication';
  language: WhatsAppLanguage;
  status: WhatsAppTemplateStatus;
  // Body components with parameter placeholders
  body_ar: string;
  body_en: string;
  body_fr: string;
  // Optional header
  header_text_ar?: string;
  header_text_en?: string;
  header_text_fr?: string;
  // Optional footer
  footer_ar?: string;
  footer_en?: string;
  footer_fr?: string;
  // Optional button
  button_text_ar?: string;
  button_text_en?: string;
  button_text_fr?: string;
  button_url?: string;
  created_at: string;
  updated_at: string;
}

// Payload for sending a template message
export interface WhatsAppTemplatePayload {
  to: string; // phone number in international format
  template_name: string;
  language: WhatsAppLanguage;
  parameters: string[]; // ordered list replacing {{1}}, {{2}}, etc.
}

// Webhook event from WhatsApp
export interface WhatsAppWebhookEvent {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

export interface WhatsAppWebhookChange {
  field: 'messages';
  value: {
    messaging_product: 'whatsapp';
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts: WhatsAppContact[];
    messages: WhatsAppIncomingMessage[];
    statuses?: WhatsAppMessageStatus[];
  };
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppIncomingMessage {
  id: string;
  from: string;
  timestamp: string;
  type: 'text' | 'image' | 'document' | 'button' | 'interactive';
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
  button?: { payload: string; text: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description: string };
  };
}

export interface WhatsAppMessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message: string }[];
}

export interface WhatsAppSendResponse {
  messaging_product: 'whatsapp';
  contacts: { input: string; wa_id: string }[];
  messages: { id: string }[];
}

// ─── Template Definitions ────────────────────────────────────────────

/**
 * All WhatsApp Cloud API templates. These must be registered with Meta Business
 * Manager. Each template has tri-lingual variants (AR/EN/FR).
 *
 * WL-IDENTITY: the footer strings below are the DEFAULT (Proline) footers. Per-gym
 * registration must source the footer from the gym identity via
 * `whatsappFooter(gym, locale, { withPhone })` (src/lib/whatsapp/identity.ts) so a
 * white-label tenant's members see THAT gym's name/phone. Unset fields fall back
 * to these defaults, so the demo registers byte-identically.
 */
export const WHATSAPP_TEMPLATES: Record<string, Omit<WhatsAppTemplate, 'id' | 'status' | 'created_at' | 'updated_at'>> = {
  // ── Payment Reminder ────────────────────────────────────────────
  payment_reminder: {
    name: 'payment_reminder',
    category: 'utility',
    language: 'ar',
    body_ar: 'مرحباً {{1}}! تذكير بدفع الاشتراك في برو لاين جيم. المبلغ المستحق: {{2}} دولار. تاريخ الاستحقاق: {{3}}. للدفع، يرجى التواصل معنا. شكراً!',
    body_en: 'Hi {{1}}! Reminder about your PRO LINE Gym membership payment. Amount due: ${{2}}. Due date: {{3}}. Please contact us to settle. Thank you!',
    body_fr: 'Bonjour {{1}}! Rappel de paiement pour votre abonnement PRO LINE Gym. Montant dû: {{2}}$. Date d\'échéance: {{3}}. Veuillez nous contacter pour régler. Merci!',
    footer_ar: 'برو لاين جيم — طريق الشام، بناية سكاي بيزنس سنتر',
    footer_en: 'PRO LINE Gym — Damascus Road, Sky Business Center',
    footer_fr: 'PRO LINE Gym — Route de Damas, Sky Business Center',
  },

  // ── Class Reminder ──────────────────────────────────────────────
  class_reminder: {
    name: 'class_reminder',
    category: 'utility',
    language: 'ar',
    body_ar: 'مرحباً {{1}}! تذكير بحصة {{2}} غداً الساعة {{3}}. لا تنسَ إحضار معداتك. نراكم قريباً!',
    body_en: 'Hi {{1}}! Reminder: your {{2}} class is tomorrow at {{3}}. Don\'t forget your gear. See you soon!',
    body_fr: 'Bonjour {{1}}! Rappel: votre cours de {{2}} est demain à {{3}}. N\'oubliez pas votre équipement. À bientôt!',
    footer_ar: 'برو لاين جيم',
    footer_en: 'PRO LINE Gym',
    footer_fr: 'PRO LINE Gym',
  },

  // ── Trial Class Confirmation ────────────────────────────────────
  trial_confirmation: {
    name: 'trial_confirmation',
    category: 'utility',
    language: 'ar',
    body_ar: 'مرحباً {{1}}! تم تأكيد حصتك التجريبية في {{2}} بتاريخ {{3}} الساعة {{4}}. العنوان: طريق الشام، سكاي بيزنس سنتر، بدارو. نراكم قريباً! 🥊',
    body_en: 'Hi {{1}}! Your trial class for {{2}} is confirmed on {{3}} at {{4}}. Location: Damascus Road, Sky Business Center, Baabda. See you soon! 🥊',
    body_fr: 'Bonjour {{1}}! Votre cours d\'essai de {{2}} est confirmé le {{3}} à {{4}}. Adresse: Route de Damas, Sky Business Center, Baabda. À bientôt! 🥊',
    footer_ar: 'برو لاين جيم — +961 70 628 601',
    footer_en: 'PRO LINE Gym — +961 70 628 601',
    footer_fr: 'PRO LINE Gym — +961 70 628 601',
  },

  // ── Camp Registration Confirmation ──────────────────────────────
  camp_registration: {
    name: 'camp_registration',
    category: 'utility',
    language: 'ar',
    body_ar: 'مرحباً {{1}}! تم تسجيل {{2}} في مخيم {{3}} من {{4}} إلى {{5}}. يرجى إحضار: {{6}}. للاستفسار: +961 70 628 601',
    body_en: 'Hi {{1}}! {{2}} is registered for {{3}} camp from {{4}} to {{5}}. Please bring: {{6}}. Questions? +961 70 628 601',
    body_fr: 'Bonjour {{1}}! {{2}} est inscrit(e) au camp {{3}} du {{4}} au {{5}}. À apporter: {{6}}. Questions? +961 70 628 601',
    footer_ar: 'برو لاين جيم',
    footer_en: 'PRO LINE Gym',
    footer_fr: 'PRO LINE Gym',
  },

  // ── Welcome / Lead Follow-up ────────────────────────────────────
  welcome_lead: {
    name: 'welcome_lead',
    category: 'marketing',
    language: 'ar',
    body_ar: 'أهلاً {{1}}! شكراً لاهتمامك ببرو لاين جيم. نقدم: ملاكمة، مواي تاي، فيتنس، زومبا، وتدريب سيدات. هل تود حجز حصة تجريبية مجانية؟ راسلنا للحجز 💪',
    body_en: 'Hey {{1}}! Thanks for your interest in PRO LINE Gym. We offer: Boxing, Muay Thai, Fitness, Zumba & Ladies Training. Want a free trial class? Message us to book 💪',
    body_fr: 'Salut {{1}}! Merci pour votre intérêt pour PRO LINE Gym. Nous offrons: Boxe, Muay Thai, Fitness, Zumba & Entraînement Femmes. Voulez-vous un cours d\'essai gratuit? Écrivez-nous 💪',
    footer_ar: 'برو لاين جيم — +961 70 628 601',
    footer_en: 'PRO LINE Gym — +961 70 628 601',
    footer_fr: 'PRO LINE Gym — +961 70 628 601',
  },
} as const;
