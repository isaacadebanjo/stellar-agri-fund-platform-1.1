// One-time / on-demand: reset the admin user's password.
//
//   cd backend
//   # set MONGODB_URI, ADMIN_EMAIL (optional, defaults below) and ADMIN_PASSWORD
//   node scripts/reset-admin-password.js
//
// The normal seed (config/seed.js) SKIPS users that already exist, so it can't
// rotate a password that's already in the DB (e.g. the legacy "admin123"). This
// script rehashes ADMIN_PASSWORD onto the existing admin — or creates the admin
// if it's missing. Requires MONGODB_URI and ADMIN_PASSWORD to be set.
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';

async function run() {
  const email = (process.env.ADMIN_EMAIL || 'admin@agri.io').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('[reset-admin] ADMIN_PASSWORD is not set — refusing to set an empty password.');
    process.exit(1);
  }

  await connectDB();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await User.findOne({ email });
  if (existing) {
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    await existing.save();
    console.log(`[reset-admin] password updated for existing admin: ${email}`);
  } else {
    await User.create({ email, passwordHash, role: 'admin' });
    console.log(`[reset-admin] created new admin: ${email}`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[reset-admin] failed:', err);
  process.exit(1);
});
