# Proline Gym — Platform Architecture & Feature Set Blueprint

> **Version:** 1.0  
> **Status:** Draft for Review  
> **Context:** Martial arts gym management platform for Proline Gym, Hadath, Lebanon  
> **Scale:** 150–400 students, 5–10 coaches, 20–40 classes/week  
> **Current State:** Excel + WhatsApp  
> **Market Gap:** No platform combines martial-arts-specific features with Lebanese/MENA localization

---

## Table of Contents

1. [Platform Structure & Modules](#1-platform-structure--modules)
2. [Feature Set by Module (MoSCoW)](#2-feature-set-by-module-moscow)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Data Model Overview](#4-data-model-overview)
5. [Key Workflows](#5-key-workflows)
6. [Integration Map](#6-integration-map)
7. [Phased Roadmap (V1 → V2 → V3)](#7-phased-roadmap)
8. [Architecture Principles & Constraints](#8-architecture-principles--constraints)

---

## 1. Platform Structure & Modules

### High-Level Module Map

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROLINE GYM PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  CORE     │  │ CLASSES  │  │ BILLING  │  │ MEMBER   │       │
│  │  GYM OPS  │  │ & SCHED  │  │ & FIN    │  │ PORTAL   │       │
│  │           │  │          │  │          │  │ (Self-   │       │
│  │ Students  │  │ Recurring│  │ Invoices │  │  Service)│       │
│  │ Coaches   │  │ Schedule │  │ Payments │  │          │       │
│  │ Attendance│  │ Belt Grps│  │ Dual-Cur │  │ Profile  │       │
│  │ Belt/Rank │  │ Coach    │  │ TVA 11%  │  │ Schedule │       │
│  │ Progres.  │  │ Assign   │  │ OMT/Whish│  │ Payments │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │            │
│  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐  ┌────┴─────┐       │
│  │ PERSONAL │  │ EXTERNAL │  │ SUMMER   │  │ SOCIAL   │       │
│  │ TRAINING │  │ COACH    │  │ CAMPS &  │  │ INQUIRY  │       │
│  │ PACKAGES │  │ RENTALS  │  │ EVENTS   │  │ PIPELINE │       │
│  │          │  │          │  │          │  │          │       │
│  │ Sessions │  │ Space    │  │ Regis-   │  │ IG/WA    │       │
│  │ Credits  │  │ Booking  │  │ tration  │  │  → Lead  │       │
│  │ Coach    │  │ Payment  │  │ Pickup   │  │ Trial    │       │
│  │ Assign   │  │ Waivers  │  │ Auth     │  │  → Conv  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              CROSS-CUTTING LAYERS                         │   │
│  │  Offline Sync  │  RTL/Arabic  │  Mobile-First  │  Roles  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              INTEGRATION LAYER                             │   │
│  │  OMT │ Whish │ Bob Finance │ WhatsApp API │ SMS Gateway  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Module Relationships

| Module | Primary Dependency | Data Shared With |
|--------|-------------------|-----------------|
| Core Gym Ops | — (foundation) | All modules |
| Classes & Schedule | Core Gym Ops (students, coaches) | Billing, Member Portal |
| Billing & Finance | Core Gym Ops (students, packages) | All modules (payments) |
| Member Portal | Core Gym Ops, Classes, Billing | Read-only mirror of all |
| Personal Training | Core Gym Ops, Classes | Billing, Member Portal |
| External Coach Rentals | Core Gym Ops (facilities) | Billing |
| Summer Camps & Events | Core Gym Ops (students) | Billing, Member Portal |
| Social Inquiry Pipeline | Core Gym Ops (leads → students) | Classes (trial scheduling) |

---

## 2. Feature Set by Module (MoSCoW)

### 2.1 Core Gym Operations

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Student Profile Management | Full profile: name, DOB, guardian info (for minors), emergency contacts, medical notes, belt/rank history, membership status, photo. Arabic + English fields. |
| **MUST** | Coach Profile Management | Bio, disciplines, certifications, schedule availability, assigned classes, belt ranking authority level, payment rate. |
| **MUST** | Belt/Rank Progression Engine | Discipline-specific belt hierarchies (BJJ: white→blue→purple→brown→black; Muay Thai: white→yellow→orange→etc.; Karate: 10th kyu→1st kyu→shodan). Track requirements per rank, log promotions with date + coach signature, auto-calculate eligibility based on attendance + time-in-grade. |
| **MUST** | Attendance Tracking | QR code check-in that works fully offline, stores locally on device, auto-syncs when connectivity returns. Flags no-shows, late arrivals. Attendance counts toward belt eligibility. Coach can mark attendance manually as fallback. |
| **MUST** | Student Status Management | Active, Frozen, Suspended, Expired, Trial, Lead statuses with date tracking. Auto-expire memberships. |
| **MUST** | Arabic RTL UI | Full RTL layout support. All user-facing text in Arabic by default with English toggle. Dates in DD/MM/YYYY or Arabic calendar format. |
| **SHOULD** | Medical & Waiver Management | Digital waiver forms (Arabic + English), medical condition flags, allergy alerts, emergency contact reachable from student profile. |
| **SHOULD** | Notes & Communication Log | Per-student internal notes (coach-only), communication history (WhatsApp messages sent, calls made). |
| **COULD** | Student Tags & Segments | Custom tags (e.g., "Competition Team", "Scholarship", "VIP") for filtering and reporting. |
| **WON'T v1** | Advanced Analytics Dashboard | Predictive churn, attendance trends, revenue forecasting. |

### 2.2 Classes & Schedule

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Recurring Class Schedule | Weekly repeating schedule with exceptions (holidays, special events). Multi-discipline support. Each class has: discipline, belt level range (e.g., BJJ Fundamentals: white-blue), max capacity, assigned coach(es). |
| **MUST** | Class Calendar View | Mobile-optimized weekly/monthly calendar. Filterable by discipline, coach, belt level. Color-coded by discipline. |
| **MUST** | Coach Assignment | Assign 1+ coaches per class slot. Handle substitute coach workflow (swap with notification). |
| **MUST** | Class Capacity & Waitlist | Hard cap per class. Auto-waitlist when full. Auto-promote from waitlist when spot opens (with notification). |
| **MUST** | Class Check-in (Offline) | Coach opens class on phone → sees roster → marks attendance. Works with zero connectivity. Syncs when online. |
| **SHOULD** | Class Cancellation Workflow | Cancel class → auto-notify all enrolled students via WhatsApp/SMS → offer make-up credit. |
| **SHOULD** | Make-up Class Credits | Students who miss/cancelled get make-up credits. Track expiry. Apply to any eligible class. |
| **COULD** | Class Recording / Notes | Coach can add post-class notes: topics covered, student performance notes, injuries. |
| **WON'T v1** | Live Class Booking (Real-time) | Real-time seat availability with live updates during booking. |

### 2.3 Billing & Finance

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Dual-Currency Invoicing | Every invoice shows amount in both USD and LBP. Exchange rate captured at time of invoice creation. User can pay in either currency. |
| **MUST** | Lebanese TVA 11% | Auto-calculate TVA (VAT) at 11% on all taxable items. Show TVA breakdown on invoices. Exempt certain items (registration fees, etc.) with configurable tax rules. |
| **MUST** | Multiple Payment Methods | Cash (USD/LBP), OMT, Whish, Bob Finance installments, Bank Transfer. Record payment method on each transaction. |
| **MUST** | Invoice Generation | Auto-generate invoices for: monthly membership, package purchases, event registrations, rental fees. Sequential invoice numbering. PDF export. |
| **MUST** | Payment Tracking | Record payments against invoices. Partial payments allowed. Track outstanding balances. Payment date, method, reference number. |
| **MUST** | Membership Plans | Configurable plans: monthly, quarterly, annual, multi-class packs. Auto-renewal flag. Freeze period support (e.g., 2 weeks/year). |
| **SHOULD** | Exchange Rate Tracking | Daily exchange rate log (USD→LBP). Auto-apply rate from invoice date. Manual override allowed. Rate history report. |
| **SHOULD** | Receipts | Customer-facing receipt with all required Lebanese tax info. Arabic + English. SMS/WhatsApp delivery option. |
| **SHOULD** | Outstanding Balance Alerts | Auto-notify when balance exceeds threshold. Block class check-in if balance overdue (configurable). |
| **COULD** | Bob Finance Installments | Integration with Bob Finance for 3/6/9/12 month payment plans. Sync installment status. |
| **COULD** | Revenue Reports | Daily/Monthly revenue by: membership type, discipline, coach, payment method. P&L summary. |
| **WON'T v1** | Automated Collections | Dunning workflows, late fee auto-calculation, legal escalation tracking. |

### 2.4 Personal Training Packages

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Package Creation | Configurable packages: N sessions, valid for X days, assigned to specific coach or "any coach." Price in USD/LBP. |
| **MUST** | Session Credit Tracking | Deduct 1 credit per session. Show remaining credits on student profile. Expiry date visible. |
| **MUST** | PT Session Scheduling | Student books session slot from coach's available times. Coach confirms. Calendar integration. |
| **MUST** | Coach Assignment | Assign specific coach to package. Coach sees their PT schedule separately from group classes. |
| **SHOULD** | Package Purchase & Renewal | Student buys package via portal or reception. Auto-activate on payment. Renewal option before expiry. |
| **SHOULD** | No-show / Cancellation Policy | Configurable: deduct credit if no-show, refund credit if cancelled N hours before. |
| **COULD** | Coach Commission Tracking | Track coach earnings from PT sessions. Percentage or fixed per session. Payout report. |
| **WON'T v1** | PT Progress Tracking | Coach logs student progress per session (weight, reps, skills achieved). |

### 2.5 External Coach Rentals

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Space Booking Calendar | View available slots in gym space (mat area, ring/cage). Time-slot based booking. |
| **MUST** | External Coach Profile | Name, contact, discipline, ID/passport copy, insurance info, signed waiver. |
| **MUST** | Rental Pricing | Configurable hourly/daily rates. Different rates for different spaces. USD/LBP. |
| **MUST** | Payment at Booking | Require payment or deposit to confirm booking. Record payment. |
| **MUST** | Waiver & Agreement | Digital waiver signed by external coach before first booking. Liability release. |
| **SHOULD** | Recurring Rental | External coach books same slot weekly/monthly. Auto-invoice. |
| **SHOULD** | Cancellation & Refund Policy | Configurable cancellation window. Partial/full refund rules. |
| **COULD** | External Coach's Own Students | External coach can list their own students attending their rental session (for gym records). |
| **WON'T v1** | External Coach Payment Processing | Gym pays external coach via platform. Manual settlement in v1. |

### 2.6 Summer Camps & Events

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Event Creation | Name, description, date range, daily schedule, age group, belt level, capacity, price (USD/LBP). |
| **MUST** | Registration & Payment | Online registration. Full or deposit payment. Confirmation on payment. |
| **MUST** | Pickup Authorization | Guardian designates authorized pickups (name, phone, photo ID). Check-in/out logs who picked up. |
| **MUST** | Daily Attendance | Same offline QR check-in as regular classes. Track who attended each day of camp. |
| **SHOULD** | Early Bird Pricing | Configurable early-bird discount with cutoff date. |
| **SHOULD** | Sibling Discount | Configurable % discount for multiple siblings. |
| **SHOULD** | Waitlist | Auto-waitlist when camp fills. Notify if spot opens. |
| **COULD** | Camp Photo Gallery | Coaches upload photos during camp. Parent-accessible gallery. |
| **WON'T v1** | Camp Curriculum Builder | Day-by-day lesson plan builder with skill tracking. |

### 2.7 Social Media Inquiry Pipeline

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Lead Capture Form | Simple form: name, phone, WhatsApp number, interested discipline, experience level, source (Instagram/WhatsApp/Walk-in/Referral). |
| **MUST** | Lead Status Tracking | New → Contacted → Trial Scheduled → Trial Attended → Converted → Lost. Status history with timestamps. |
| **MUST** | Trial Class Scheduling | Assign lead to a specific class slot. Send confirmation via WhatsApp. Coach notified of trial student. |
| **MUST** | WhatsApp Integration | Send automated messages: welcome, trial reminder, follow-up after trial, payment reminder. Manual send from platform. |
| **SHOULD** | Lead Dashboard | Daily view: new leads, contacted today, trials today, conversion rate. Filter by source. |
| **SHOULD** | Follow-up Reminders | Auto-remind staff to follow up if lead not contacted within N hours. Escalate if no response. |
| **SHOULD** | Conversion Tracking | Track which leads convert to paying members. Source attribution. Cost per acquisition (manual input). |
| **COULD** | Instagram DM Integration | Ingest Instagram DMs as leads (via Meta API). Reply from platform. |
| **COULD** | Automated Nurture Sequences | Drip campaign: Day 1 welcome, Day 3 offer, Day 7 trial reminder, Day 14 follow-up. |
| **WON'T v1** | AI Lead Scoring | Predictive scoring based on engagement, source, profile data. |

### 2.8 Member Self-Service Portal

| Priority | Feature | Description |
|----------|---------|-------------|
| **MUST** | Profile View & Edit | View personal info, update phone/email, emergency contacts, medical notes. |
| **MUST** | Class Schedule View | See weekly schedule, filter by discipline/belt level. Book into classes. |
| **MUST** | Attendance History | View own attendance record. Check-in history with dates. |
| **MUST** | Billing & Invoices | View invoices, payment history, outstanding balance. Download PDF receipts. |
| **MUST** | Arabic UI | Full Arabic interface. English toggle. |
| **MUST** | Mobile Web (PWA) | Progressive Web App — installs on phone home screen, works offline for schedule viewing, syncs when online. |
| **SHOULD** | Package Purchase | Buy membership plans, PT packages, event registrations directly from portal. |
| **SHOULD** | Belt Progress View | See current belt, promotion history, requirements for next rank, attendance progress toward eligibility. |
| **SHOULD** | Push Notifications | Class reminders, payment due alerts, promotion announcements, camp registration open. |
| **COULD** | Class Waitlist | Join waitlist for full classes. Auto-notified when spot opens. |
| **COULD** | Referral Program | Generate referral link. Track referred friends. Get reward (discount, free class). |
| **WON'T v1** | In-App Chat with Coach | Direct messaging with assigned coach. |

---

## 3. User Roles & Permissions

### Role Matrix

| Capability | Owner | Head Coach | Coach | Reception/Admin | Student | Parent | External Coach |
|------------|-------|------------|-------|-----------------|---------|--------|----------------|
| **Manage Gym Settings** | ✓ | — | — | — | — | — | — |
| **Manage Coaches** | ✓ | ✓ (add/edit) | — | — | — | — | — |
| **Manage Students** | ✓ | ✓ | View own classes | ✓ (CRUD) | View own | View child | View own students |
| **Create/Edit Classes** | ✓ | ✓ | — | — | — | — | — |
| **Assign Coaches to Classes** | ✓ | ✓ | — | — | — | — | — |
| **View All Classes** | ✓ | ✓ | ✓ (assigned) | ✓ | ✓ | ✓ | Own bookings |
| **Take Attendance** | ✓ | ✓ | ✓ (own classes) | ✓ | — | — | Own sessions |
| **View Attendance Reports** | ✓ | ✓ (all) | ✓ (own) | ✓ | Own | Child's | Own |
| **Manage Belt Promotions** | ✓ | ✓ | Recommend | — | — | — | — |
| **Create/Edit Billing Plans** | ✓ | ✓ | — | — | — | — | — |
| **Generate Invoices** | ✓ | ✓ | — | ✓ | — | — | — |
| **Record Payments** | ✓ | ✓ | — | ✓ | — | — | — |
| **View Financial Reports** | ✓ | ✓ (summary) | — | ✓ (basic) | Own balance | Child's | Own balance |
| **Manage PT Packages** | ✓ | ✓ | View assigned | ✓ (create) | Buy | Buy child | — |
| **Manage External Rentals** | ✓ | ✓ | — | ✓ | — | — | Book only |
| **Manage Events/Camps** | ✓ | ✓ | — | ✓ | Register | Register child | — |
| **View Leads Pipeline** | ✓ | ✓ | — | ✓ | — | — | — |
| **Convert Leads** | ✓ | ✓ | — | ✓ | — | — | — |
| **Send WhatsApp Messages** | ✓ | ✓ | ✓ (own classes) | ✓ | — | — | — |
| **View Own Schedule** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Book Classes** | ✓ | ✓ | ✓ | — | ✓ | ✓ child | — |
| **View Own Belt Progress** | — | — | — | — | ✓ | ✓ child | — |
| **Sign Waivers** | — | — | — | — | ✓ | ✓ child | ✓ |
| **Manage Pickup Auth** | — | — | — | — | — | ✓ | — |
| **Access Offline Mode** | ✓ | ✓ | ✓ | ✓ | ✓ (view) | ✓ (view) | ✓ (view) |

### Role Descriptions

| Role | Description | Typical Count |
|------|-------------|---------------|
| **Owner** | Full system access. Manages gym settings, financials, coach hiring, strategic decisions. | 1–2 |
| **Head Coach** | Technical lead. Manages curriculum, belt promotions, class structure, coach assignments. Can view financial summaries but not detailed P&L. | 1 |
| **Coach** | Teaches assigned classes. Takes attendance, recommends belt promotions, sees own schedule and students. Cannot create classes or modify billing. | 5–10 |
| **Reception/Admin** | Front desk. Handles student registration, payments, class bookings, lead follow-up, event registration. No access to coach management or class curriculum. | 1–3 |
| **Student** | Self-service portal. Books classes, views schedule, checks attendance history, views belt progress, pays invoices. Cannot see other students. | 150–400 |
| **Parent** | Manages child's account. Books classes for child, handles payments, manages pickup authorization, views child's attendance and belt progress. Can have multiple children. | Varies |
| **External Coach** | Rents gym space. Books slots, pays rental fees, signs waivers. Cannot see student data or internal classes. Can optionally list their own students. | 0–10 |

---

## 4. Data Model Overview

### Entity Relationship Diagram (Business Level)

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   STUDENT    │───1:N─▶│   MEMBERSHIP     │       │    COACH         │
│              │       │                  │       │                  │
│ id           │       │ plan_type        │       │ id               │
│ name (ar/en) │       │ start_date       │       │ name (ar/en)     │
│ dob          │       │ end_date         │       │ disciplines      │
│ phone        │       │ status           │       │ certifications   │
│ whatsapp     │       │ freeze_periods   │       │ belt_authority   │
│ email        │       │ payment_method   │       │ rate             │
│ belt_rank    │       └──────────────────┘       │ availability     │
│ discipline   │                                    └────────┬─────────┘
│ status       │                                             │
│ guardian_id  │       ┌──────────────────┐                  │
│ medical_info │       │   CLASS_SESSION   │                  │
│ emergency_   │       │                  │◀───N:M───────────┘
│   contacts   │       │ id               │
│ waivers      │       │ discipline       │       ┌──────────────────┐
└──────┬───────┘       │ belt_level_range │       │  ATTENDANCE      │
       │               │ start_time       │       │                  │
       │               │ end_time         │       │ student_id       │
       │               │ recurring_rule   │       │ class_id         │
       │               │ max_capacity     │       │ date             │
       │               │ status           │       │ check_in_method  │
       │               │ location         │       │ status           │
       │               └────────┬─────────┘       │ offline_sync_id  │
       │                        │                  └──────────────────┘
       │               ┌────────┴─────────┐
       │               │  CLASS_INSTANCE   │       ┌──────────────────┐
       │               │  (actual date)    │       │  BELT_PROMOTION  │
       │               │                  │       │                  │
       │               │ class_session_id │       │ student_id       │
       │               │ date             │       │ from_rank        │
       │               │ coach_id         │       │ to_rank          │
       │               │ attendance_count │       │ discipline       │
       │               │ status           │       │ promoted_by      │
       │               └──────────────────┘       │ date             │
       │                                           │ requirements_met │
       │                                           └──────────────────┘
       │
       │               ┌──────────────────┐       ┌──────────────────┐
       │               │   INVOICE         │       │   PAYMENT        │
       │               │                  │       │                  │
       │               │ student_id       │       │ invoice_id       │
       │               │ invoice_number   │       │ amount_usd       │
       │               │ amount_usd       │       │ amount_lbp       │
       │               │ amount_lbp       │       │ exchange_rate    │
       │               │ exchange_rate    │       │ method           │
       │               │ tva_11%          │       │ reference_no     │
       │               │ total_usd        │       │ date             │
       │               │ total_lbp        │       │ status           │
       │               │ status           │       └──────────────────┘
       │               │ due_date         │
       │               └──────────────────┘
       │
       │               ┌──────────────────┐       ┌──────────────────┐
       │               │  PT_PACKAGE       │       │  PT_SESSION      │
       │               │                  │       │                  │
       │               │ student_id       │──1:N─▶│ package_id       │
       │               │ coach_id         │       │ scheduled_date   │
       │               │ total_sessions   │       │ status           │
       │               │ sessions_used    │       │ coach_id         │
       │               │ expiry_date      │       │ student_notes    │
       │               │ price_usd/lbp    │       │ coach_notes      │
       │               │ status           │       └──────────────────┘
       │               └──────────────────┘
       │
       │               ┌──────────────────┐       ┌──────────────────┐
       │               │  EVENT_CAMP       │       │ EVENT_REGISTRATION│
       │               │                  │       │                  │
       │               │ name             │──1:N─▶│ event_id         │
       │               │ date_range       │       │ student_id       │
       │               │ daily_schedule   │       │ payment_status   │
       │               │ age_group        │       │ attendance_days[]│
       │               │ capacity         │       │ pickup_auth[]    │
       │               │ price_usd/lbp    │       │ waivers_signed   │
       │               └──────────────────┘       └──────────────────┘
       │
       │               ┌──────────────────┐       ┌──────────────────┐
       │               │  SPACE_RENTAL     │       │  LEAD            │
       │               │                  │       │                  │
       │               │ external_coach_id│       │ name             │
       │               │ space_type       │       │ phone            │
       │               │ start_time       │       │ whatsapp         │
       │               │ end_time         │       │ source           │
       │               │ rate             │       │ discipline_int   │
       │               │ payment_status   │       │ experience_level │
       │               │ waiver_signed    │       │ status           │
       │               └──────────────────┘       │ trial_class_id   │
       │                                           │ converted_at     │
       │                                           └──────────────────┘
       │
       └─────────────────── CORE LINKING ──────────────────┘

    KEY RELATIONSHIPS:
    • Student ↔ Membership: 1:N (a student has a membership history)
    • Student ↔ Class: N:M (via Attendance)
    • Student ↔ Belt Promotion: 1:N (promotion history)
    • Student ↔ Invoice: 1:N (billing history)
    • Student ↔ PT Package: 1:N
    • Student ↔ Event Registration: N:M
    • Coach ↔ Class Session: N:M (co-assignments)
    • Coach ↔ PT Package: 1:N
    • Invoice ↔ Payment: 1:N (partial payments)
    • Lead → Student: 1:1 (when converted)
    • Parent → Student: 1:N (guardian relationship)
```

### Key Business Objects Summary

| Entity | Description | Key Attributes |
|--------|-------------|----------------|
| **Student** | Core member record | Name (ar/en), DOB, phone, WhatsApp, belt rank, discipline, status, guardian link |
| **Coach** | Staff instructor | Name (ar/en), disciplines, certifications, belt authority level, rate, availability |
| **Class Session** | Recurring class template | Discipline, belt range, schedule rule, capacity, assigned coaches |
| **Class Instance** | Single occurrence of a class | Date, actual coach, attendance snapshot, status (scheduled/cancelled/completed) |
| **Attendance** | Check-in record | Student, class instance, date, method (QR/manual), status (present/late/absent/no-show) |
| **Belt Promotion** | Rank advancement record | Student, from rank, to rank, discipline, promoted by, date, requirements evidence |
| **Membership** | Active subscription | Plan type, start/end dates, freeze periods, auto-renewal flag |
| **Invoice** | Billing document | Student, items, amounts (USD/LBP), exchange rate, TVA, status, due date |
| **Payment** | Payment transaction | Invoice, amounts, method, reference, date, recorded by |
| **PT Package** | Personal training bundle | Student, coach, session count, used count, expiry, price |
| **PT Session** | Individual PT appointment | Package, date, status, coach, notes |
| **Event/Camp** | Special program | Name, dates, schedule, age group, capacity, price |
| **Event Registration** | Student enrollment in event | Event, student, payment, attendance days, pickup auths, waivers |
| **Space Rental** | External coach booking | Coach, space, time slot, rate, payment, waiver |
| **Lead** | Prospective student | Contact info, source, interest, status, trial class, conversion date |
| **Exchange Rate** | USD→LBP rate log | Date, rate, source, recorded by |

---

## 5. Key Workflows

### Workflow 1: Student Inquiry → Trial → Membership → Belt Progression → Renewal

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ INQUIRY  │───▶│  TRIAL   │───▶│ MEMBER   │───▶│  BELT    │───▶│ RENEWAL  │
│          │    │  CLASS   │    │ SIGNUP   │    │ PROGRESS │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘

STEP 1: INQUIRY
  Lead arrives via Instagram DM, WhatsApp, walk-in, or referral
  → Reception creates Lead record (name, phone, discipline interest, source)
  → Auto-WA message sent: "Thanks for your interest! Would you like to try a free class?"
  → Lead status: New

STEP 2: TRIAL CLASS
  Reception schedules trial class from available slots
  → Trial class assigned to appropriate belt-level group
  → Auto-WA reminder 24h and 1h before
  → Coach notified of trial student in class
  → After class: coach marks trial attended + leaves feedback
  → Auto-WA follow-up: "How was your trial? Ready to join?"
  → Lead status: Trial Attended

STEP 3: MEMBERSHIP SIGNUP
  Student chooses plan (monthly/quarterly/annual)
  → Invoice generated in USD + LBP at current exchange rate
  → Payment via cash/OMT/Whish/Bob Finance
  → On payment: student activated, QR code generated, welcome WA sent
  → Lead status: Converted (linked to new Student record)
  → Student status: Active

STEP 4: BELT PROGRESSION
  Student attends classes → attendance logged via QR check-in
  → System tracks: total classes attended, time since last promotion, required skills
  → Coach recommends promotion when requirements met
  → Head Coach approves promotion
  → Belt Promotion record created
  → Student notified via portal + WA
  → New belt displayed on profile, unlocks new class groups

STEP 5: RENEWAL
  Membership approaching expiry (30/14/7 day alerts)
  → Auto-WA reminder sent with renewal invoice
  → Student pays via portal or at reception
  → Membership extended
  → Lapsed: if not renewed within grace period, status → Expired
```

### Workflow 2: Coach Takes Attendance (Offline-First)

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ COACH    │───▶│ OPEN     │───▶│ MARK     │───▶│ SYNC     │───▶│ DATA     │
│ OPENS    │    │ CLASS    │    │ ATTEND   │    │ WHEN     │    │ UPDATED  │
│ APP      │    │ ROSTER   │    │ (OFFLINE)│    │ ONLINE   │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘

DETAILED STEPS:
  1. Coach opens mobile app (works offline — cached data from last sync)
  2. App shows today's classes assigned to coach
  3. Coach taps on class → sees roster (cached student list + photos)
  4. Coach marks each student: Present / Late / Absent / No-Show
     - QR option: student shows QR on phone → coach scans → auto-marked Present
     - Manual option: tap student name → select status
  5. All attendance stored locally on device (IndexedDB/SQLite)
  6. When connectivity returns: auto-syncs to server
     - Conflict resolution: server timestamp wins for same record
     - Sync status indicator: green (synced), yellow (pending), red (failed)
  7. Attendance data flows to:
     - Belt eligibility counter (X classes attended)
     - Student attendance history
     - Class instance attendance count
     - No-show flags for billing follow-up
```

### Workflow 3: Billing & Payment Lifecycle

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ INVOICE  │───▶│ PAYMENT  │───▶│ RECEIPT  │───▶│ RECON-   │───▶│ REPORT   │
│ GENERATED│    │ RECEIVED │    │ ISSUED   │    │ CILIATION│    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘

DETAILED STEPS:
  1. Trigger: membership renewal, package purchase, event registration, rental booking
  2. System generates invoice:
     - Line items with description (Arabic + English)
     - Unit price in USD
     - Exchange rate (from daily rate table or manual entry)
     - Price in LBP = USD × rate
     - TVA 11% calculated on taxable items
     - Total in USD and LBP
     - Sequential invoice number: PRO-YYYY-NNNNN
     - Due date (configurable: 7/14/30 days)

 3. Student pays:
    - Cash (USD or LBP): reception records with reference note
    - OMT / Whish / Bob Finance: reception enters transaction reference number
    - Bank Transfer: upload transfer receipt image
 4. System records payment → invoice status updated (Paid / Partially Paid / Overdue)
 5. Receipt generated: Arabic + English, with all Lebanese tax info
 6. Receipt delivered via WhatsApp or portal download
 7. Month-end reconciliation: all payments grouped by method, matched against bank/OMT statements
 8. Reports: daily revenue snapshot, outstanding balances, payment method breakdown
```

### Workflow 4: External Coach Rental (End-to-End)

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ PROFILE  │───▶│ BOOKING  │───▶│ PAYMENT  │───▶│ WAIVER   │───▶│ CHECK-IN │
│ & WAIVER │    │ SLOT     │    │ & CONFIRM│    │ ON FILE  │    │ & USAGE  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘

DETAILED STEPS:
 1. External coach contacts gym → Reception creates External Coach profile:
    - Full name, phone, WhatsApp, discipline, ID/passport upload
    - Digital waiver form sent via WA link (Arabic + English)
    - Waiver must be signed before first booking is allowed
 2. External Coach requests booking:
    - Browses available time slots via a shared calendar link
    - Alternatively: reception books on their behalf
    - Selects: date, start/end time, space type (mat area / ring / full gym)
 3. Invoice auto-generated → payment required to confirm
    - Configurable: full payment or 50% deposit
    - Same payment methods as members
 4. On payment → booking confirmed
    - Auto-WA confirmation sent with date, time, and gym access instructions
    - Booking appears on gym calendar (visible to coaches, not students)
 5. Day of rental: external coach checks in at reception
    - Reception verifies ID/waiver
    - External coach's own students (if applicable) sign guest waivers
 6. Post-rental: space marked as used, any incident notes logged
```

### Workflow 5: Summer Camp — Registration to Pickup

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ CAMP     │───▶│ REGIS-   │───▶│ DAILY    │───▶│ PICKUP   │───▶│ CAMP     │
│ CREATED  │    │ TRATION  │    │ CHECK-IN │    │ AUTH     │    │ COMPLETE │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘

DETAILED STEPS:
 1. Admin creates camp:
    - Name, description (Arabic + English), age range (e.g., 6–12), belt level (any/beginner)
    - Date range (e.g., July 7–11, daily 9am–1pm)
    - Daily schedule (warm-up, technique, games, snack, discipline rotation)
    - Capacity, price (USD + LBP), early-bird price, sibling discount
    - Registration deadline
 2. Registration opens — promoted via WA broadcast + social media
 3. Parent registers child:
    - Via portal or at reception
    - Fills: child info (if not existing student), guardian info, emergency contacts, medical info
    - Designates pickup authorization list: names, phone numbers, relationship, photo (optional)
    - Signs digital waiver (parental consent)
    - Pays: full amount or deposit
    - Invoice + receipt generated
 4. Daily camp operation:
    - Morning check-in: QR code scan or manual by coach/reception
    - Attendance logged per day (offline-capable, syncs later)
    - Coach can log notes per child per day
 5. Pickup at end of day:
    - Reception verifies pickup person against authorization list
    - Logs: who picked up, time, relationship
    - Alert if unauthorized person attempts pickup
 6. Camp complete: attendance report, any incident reports, camp photo gallery (optional)
 7. Post-camp WA follow-up: "Thanks for joining! Sign up for regular classes at a discount."
```

---

## 6. Integration Map

### Integration Priority Matrix

| Priority | Integration | Purpose | Type | Effort |
|----------|-------------|---------|------|--------|
| **P1 — Critical** | WhatsApp Business API | Automated messaging, reminders, trial follow-ups, payment receipts, broadcast to all students | Cloud API | Medium |
| **P1 — Critical** | Local SMS Gateway | Fallback messaging when WhatsApp not available; Lebanese provider preferred (e.g., Touch/Alfa API) | API | Medium |
| **P1 — Critical** | OMT Payment Integration | OMT reference number tracking + manual verification | Manual/API | Low-Medium |
| **P1 — Critical** | Whish Payment Integration | Whish transaction tracking + manual verification | Manual/API | Low-Medium |
| **P2 — High** | Exchange Rate Feed | Auto-fetch official LBP/USD rate (Sayrafa or market rate); fallback to manual entry | Scraper/API | Low |
| **P2 — High** | Bob Finance | Installment plan verification + status sync | API | Medium |
| **P2 — High** | Push Notification Service | PWA push for class reminders, payment alerts, promotion announcements | Firebase/OneSignal | Low |
| **P3 — Medium** | Instagram Graph API | Pull Instagram DMs as leads, send replies from platform | Meta API | High |
| **P3 — Medium** | Email Gateway | Transactional emails (receipts, invoices) for parents who prefer email | SMTP/SendGrid | Low |
| **P3 — Medium** | QR Code Generation | Per-student unique QR for check-in. Works entirely offline. | Library | Low |
| **P4 — Optional** | Google Calendar Sync | Sync class schedule to coaches' personal calendars | API | Low |
| **P4 — Optional** | Lebanese Tax Authority | Future-proofing for e-invoicing compliance | API (when available) | Unknown |

### WhatsApp Business API — Detailed Scope

```
USE CASES (MUST have v1):
 • Welcome message on lead creation
 • Trial class confirmation + 24h reminder + 1h reminder
 • Post-trial follow-up (Day 0, Day 3, Day 7)
 • Payment due reminder (7d, 3d, 1d before, day of)
 • Payment receipt delivery
 • Class cancellation notification to all enrolled students
 • Belt promotion announcement to student
 • Membership expiring soon (30d, 14d, 7d)
 • Membership expired notification
 • Camp/event registration confirmation
 • Camp/event reminder (week before, day before)
 • Broadcast: new schedule, holiday closure, special event

TEMPLATE MANAGEMENT:
 • All templates in Arabic (primary) + English (secondary)
 • Variable placeholders: {student_name}, {class_time}, {discipline}, {coach_name}, {amount_due}, {payment_link}
 • Template review/approval workflow within platform before sending
```

---

## 7. Phased Roadmap (V1 → V2 → V3)

### V1 — MVP: OPERATIONAL CORE (Ship First)

**Goal:** Replace Excel + WhatsApp for daily operations. Handle attendance, billing, and member management. Works offline. Arabic + English.

| Module | V1 Scope |
|--------|----------|
| **Core Gym Ops** | Student profiles, coach profiles, belt/rank engine (static rules), QR code offline attendance, student status management, Arabic RTL UI |
| **Classes & Schedule** | Recurring weekly schedule, class calendar (mobile), coach assignment, class capacity, offline check-in |
| **Billing & Finance** | Dual-currency invoices, TVA 11%, cash + OMT + Whish payment recording, invoice generation (PDF), membership plans (monthly/quarterly/annual), payment tracking |
| **Member Portal** | Profile view/edit, class schedule view (read-only), attendance history, invoice/view pay history, Arabic UI, PWA with offline schedule viewing |
| **Personal Training** | Package creation, credit tracking, session scheduling, coach assignment |
| **External Rentals** | Booking calendar, coach profile, waiver digital sign, rental pricing, payment at booking |
| **Social Pipeline** | Lead capture form, lead status tracking, trial class scheduling, basic WA messaging |
| **Offline Support** | Attendance + schedule cached locally; queued sync when online; conflict resolution |

**V1 Technology Recommendations:**
- PWA (Progressive Web App) — single codebase for web + mobile
- Local database (IndexedDB/SQLite) for offline
- Sync engine: background sync with queue
- React/Next.js or Vue/Nuxt for frontend
- Supabase or Firebase backend (managed, scalable, good offline support)
- Arabic RTL: CSS logical properties + i18n library (react-intl / vue-i18n)

**V1 Non-Negotiables:**
- Arabic RTL must be complete, not partial
- Offline attendance MUST work from day 1
- Mobile-first UI (all screens tested on 375px width)
- QR check-in must work with zero internet

---

### V2 — GROWTH & ENGAGEMENT

| Module | V2 Additions |
|--------|-------------|
| **Core Gym Ops** | Medical & waiver management, notes & communication log, dynamic belt requirements (attendance-based auto-tracking) |
| **Classes & Schedule** | Class cancellation workflow, make-up credit tracking, waitlist management |
| **Billing & Finance** | Exchange rate auto-fetch, receipts with Lebanese tax formatting, outstanding balance alerts, Bob Finance integration |
| **Member Portal** | Package purchase online, belt progress view with visual roadmap, push notifications, waitlist join |
| **Personal Training** | Package purchase via portal, no-show/cancellation policy automation |
| **External Rentals** | Recurring rental booking, cancellation/refund policy |
| **Summer Camps/Events** | Full camp module: registration, payment, pickup authorization, daily attendance |
| **Social Pipeline** | Lead dashboard with conversion metrics, follow-up reminders, conversion rate tracking |
| **Integrations** | Push notifications, Bob Finance, exchange rate feed, email gateway |

---

### V3 — OPTIMIZATION & SCALE

| Module | V3 Additions |
|--------|-------------|
| **Core Gym Ops** | Student tags & segments, advanced analytics (churn prediction, attendance trends, revenue forecasting) |
| **Classes & Schedule** | Live class booking with real-time capacity, post-class recording & notes |
| **Billing & Finance** | Revenue reports & dashboards, automated collections, Lebanese e-invoicing compliance (when mandated) |
| **Member Portal** | In-app chat with coach, referral program with rewards |
| **Personal Training** | Client progress tracking per session, coach commission & payout reports |
| **External Rentals** | External coach payment processing (gym → coach), external coach's student management |
| **Social Pipeline** | Instagram DM ingestion via Meta API, automated nurture sequences, AI lead scoring |
| **Summer Camps/Events** | Camp curriculum builder with day-by-day planning, camp photo gallery |
| **Integrations** | Instagram Graph API, Google Calendar sync, Lebanese tax authority API |

---

## 8. Architecture Principles & Constraints

### Core Architectural Principles

```
1. OFFLINE-FIRST
  └─ Every critical operation MUST function without internet
  └─ Data syncs automatically when connectivity returns
  └─ Conflict resolution strategy: last-write-wins with server timestamp
  └─ Local storage: sufficient for 30 days of operation offline

2. MOBILE-FIRST
  └─ All interfaces designed for ≤375px width first, then scale up
  └─ Touch targets minimum 44×44px (Apple HIG)
  └─ No hover-dependent interactions
  └─ PWA with home screen install, splash screen, app-like feel

3. ARABIC-FIRST
  └─ Default language: Arabic
  └─ RTL layout is native, not bolted on
  └─ English available as secondary toggle
  └─ Dates in Arabic (هجري) optional, Gregorian default
  └─ All customer-facing communication in Arabic by default

4. SIMPLICITY OVER FEATURES
  └─ Each screen has ONE primary action
  └─ Coach attendance screen: open, see roster, tap to mark — 3 steps max
  └─ No nested menus beyond 2 levels
  └─ Non-technical users must succeed without training

5. DATA LOCALIZATION
  └─ Sensitive data stored in MENA-region servers if cloud-hosted
  └─ Lebanon has no GDPR equivalent, but design for data portability
  └─ All PII (personally identifiable info) encrypted at rest

6. CURRENCY INTEGRITY
  └─ Every monetary value stored with: USD amount, LBP amount, exchange rate, rate date
  └─ No implicit currency conversion — always explicit
  └─ Audit trail: who entered rate, when, at what value
```

### Technical Constraints

| Constraint | Impact | Solution |
|------------|--------|----------|
| Unreliable electricity | Devices may die mid-operation | Auto-save every 30s; state preserved in IndexedDB; resume exactly where left off |
| Slow/unreliable internet | Large payloads may fail | Delta sync (only changed records); compressed payloads; exponential backoff retry |
| Low-cost Android phones | Limited storage + RAM | Minimal dependencies; lightweight JS bundle; lazy-loaded modules; optimize for 2GB RAM devices |
| Non-technical users | High abandonment if complex | Onboarding wizard (3 steps max); tooltips on first use; no jargon in UI |
| Cash-heavy economy | Payment tracking must handle cash | Cash payments recorded with receipt number; clear audit trail; cash drawer reconciliation |
| WhatsApp as primary channel | Integration must be reliable | WhatsApp Cloud API with fallback to manual copy-paste messages if API down |
| Multiple disciplines | Rules vary per discipline | Discipline-specific config for belt hierarchies, class naming, rank requirements |

### Platform Non-Negotiables

```
✓ Arabic RTL is not a "nice to have" — it is the primary interface language
✓ Offline attendance is not a "future feature" — it ships in V1
✓ Dual-currency is not an afterthought — every value is dual-stored from day one
✓ Mobile-first is not negotiable — coaches will not use a desktop
✓ Simplicity is a feature — if a 55-year-old coach with a budget Android phone cannot use it, it fails
```

---

## Appendix A: Competitive Landscape Summary

*(From Agent #1 & #2 research)*

| Competitor | Strength | Gap vs. Proline Needs |
|------------|----------|----------------------|
| Mindbody | Market leader, rich features | No Arabic, no offline, no MENA payments, no martial arts belt engine |
| Zen Planner | MMA-friendly, belt tracking | No Arabic RTL, no Lebanon localization, no offline mode |
| Kicksite | Martial arts specific | English only, US-centric payments, no offline support |
| Vagaro | Affordable, multi-language | No Arabic, no offline, weak belt tracking, no MENA payments |
| RhinoFit | Simple, affordable | No Arabic, no belt engine, no Lebanon-specific features |

**Conclusion:** No existing platform combines Lebanese localization + offline-first + Arabic RTL + martial arts belt tracking + dual-currency billing. This is the market opportunity.

---

## Appendix B: Technology Stack Recommendations

| Layer | Recommendation | Rationale |
|-------|---------------|-----------|
| **Frontend** | React (Next.js) or Vue (Nuxt) | PWA support, SSR for initial load, mature i18n/RTL ecosystem |
| **UI Framework** | Custom with Tailwind CSS + RTL plugin | Lightweight, RTL-first CSS logical properties |
| **Offline DB** | IndexedDB (via Dexie.js) or SQLite (via sql.js) | Robust offline storage, sync-friendly |
| **Backend** | Supabase (PostgreSQL + REST/GraphQL) | Managed, real-time, row-level security, good offline/sync primitives |
| **Auth** | Supabase Auth or Clerk | Phone-based OTP auth (Arabic SMS), magic link for parents |
| **WA Integration** | WhatsApp Cloud API (Meta) | Official API, template management, no third-party risk |
| **Hosting** | Vercel/Netlify (frontend), Supabase Cloud (backend) | Edge deployment, global CDN, minimal DevOps |
| **Sync** | Background Sync API + Service Worker | PWA native sync capabilities; queue failed requests |

---

*Blueprint prepared by Agent #3 — Platform Architecture & Feature Set Design. For review and approval before implementation phase.*

