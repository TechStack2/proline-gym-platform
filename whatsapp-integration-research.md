# WhatsApp Cloud API Integration — Research & Architecture

**Project:** Proline Gym Platform — Hadath, Lebanon  
**Tech Stack:** Next.js 16 + Supabase (Auth / DB) + TypeScript  
**Current Auth:** Supabase Phone OTP (SMS) for passwordless auth  
**Goal:** Replace SMS OTP with WhatsApp + allow signup/login via WhatsApp number  
**Date:** June 2026  
**Document Type:** Research / Architecture — no implementation code

---

## Table of Contents

1. [WhatsApp Cloud API Overview](#1-whatsapp-cloud-api-meta)
2. [Sending OTP via WhatsApp](#2-sending-otp-via-whatsapp)
3. [Integration Architecture Options](#3-integration-architecture-options)
4. [Technical Implementation — Option B Deep Dive](#4-technical-implementation-option-b-recommended)
5. [User Signup / Login Flow](#5-user-signuplogin-flow)
6. [Security Considerations](#6-security-considerations)
7. [Cost Analysis](#7-cost-analysis)
8. [Lebanese Market Specifics](#8-lebanese-market-specifics)
9. [Recommendation Summary](#9-recommendation-summary)

---

## 1. WhatsApp Cloud API (Meta)

### 1.1 What Is It?

The **WhatsApp Cloud API** is Meta's hosted version of the WhatsApp Business API. Unlike the on-premise Business API (which requires a BSP like Twilio or MessageBird), the Cloud API is hosted directly by Meta and is **free to use** — you pay only per conversation.

### 1.2 Free Tier

| Metric | Limit |
|--------|-------|
| Free conversations / month | **1,000** (marketing, utility, authentication, service) |
| Test phone numbers | Up to 5 recipients during app development |
| Messages during free tier | Unlimited messages within those 1,000 conversations |
| API calls | Rate-limited{