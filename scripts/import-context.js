#!/usr/bin/env node

/**
 * TWOtails Context Importer
 * Import project context from another AI tool
 */

const fs = require('fs');
const path = require('path');

function importContext(sourceDir, targetDir) {
  console.log(`\nImporting context from: ${sourceDir}`);
  console.log(`Importing to: ${targetDir}\n`);

  // Files to import
  const filesToImport = [
    'CONTEXT.md',
    'TODO.md',
    'DECISIONS.md',
    'PROGRESS.md',
    '.ai-context/project.md',
    '.ai-context/tech-stack.md',
    '.ai-context/files.md',
    '.ai-context/issues.md'
  ];

  let imported = 0;

  filesToImport.forEach(file => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (fs.existsSync(sourcePath)) {
      // Create directory if needed
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Copy file
      fs.copyFileSync(sourcePath, targetPath);
      console.log(`✅ Imported: ${file}`);
      imported++;
    }
  });

  if (imported === 0) {
    console.log('❌ No context files found in source directory');
    console.log('   Make sure you exported context first:');
    console.log('   node scripts/export-context.js /path/to/project');
    return;
  }

  console.log(`\n📋 Imported ${imported} files`);
  console.log('\n🚀 To continue in new AI tool, say:');
  console.log('   "Read CONTEXT.md and continue where we left off"');
}

// Run if called directly
if (require.main === module) {
  const source = process.argv[2];
  const target = process.argv[3] || './';

  if (!source) {
    console.log('Usage: node import-context.js <source-dir> [target-dir]');
    console.log('Example: node import-context.js ~/old-project ~/new-project');
    process.exit(1);
  }

  importContext(path.resolve(source), path.resolve(target));
}

module.exports = { importContext };
