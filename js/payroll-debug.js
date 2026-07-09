/**
 * Payroll Menu Debug Tool
 * Gunakan untuk troubleshoot mengapa menu Payroll tidak muncul
 * 
 * Cara pakai di browser console:
 * debugPayrollMenu()
 */

export function debugPayrollMenu() {
  console.log('=== PAYROLL MENU DEBUG ===\n');

  if (!window.currentUser) {
    console.error('❌ User belum login');
    return;
  }

  const user = window.currentUser;
  
  // 1. Check Role
  console.log('1️⃣  USER ROLE');
  console.log(`   Role: ${user.role}`);
  const isValidRole = ['admin_all', 'admin_hr'].includes(user.role);
  console.log(`   ✓ Valid role? ${isValidRole ? '✅ YES' : '❌ NO'}`);
  if (!isValidRole) console.log(`   💡 Payroll hanya untuk admin_all atau admin_hr`);

  // 2. Check Package
  console.log('\n2️⃣  PACKAGE TYPE');
  const clientId = user.client_id;
  if (!clientId) {
    console.error('   ❌ User tidak assigned ke client');
  } else {
    // Ambil dari currentUser jika ada
    const packageType = user.clients?.package_type || user.package_type || 'basic';
    console.log(`   Package: ${packageType}`);
    const isValidPackage = ['standard', 'pro'].includes(String(packageType).toLowerCase());
    console.log(`   ✓ Valid package? ${isValidPackage ? '✅ YES' : '❌ NO'}`);
    if (!isValidPackage) console.log(`   💡 Payroll tersedia untuk paket Standard atau Pro`);
  }

  // 3. Check Client
  console.log('\n3️⃣  CLIENT ASSIGNMENT');
  console.log(`   Client ID: ${clientId || '❌ NOT ASSIGNED'}`);
  console.log(`   Client Name: ${user.clients?.nama_client || 'N/A'}`);

  // 4. Check canAccessPayroll function
  console.log('\n4️⃣  canAccessPayroll() CHECK');
  const canAccess = typeof window.canAccessPayroll === 'function' 
    ? window.canAccessPayroll(user)
    : 'Function not found';
  console.log(`   Result: ${canAccess ? '✅ TRUE' : '❌ FALSE'}`);

  // 5. Summary
  console.log('\n📋 SUMMARY');
  console.log(`Menu Payroll akan tampil jika: ${canAccess ? '✅ YES' : '❌ NO'}`);
  
  if (!canAccess) {
    console.log('\n🔧 SOLUSI:');
    if (!isValidRole) {
      console.log(`  1. Ubah role user menjadi admin_all atau admin_hr`);
    }
    if (user.clients && !['standard', 'pro'].includes(String(user.clients.package_type).toLowerCase())) {
      console.log(`  2. Upgrade package client ke Standard atau Pro`);
    }
    if (!clientId) {
      console.log(`  3. Assign user ke client di database`);
    }
  }
}

// Auto-export untuk debugging di console
window.debugPayrollMenu = debugPayrollMenu;
