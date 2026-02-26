import fs from 'fs';
const path = 'src/components/SaveDesignModal.tsx';
let content = fs.readFileSync(path, 'utf8');
// Loose regex that allows any amount of whitespace
const regex = /\|\|\s*displayType\s*===\s*['"]ai_recognition['"]\s*\?\s*['"]grid-cols-1['"]\s*:\s*['"]grid-cols-3['"]/;

if (regex.test(content)) {
    content = content.replace(regex, "? 'grid-cols-1' : 'grid-cols-3'");
    fs.writeFileSync(path, content, 'utf8');
    console.log('Successfully patched with regex!');
} else {
    console.log('Regex match failed!');
    // Let's print a small chunk around line 1666 to debug
    const lines = content.split('\n');
    console.log('Line 1666 context:');
    console.log(lines.slice(1663, 1668).join('\n'));
    process.exit(1);
}
