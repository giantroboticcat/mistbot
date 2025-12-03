#!/usr/bin/env node
import { existsSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * CLI script to create a new migration file
 */

const MIGRATIONS_DIR = join(process.cwd(), 'migrations');
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Error: Migration name is required\n');
  console.error('Usage: npm run migration:create -- "description of migration"');
  console.error('Example: npm run migration:create -- "add user settings table"\n');
  process.exit(1);
}

const description = args.join(' ');

// Sanitize the description for filename
const sanitized = description
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, '')
  .replace(/\s+/g, '_')
  .substring(0, 50);

try {
  // Find the next migration number
  let nextNumber = 1;
  
  if (existsSync(MIGRATIONS_DIR)) {
    const existingMigrations = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    if (existingMigrations.length > 0) {
      const lastMigration = existingMigrations[existingMigrations.length - 1];
      const lastNumber = parseInt(lastMigration.split('_')[0]);
      nextNumber = lastNumber + 1;
    }
  }
  
  // Format the number with leading zeros
  const paddedNumber = String(nextNumber).padStart(3, '0');
  const filename = `${paddedNumber}_${sanitized}.sql`;
  const filepath = join(MIGRATIONS_DIR, filename);
  
  // Create the migration file with a template
  const template = `-- Migration: ${description}
-- Created: ${new Date().toISOString()}

-- Write your migration SQL here
-- Example:
-- ALTER TABLE table_name ADD COLUMN column_name TEXT;
-- CREATE TABLE new_table (...);
-- CREATE INDEX idx_name ON table_name(column_name);
`;
  
  writeFileSync(filepath, template, 'utf-8');
  
  console.log('✅ Migration created successfully!\n');
  console.log(`   File: ${filename}`);
  console.log(`   Path: ${filepath}\n`);
  console.log('Next steps:');
  console.log('   1. Edit the migration file and add your SQL statements');
  console.log('   2. Test the migration: npm run migration:run');
  console.log('   3. Check status: npm run migration:status\n');
  
  process.exit(0);
  
} catch (error) {
  console.error('❌ Error creating migration:', error.message);
  process.exit(1);
}

