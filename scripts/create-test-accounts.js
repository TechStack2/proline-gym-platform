/**
 * Create test accounts for all 7 roles in Proline Gym
 * Uses Supabase Admin API (service_role key) to create auth users,
 * then inserts profiles and user_roles directly into the database.
 *
 * Usage: node scripts/create-test-accounts.js
 */

const https = require('https');

// === CONFIGURATION ===
const SUPABASE_URL = 'https://ufpuebfkcpohwubrutff.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmcHVlYmZrY3BvaHd1YnJ1dGZmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDczODgzMSwiZXhwIjoyMDk2MzE0ODMxfQ.FsHn89d8A_RQs1NH3CXh5vuN7pjutITKuMpny499IUk';
const GYM_ID = 'b737047f-e1dc-4c23-a11f-9eb9187d242a';

const TEST_PASSWORD = 'ProlineTest2024!';

// === TEST ACCOUNTS ===
const testAccounts = [
  {
    phone: '+96170000001',
    password: TEST_PASSWORD,
    role: 'owner',
    first_name_ar: 'علي',
    first_name_en: 'Ali',
    first_name_fr: 'Ali',
    last_name_ar: 'حسن',
    last_name_en: 'Hassan',
    last_name_fr: 'Hassan',
    gender: 'male',
  },
  {
    phone: '+96170000002',
    password: TEST_PASSWORD,
    role: 'head_coach',
    first_name_ar: 'كريم',
    first_name_en: 'Karim',
    first_name_fr: 'Karim',
    last_name_ar: 'محمود',
    last_name_en: 'Mahmoud',
    last_name_fr: 'Mahmoud',
    gender: 'male',
  },
  {
    phone: '+96170000003',
    password: TEST_PASSWORD,
    role: 'coach',
    first_name_ar: 'سمير',
    first_name_en: 'Samir',
    first_name_fr: 'Samir',
    last_name_ar: 'نادر',
    last_name_en: 'Nader',
    last_name_fr: 'Nader',
    gender: 'male',
  },
  {
    phone: '+96170000004',
    password: TEST_PASSWORD,
    role: 'receptionist',
    first_name_ar: 'لينا',
    first_name_en: 'Lina',
    first_name_fr: 'Lina',
    last_name_ar: 'فارس',
    last_name_en: 'Fares',
    last_name_fr: 'Fares',
    gender: 'female',
  },
  {
    phone: '+96170000005',
    password: TEST_PASSWORD,
    role: 'student',
    first_name_ar: 'عمر',
    first_name_en: 'Omar',
    first_name_fr: 'Omar',
    last_name_ar: 'ديب',
    last_name_en: 'Deeb',
    last_name_fr: 'Deeb',
    gender: 'male',
  },
  {
    phone: '+96170000006',
    password: TEST_PASSWORD,
    role: 'parent',
    first_name_ar: 'رانيا',
    first_name_en: 'Rania',
    first_name_fr: 'Rania',
    last_name_ar: 'سعد',
    last_name_en: 'Saad',
    last_name_fr: 'Saad',
    gender: 'female',
  },
  {
    phone: '+96170000007',
    password: TEST_PASSWORD,
    role: 'external_coach',
    first_name_ar: 'نديم',
    first_name_en: 'Nadim',
    first_name_fr: 'Nadim',
    last_name_ar: 'خوري',
    last_name_en: 'Khoury',
    last_name_fr: 'Khoury',
    gender: 'male',
  },
];

// === HELPERS ===

function apiRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + path);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createAuthUser(account) {
  console.log(`  Creating auth user: ${account.first_name_en} (${account.phone})...`);

  const res = await apiRequest('POST', '/auth/v1/admin/users', {
    phone: account.phone,
    password: account.password,
    phone_confirm: true,
    email_confirm: true,
    user_metadata: {
      first_name: account.first_name_en,
      last_name: account.last_name_en,
      role: account.role,
    },
  });

  if (res.status === 200 || res.status === 201) {
    console.log(`    ✓ Auth user created: ${res.body.id}`);
    return res.body.id;
  }

  if (res.status === 422 && res.body?.msg?.includes('already been registered')) {
    console.log(`    ⚠ User already exists, fetching...`);
    // Try to look up existing user by phone
    const lookup = await apiRequest('GET', `/auth/v1/admin/users?phone=${encodeURIComponent(account.phone)}`);
    if (lookup.status === 200 && lookup.body?.users?.length > 0) {
      console.log(`    ✓ Found existing user: ${lookup.body.users[0].id}`);
      return lookup.body.users[0].id;
    }
    throw new Error(`User exists but could not find: ${JSON.stringify(res.body)}`);
  }

  throw new Error(`Failed to create user: ${res.status} ${JSON.stringify(res.body)}`);
}

async function upsertProfile(userId, account) {
  console.log(`  Upserting profile for ${account.first_name_en}...`);

  // Use upsert (INSERT ... ON CONFLICT)
  const res = await apiRequest('POST', '/rest/v1/profiles', {
    id: userId,
    gym_id: GYM_ID,
    first_name_ar: account.first_name_ar,
    first_name_en: account.first_name_en,
    first_name_fr: account.first_name_fr,
    last_name_ar: account.last_name_ar,
    last_name_en: account.last_name_en,
    last_name_fr: account.last_name_fr,
    phone: account.phone,
    gender: account.gender,
    locale: 'en',
    is_active: true,
  });

  // 201 = created, 409 = conflict (already exists, which is fine if it's there)
  if (res.status === 201) {
    console.log(`    ✓ Profile created`);
  } else if (res.status === 409) {
    console.log(`    ⚠ Profile already exists, updating...`);
    // Update existing profile
    const updRes = await apiRequest('PATCH', `/rest/v1/profiles?id=eq.${userId}`, {
      gym_id: GYM_ID,
      first_name_ar: account.first_name_ar,
      first_name_en: account.first_name_en,
      first_name_fr: account.first_name_fr,
      last_name_ar: account.last_name_ar,
      last_name_en: account.last_name_en,
      last_name_fr: account.last_name_fr,
      phone: account.phone,
      gender: account.gender,
      is_active: true,
    });
    if (updRes.status === 200 || updRes.status === 204) {
      console.log(`    ✓ Profile updated`);
    } else {
      console.log(`    ✗ Profile update failed: ${updRes.status} ${JSON.stringify(updRes.body)}`);
    }
  } else {
    console.log(`    ✗ Profile insert failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

async function upsertUserRole(userId, account) {
  console.log(`  Upserting user_role: ${account.role}...`);

  // Delete any existing role for this user in this gym first
  await apiRequest('DELETE', `/rest/v1/user_roles?user_id=eq.${userId}&gym_id=eq.${GYM_ID}`);

  // Insert new role
  const res = await apiRequest('POST', '/rest/v1/user_roles', {
    user_id: userId,
    gym_id: GYM_ID,
    role: account.role,
    is_primary: true,
  });

  if (res.status === 201) {
    console.log(`    ✓ User role created: ${account.role}`);
  } else {
    console.log(`    ✗ User role insert failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

// For student role, also create a students row
async function createStudentRecord(userId, account) {
  if (account.role !== 'student') return;

  console.log(`  Creating student record...`);

  // Check if student already exists
  const checkRes = await apiRequest('GET', `/rest/v1/students?profile_id=eq.${userId}`);
  if (checkRes.status === 200 && checkRes.body?.length > 0) {
    console.log(`    ⚠ Student record already exists, skipping`);
    return;
  }

  const res = await apiRequest('POST', '/rest/v1/students', {
    profile_id: userId,
    gym_id: GYM_ID,
    join_date: new Date().toISOString().split('T')[0],
    is_active: true,
  });

  if (res.status === 201) {
    console.log(`    ✓ Student record created`);
  } else {
    console.log(`    ✗ Student record failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

// For coach/external_coach/head_coach roles, also create a coaches row
async function createCoachRecord(userId, account) {
  if (!['coach', 'head_coach', 'external_coach'].includes(account.role)) return;

  console.log(`  Creating coach record...`);

  const checkRes = await apiRequest('GET', `/rest/v1/coaches?profile_id=eq.${userId}`);
  if (checkRes.status === 200 && checkRes.body?.length > 0) {
    console.log(`    ⚠ Coach record already exists, skipping`);
    return;
  }

  const coachType = account.role === 'external_coach' ? 'external' : 'staff';

  const res = await apiRequest('POST', '/rest/v1/coaches', {
    profile_id: userId,
    gym_id: GYM_ID,
    coach_type: coachType,
    is_active: true,
    hire_date: new Date().toISOString().split('T')[0],
  });

  if (res.status === 201) {
    console.log(`    ✓ Coach record created (${coachType})`);
  } else {
    console.log(`    ✗ Coach record failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

// === MAIN ===
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  Proline Gym — Test Account Creator          ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`\nGym ID: ${GYM_ID}`);
  console.log(`Password for all accounts: ${TEST_PASSWORD}\n`);

  let successCount = 0;
  let failCount = 0;

  for (const account of testAccounts) {
    console.log(`\n── ${account.first_name_en} ${account.last_name_en} (${account.role}) ──`);

    try {
      // Step 1: Create auth user
      const userId = await createAuthUser(account);

      // Step 2: Create/update profile
      await upsertProfile(userId, account);

      // Step 3: Create/update user role
      await upsertUserRole(userId, account);

      // Step 4: Create role-specific records
      await createStudentRecord(userId, account);
      await createCoachRecord(userId, account);

      console.log(`  ✅ ${account.first_name_en} ${account.last_name_en} — DONE`);
      successCount++;
    } catch (err) {
      console.log(`  ❌ FAILED: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  Results: ${successCount} succeeded, ${failCount} failed`);
  console.log(`═══════════════════════════════════════════════\n`);

  if (successCount > 0) {
    console.log('📋 Test Account Credentials:');
    console.log('───────────────────────────────────────────────');
    for (const account of testAccounts) {
      console.log(`  ${account.first_name_en} ${account.last_name_en}:`);
      console.log(`    Role: ${account.role}`);
      console.log(`    Phone: ${account.phone}`);
      console.log(`    Password: ${TEST_PASSWORD}`);
      console.log();
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
