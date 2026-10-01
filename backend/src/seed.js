// Creates the first admin account.
// Usage: node src/seed.js <email> <name> <password>
import { createStore } from './db/index.js';
import { hashPassword } from './utils/crypto.js';
import { DEFAULT_ENQUIRY_TYPES } from './utils/constants.js';

const [email, name, password] = process.argv.slice(2);

if (!email || !name || !password) {
  console.error('Usage: node src/seed.js <email> <name> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const store = createStore();
store.init();
store.seedEnquiryTypes(DEFAULT_ENQUIRY_TYPES);

if (store.findAdminByEmail(email)) {
  console.error(`An admin with email ${email} already exists.`);
  process.exit(1);
}

store.createAdmin({ email, name, passwordHash: hashPassword(password) });
console.log(`Admin created: ${email}`);
store.close();
